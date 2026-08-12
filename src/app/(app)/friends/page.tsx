import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { friendSummaries } from "@/lib/friends";
import { PageTitle } from "@/components/page-title";
import { FriendsPanel } from "@/components/friends-panel";
import { SharingControls } from "@/components/sharing-controls";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [friends, incoming, outgoing] = await Promise.all([
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
  ]);

  return (
    <>
      <PageTitle>Friends</PageTitle>
      <p className="mt-2 text-sm text-ink-muted">
        Cheer each other on. You choose what they see.
      </p>

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
