"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notifyFriendActivity } from "@/lib/push";
import type { FriendResult } from "@/app/actions/friends";

const messageSchema = z.object({
  friendId: z.string().min(1),
  body: z.string().trim().min(1, "Say something.").max(500),
});

/** The friendship row, or null — the friends-only check every chat action
 *  shares. Scoped to the caller, so a forged friend id matches nothing. */
async function friendshipWith(meId: string, friendId: string) {
  return prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: meId, addresseeId: friendId },
        { requesterId: friendId, addresseeId: meId },
      ],
    },
  });
}

export async function sendMessageAction(
  _prev: FriendResult,
  formData: FormData,
): Promise<FriendResult> {
  const me = await requireUser();

  const parsed = messageSchema.safeParse({
    friendId: formData.get("friendId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const link = await friendshipWith(me.id, parsed.data.friendId);
  if (!link) return { ok: false, error: "You are not friends with them." };

  await prisma.message.create({
    data: { friendshipId: link.id, senderId: me.id, body: parsed.data.body },
  });

  await notifyFriendActivity(parsed.data.friendId, {
    title: `${me.name} says`,
    body: parsed.data.body,
    // The recipient's chat with the sender lives at the sender's id.
    url: `/friends/${me.id}`,
    // Tagged per conversation — the opposite of the old notes' choice, on
    // purpose: a burst of chat messages should collapse to one banner
    // showing the latest, not stack five cards.
    tag: `chat-${link.id}`,
    at: Date.now(),
  });

  revalidatePath(`/friends/${parsed.data.friendId}`);
  revalidatePath("/friends");
  return { ok: true };
}

export async function markChatReadAction(friendshipId: string): Promise<void> {
  const me = await requireUser();
  // Scoped twice: to a friendship I am one end of, and to messages I did not
  // send — nobody marks someone else's inbox.
  await prisma.message.updateMany({
    where: {
      friendshipId,
      readAt: null,
      senderId: { not: me.id },
      friendship: {
        OR: [{ requesterId: me.id }, { addresseeId: me.id }],
      },
    },
    data: { readAt: new Date() },
  });
  revalidatePath("/friends");
}

export async function clearChatAction(friendId: string): Promise<FriendResult> {
  const me = await requireUser();
  const now = new Date();

  // The meal-sharing pattern: which column is yours depends on which end of
  // the row you are, so two scoped updateManys and their combined count is
  // the existence check.
  const [asRequester, asAddressee] = await Promise.all([
    prisma.friendship.updateMany({
      where: { status: "accepted", requesterId: me.id, addresseeId: friendId },
      data: { requesterClearedAt: now },
    }),
    prisma.friendship.updateMany({
      where: { status: "accepted", requesterId: friendId, addresseeId: me.id },
      data: { addresseeClearedAt: now },
    }),
  ]);
  if (asRequester.count + asAddressee.count === 0) {
    return { ok: false, error: "No such friend." };
  }

  // Cleared messages are invisible, and an invisible unread is a phantom
  // badge nothing can ever clear — so clearing also marks incoming read.
  const link = await friendshipWith(me.id, friendId);
  if (link) {
    await prisma.message.updateMany({
      where: { friendshipId: link.id, readAt: null, senderId: { not: me.id } },
      data: { readAt: now },
    });
  }

  revalidatePath(`/friends/${friendId}`);
  revalidatePath("/friends");
  return { ok: true };
}
