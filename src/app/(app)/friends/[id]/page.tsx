import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { formatMomentIn } from "@/lib/dates";
import { Chat } from "@/components/chat";

export const dynamic = "force-dynamic";

/** One conversation, full screen. `id` is the FRIEND's user id — the card on
 *  /friends links here, and the push deep-link uses the sender's id. */
export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await currentUser();
  if (!me) redirect("/login");

  const link = await prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: me.id, addresseeId: id },
        { requesterId: id, addresseeId: me.id },
      ],
    },
    include: {
      requester: { select: { id: true, name: true, shareWeight: true } },
      addressee: { select: { id: true, name: true, shareWeight: true } },
    },
  });
  // Not friends (or a forged id): nothing to show. Back to the list.
  if (!link) redirect("/friends");

  const friend = link.requesterId === me.id ? link.addressee : link.requester;
  const myClearedAt =
    link.requesterId === me.id ? link.requesterClearedAt : link.addresseeClearedAt;

  const [messages, lastTwo] = await Promise.all([
    prisma.message.findMany({
      where: {
        friendshipId: link.id,
        ...(myClearedAt ? { createdAt: { gt: myClearedAt } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    // Only to pick which quick chips to offer; nothing renders the number.
    friend.shareWeight
      ? prisma.weightEntry.findMany({
          where: { userId: friend.id },
          orderBy: { date: "desc" },
          take: 2,
          select: { weightLbs: true },
        })
      : Promise.resolve([]),
  ]);
  messages.reverse();

  const changeLbs =
    lastTwo.length === 2 ? lastTwo[0].weightLbs - lastTwo[1].weightLbs : null;

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <Link href="/friends" className="eyebrow shrink-0">
          ‹ Friends
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center font-bold">
          {friend.name}
        </h1>
        {/* Balanced spacer so the name centres; Clear lives in <Chat>. */}
        <span className="eyebrow invisible shrink-0">‹ Friends</span>
      </div>

      <Chat
        friendId={friend.id}
        friendName={friend.name}
        friendshipId={link.id}
        changeLbs={changeLbs}
        hasUnread={messages.some((m) => m.senderId === friend.id && !m.readAt)}
        messages={messages.map((m) => ({
          id: m.id,
          body: m.body,
          mine: m.senderId === me.id,
          at: formatMomentIn(m.createdAt.toISOString(), me.timezone),
        }))}
      />
    </>
  );
}
