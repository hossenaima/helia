"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, toHandle } from "@/lib/auth";
import { notifyFriendActivity } from "@/lib/push";

export type FriendResult = { ok: boolean; error?: string; message?: string };

/**
 * Send a request. Nothing is shared until the other person accepts — you do not
 * get to opt someone else into showing you their weight.
 */
export async function requestFriendAction(
  _prev: FriendResult,
  formData: FormData,
): Promise<FriendResult> {
  const me = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Who do you want to add?" };

  const them = await prisma.user.findUnique({
    where: { handle: toHandle(name) },
  });
  // One message whether or not they exist, so this cannot be used to discover
  // who has an account here.
  const vague = {
    ok: false,
    error: `Could not send an invite to "${name}". Check the spelling with them.`,
  };
  if (!them) return vague;
  if (them.id === me.id) return { ok: false, error: "That is you." };

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: me.id, addresseeId: them.id },
        { requesterId: them.id, addresseeId: me.id },
      ],
    },
  });

  if (existing?.status === "accepted") {
    return { ok: false, error: `You and ${them.name} are already friends.` };
  }
  if (existing?.requesterId === me.id) {
    return { ok: false, error: `You already asked ${them.name}.` };
  }
  // They asked first — treat this as accepting rather than creating a mirror.
  if (existing) {
    await prisma.friendship.update({
      where: { id: existing.id },
      data: { status: "accepted", respondedAt: new Date() },
    });
    revalidatePath("/friends");
    return { ok: true, message: `${them.name} had already asked — you are friends now.` };
  }

  await prisma.friendship.create({
    data: { requesterId: me.id, addresseeId: them.id },
  });

  // The title is the line that gets read on a locked phone, so it carries who
  // rather than what kind. "Friend request" over "Aima wants to be friends"
  // spent the loudest line saying nothing.
  await notifyFriendActivity(them.id, {
    title: `${me.name} wants to be friends`,
    body: "Tap to accept or ignore.",
    url: "/friends",
    tag: "friend-request",
    at: Date.now(),
  });

  revalidatePath("/friends");
  return { ok: true, message: `Invite sent to ${them.name}.` };
}

export async function respondToRequestAction(formData: FormData) {
  const me = await requireUser();

  const id = String(formData.get("id") ?? "");
  const accept = formData.get("accept") === "1";
  if (!id) return;

  // Scoped to the addressee: only the person who was asked can answer.
  const request = await prisma.friendship.findFirst({
    where: { id, addresseeId: me.id, status: "pending" },
  });
  if (!request) return;

  if (accept) {
    await prisma.friendship.update({
      where: { id },
      data: { status: "accepted", respondedAt: new Date() },
    });
  } else {
    await prisma.friendship.delete({ where: { id } });
  }

  revalidatePath("/friends");
}

export async function removeFriendAction(formData: FormData) {
  const me = await requireUser();

  const otherId = String(formData.get("otherId") ?? "");
  if (!otherId) return;

  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: me.id, addresseeId: otherId },
        { requesterId: otherId, addresseeId: me.id },
      ],
    },
  });

  revalidatePath("/friends");
}

const encouragementSchema = z.object({
  toId: z.string().min(1),
  body: z.string().trim().min(1, "Say something.").max(200),
});

export async function sendEncouragementAction(
  _prev: FriendResult,
  formData: FormData,
): Promise<FriendResult> {
  const me = await requireUser();

  const parsed = encouragementSchema.safeParse({
    toId: formData.get("toId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Only to an accepted friend — this is not a way to message strangers.
  const friends = await prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: me.id, addresseeId: parsed.data.toId },
        { requesterId: parsed.data.toId, addresseeId: me.id },
      ],
    },
  });
  if (!friends) return { ok: false, error: "You are not friends with them." };

  await prisma.encouragement.create({
    data: { fromId: me.id, toId: parsed.data.toId, body: parsed.data.body },
  });

  await notifyFriendActivity(parsed.data.toId, {
    title: `${me.name} says`,
    body: parsed.data.body,
    url: "/friends",
    // Not tagged per-sender: a second note should not silently replace the
    // first one sitting unread in the tray.
    tag: `note-${Date.now()}`,
    at: Date.now(),
  });

  revalidatePath("/friends");
  return { ok: true, message: "Sent." };
}

export async function markEncouragementsReadAction() {
  const me = await requireUser();
  await prisma.encouragement.updateMany({
    where: { toId: me.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/friends");
}

/** Whether your weigh-ins are visible. One setting for every friend — the
 *  number is the same number whoever is looking. Food is per-friend; see
 *  `setMealSharingAction`. */
export async function setSharingAction(input: {
  shareWeight?: boolean;
}): Promise<FriendResult> {
  const me = await requireUser();
  if (typeof input.shareWeight !== "boolean") return { ok: true };

  await prisma.user.update({
    where: { id: me.id },
    data: { shareWeight: input.shareWeight },
  });
  revalidatePath("/friends");
  return { ok: true };
}

/**
 * Whether one particular friend sees your food.
 *
 * Which column to write depends on which end of the friendship row you are, so
 * the update is scoped by `requesterId`/`addresseeId` naming *you* — that is
 * both how the right column gets picked and how a forged id cannot flip
 * somebody else's flag. A stranger's id simply matches no row.
 */
export async function setMealSharingAction(input: {
  friendId: string;
  share: boolean;
}): Promise<FriendResult> {
  const me = await requireUser();

  // Two statements rather than one, because the column depends on which side
  // you are and `updateMany` cannot choose per row. At most one matches, and
  // their combined count is the existence check — an id that is not actually
  // your friend updates nothing and is reported as such.
  const [asRequester, asAddressee] = await Promise.all([
    prisma.friendship.updateMany({
      where: {
        status: "accepted",
        requesterId: me.id,
        addresseeId: input.friendId,
      },
      data: { requesterSharesMeals: input.share },
    }),
    prisma.friendship.updateMany({
      where: {
        status: "accepted",
        requesterId: input.friendId,
        addresseeId: me.id,
      },
      data: { addresseeSharesMeals: input.share },
    }),
  ]);
  if (asRequester.count + asAddressee.count === 0) {
    return { ok: false, error: "No such friend." };
  }

  revalidatePath("/friends");
  return { ok: true };
}
