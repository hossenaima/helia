import "server-only";

import webpush from "web-push";
import { prisma } from "@/lib/db";

/**
 * Sending a push. Endpoints go stale constantly — a browser reinstall, a
 * revoked permission — so a 404 or 410 means "forget this device", not "retry".
 */

let configured = false;

function configure(): boolean {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:noreply@example.com",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** When the thing being notified about happened. A push delivered late
   *  otherwise timestamps itself late in the tray. */
  at?: number;
};

export async function pushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  if (!configure()) return { sent: 0, pruned: 0 };

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          dead.push(sub.endpoint);
        } else {
          // Anything else is a real fault — a bad key, a push service outage.
          // Logged, because a reminder that never arrives leaves no other trace.
          console.error("push failed", status, error);
        }
      }
    }),
  );

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: dead } },
    });
  }

  return { sent, pruned: dead.length };
}

/**
 * Notify someone about friend activity, if they asked to hear about it.
 *
 * Deliberately fire-and-forget: a push service being slow or down is not a
 * reason for the request or the note itself to fail, so this never throws
 * into the caller.
 */
export async function notifyFriendActivity(
  toId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const to = await prisma.user.findUnique({
      where: { id: toId },
      select: { notifyFriends: true },
    });
    if (!to?.notifyFriends) return;
    await pushToUser(toId, payload);
  } catch (error) {
    console.error("friend notification failed", error);
  }
}
