import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { formatMomentIn } from "@/lib/dates";
import { Chat, ClearChat } from "@/components/chat";

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
      // No avatar here on purpose: the chat header shows only the name
      // (owner's call, 2026-08-12), and the ~15KB data URL would otherwise
      // ride in every 12-second poll's payload.
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
      {/* Sticky flush under the app header so the way out of a long,
          auto-scrolled chat is never off-screen. top-[3.75rem] is the
          header's rendered height (py-4 + one text-lg line = 60px) — the
          4.5rem it once used was scroll-padding, not the header, and left a
          12px band of messages showing through. -mt-7 cancels main's pt-7
          for the same reason: this row belongs to the chrome, not the page.
          bg-ground + the negative margin/padding pair mirrors main's
          px-5/md:px-6 so the surface covers edge-to-edge. */}
      {/* Name only, truly centred: both side slots are flex-1, so the title
          sits at the optical centre regardless of "‹ Friends" and "Clear"
          being different widths. No avatar here — the owner's call
          (2026-08-12): the conversation is about the words, and the face is
          one tap back on the card. */}
      <div className="sticky top-[3.75rem] z-10 -mx-5 -mt-7 flex items-center justify-between gap-3 bg-ground px-5 py-2 md:-mx-6 md:px-6">
        <div className="flex flex-1 justify-start">
          <Link href="/friends" className="eyebrow shrink-0">
            ‹ Friends
          </Link>
        </div>
        <h1 className="min-w-0 shrink truncate text-center font-bold">
          {friend.name}
        </h1>
        <div className="flex flex-1 justify-end">
          <ClearChat friendId={friend.id} friendName={friend.name} />
        </div>
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
