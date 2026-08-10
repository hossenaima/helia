import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { friendSummaries, noteCutoff, NOTE_TTL_HOURS } from "@/lib/friends";
import { formatMomentIn } from "@/lib/dates";
import { PageTitle } from "@/components/page-title";
import { FriendsPanel } from "@/components/friends-panel";
import { SharingControls } from "@/components/sharing-controls";
import { Encouragements } from "@/components/encouragements";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [friends, incoming, outgoing, notes] = await Promise.all([
    friendSummaries(user.id),
    prisma.friendship.findMany({
      where: { addresseeId: user.id, status: "pending" },
      include: { requester: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendship.findMany({
      where: { requesterId: user.id, status: "pending" },
      include: { addressee: { select: { name: true } } },
    }),
    // Read more than 12 hours ago is gone. Filtered rather than trusted to a
    // sweep, so the moment it expires is the moment it stops being shown.
    prisma.encouragement.findMany({
      where: {
        toId: user.id,
        OR: [{ readAt: null }, { readAt: { gt: noteCutoff() } }],
      },
      include: { from: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <>
      <PageTitle>Friends</PageTitle>
      <p className="mt-2 text-sm text-ink-muted">
        Cheer each other on. You choose what they see.
      </p>

      <Encouragements
        notes={notes.map((n) => ({
          id: n.id,
          from: n.from.name,
          body: n.body,
          unread: n.readAt === null,
          at: formatMomentIn(n.createdAt.toISOString(), user.timezone),
          // Null while unread — the countdown has not started yet.
          expiresAt: n.readAt
            ? n.readAt.getTime() + NOTE_TTL_HOURS * 60 * 60 * 1000
            : null,
        }))}
        ttlHours={NOTE_TTL_HOURS}
      />

      <FriendsPanel
        friends={friends}
        incoming={incoming.map((r) => ({ id: r.id, name: r.requester.name }))}
        outgoing={outgoing.map((r) => ({ id: r.id, name: r.addressee.name }))}
        units={user.units}
      />

      <SharingControls
        shareWeight={user.shareWeight}
        friendCount={friends.length}
      />
    </>
  );
}
