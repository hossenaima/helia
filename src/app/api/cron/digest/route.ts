import { NextResponse, type NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { addDays, todayIn } from "@/lib/dates";
import { buildDigest } from "@/lib/digest";
import {
  digestSubject,
  renderDigestHtml,
  renderDigestText,
} from "@/lib/digest-email";

/**
 * The weekly digest sweep.
 *
 * Called hourly alongside the reminder one — "Monday morning" is a different
 * instant in every timezone, so a single daily run could only ever serve one.
 * Each pass sends to accounts for whom it is currently Monday, at their chosen
 * reminder hour, who have opted in, and who have not already had this week's.
 *
 * `lastDigestOn` holds the week key already sent, which is what makes an
 * at-least-once scheduler safe: calling this repeatedly is by design.
 *
 * `?preview=<username>` renders one account's digest as HTML and returns it
 * **without sending anything**, so the thing can be looked at before it lands
 * in seven inboxes. Still behind CRON_SECRET — it is somebody's weight data.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const preview = request.nextUrl.searchParams.get("preview");
  if (preview) {
    const user = await prisma.user.findFirst({
      where: { OR: [{ username: preview }, { handle: preview }] },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "no such account" }, { status: 404 });
    }
    const digest = await buildDigest(user.id);
    if (!digest) {
      return NextResponse.json(
        { error: "no email on that account" },
        { status: 400 },
      );
    }
    return new NextResponse(renderDigestHtml(digest), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const transport = mailer();
  if (!transport) {
    return NextResponse.json(
      { error: "no GMAIL_USER / GMAIL_APP_PASSWORD configured" },
      { status: 503 },
    );
  }

  /**
   * `?send=<username>` delivers one account's digest immediately, ignoring the
   * Monday-at-your-hour gate. The counterpart of `--only` on the announce
   * script: a preview shows the layout, only a real send shows what the mail
   * client does with it.
   *
   * It deliberately does **not** set `lastDigestOn`. That column is the
   * scheduler's bookkeeping, and a manual test writing to it would silently
   * cancel the next real digest for that person.
   */
  const one = request.nextUrl.searchParams.get("send");
  if (one) {
    const target = await prisma.user.findFirst({
      where: { OR: [{ username: one }, { handle: one }] },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "no such account" }, { status: 404 });
    }
    const digest = await buildDigest(target.id);
    if (!digest) {
      return NextResponse.json({ error: "no email on file" }, { status: 400 });
    }
    await transport.sendMail({
      from: `Helia <${process.env.GMAIL_USER}>`,
      to: digest.email,
      subject: digestSubject(digest),
      text: renderDigestText(digest),
      html: renderDigestHtml(digest),
    });
    return NextResponse.json({ sent: 1, to: digest.email, empty: digest.empty });
  }

  const now = new Date();
  const candidates = await prisma.user.findMany({
    where: { notifyDigest: true, email: { not: null } },
    select: {
      id: true,
      timezone: true,
      reminderHour: true,
      lastDigestOn: true,
    },
  });

  const sent: string[] = [];
  const skipped: string[] = [];

  for (const candidate of candidates) {
    const today = todayIn(candidate.timezone);
    const localHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: candidate.timezone,
        hour: "numeric",
        hour12: false,
      }).format(now),
    );

    // Monday only, at the hour they already chose for reminders — one fewer
    // setting to answer, and it is the hour they have said they want to hear
    // from this app.
    const isMonday =
      new Date(`${today}T00:00:00Z`).getUTCDay() === 1 &&
      localHour === candidate.reminderHour;
    if (!isMonday) continue;

    // The week that just ended: the seven days up to yesterday.
    const weekKey = addDays(today, -7);
    if (candidate.lastDigestOn === weekKey) continue;

    const digest = await buildDigest(candidate.id);
    // Nothing logged all week. An empty digest is a nag, not a summary, and
    // the person it would reach is the one most likely to unsubscribe.
    if (!digest || digest.empty) {
      skipped.push(candidate.id);
      // Still marked, so the next pass this hour does not retry all week.
      await prisma.user.update({
        where: { id: candidate.id },
        data: { lastDigestOn: weekKey },
      });
      continue;
    }

    try {
      await transport.sendMail({
        from: `Helia <${process.env.GMAIL_USER}>`,
        to: digest.email,
        subject: digestSubject(digest),
        text: renderDigestText(digest),
        html: renderDigestHtml(digest),
      });
      await prisma.user.update({
        where: { id: candidate.id },
        data: { lastDigestOn: weekKey },
      });
      sent.push(digest.name);
    } catch (error) {
      // One bad address must not stop the sweep. Not marked, so the next hour
      // tries again — which is safe precisely because lastDigestOn was not set.
      console.error("digest failed", digest.email, error);
    }
  }

  return NextResponse.json({ sent: sent.length, skipped: skipped.length, sent_to: sent });
}

function mailer() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

// Reads the session-free database and sends mail; nothing here may be cached.
export const dynamic = "force-dynamic";
