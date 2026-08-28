import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { addDays, dayKeyIn, isValidTimezone, todayIn } from "@/lib/dates";
import { pushToUser } from "@/lib/push";
import { frozenDays, weighInStreak } from "@/lib/calendar";

/**
 * Reminder sweep. Meant to be called every hour — see `.github/workflows` —
 * because "8am" is a different instant for every account, so a once-a-day
 * schedule could only ever serve one timezone.
 *
 * Safe to call as often as anything likes. Each pass sends only to people
 * whose chosen local hour it currently is, who have not already logged, and
 * who have not already been reminded today. Every scheduler that can reach
 * this route is at-least-once, so that last condition is what stands between
 * a retry and a second buzz in someone's pocket.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Chat retention: 90 days, decided 2026-08-12. "Clear chat" only hides;
  // this is where messages actually die.
  const { count: messagesPurged } = await prisma.message.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } },
  });

  const candidates = await prisma.user.findMany({
    where: { notifyWeighIn: true, pushSubscriptions: { some: {} } },
    select: {
      id: true,
      timezone: true,
      reminderHour: true,
      lastRemindedOn: true,
    },
  });

  let notified = 0;
  let skippedAlreadyLogged = 0;
  let skippedAlreadySent = 0;
  let skippedFrozen = 0;

  for (const user of candidates) {
    const zone = isValidTimezone(user.timezone) ? user.timezone : "UTC";
    const localHour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        hour12: false,
      }).format(now),
    );
    if (localHour !== user.reminderHour) continue;

    const today = dayKeyIn(now, zone);
    if (user.lastRemindedOn === today) {
      skippedAlreadySent++;
      continue;
    }

    // Recent days rather than just today's row: the same read answers "have
    // they logged?" and "what is their streak?", and the reminder is worth more
    // when it can say what is actually at stake.
    const [recent, freezes] = await Promise.all([
      prisma.weightEntry.findMany({
        where: { userId: user.id },
        orderBy: { date: "desc" },
        take: 60,
        select: { date: true, source: true },
      }),
      prisma.streakFreeze.findMany({
        where: { userId: user.id, endDate: { gte: addDays(today, -60) } },
        select: { startDate: true, endDate: true },
      }),
    ]);
    if (recent.some((r) => r.date === today)) {
      skippedAlreadyLogged++;
      continue;
    }
    // Someone who told us they are away does not need to be told they missed a
    // day. Deliberately before `lastRemindedOn` is written, so nothing about
    // the freeze changes what happens the morning they are back.
    if (frozenDays(freezes).has(today)) {
      skippedFrozen++;
      continue;
    }

    const streak = weighInStreak(recent, freezes, today).current;

    const result = await pushToUser(user.id, {
      title: "Morning weigh-in",
      // Naming the streak gives the notification something to be about. A
      // generic nudge is the same sentence every morning, which is how a
      // reminder turns into wallpaper.
      body:
        streak > 0
          ? `${streak} day${streak === 1 ? "" : "s"} in a row so far — a few seconds keeps it going.`
          : "A few seconds now and today is on the board.",
      url: "/",
      tag: "weigh-in",
      at: now.getTime(),
    });
    if (result.sent > 0) {
      notified++;
      await prisma.user.update({
        where: { id: user.id },
        data: { lastRemindedOn: today },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: candidates.length,
    notified,
    skippedAlreadyLogged,
    skippedAlreadySent,
    skippedFrozen,
    messagesPurged,
    at: todayIn("UTC"),
  });
}
