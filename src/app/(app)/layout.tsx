import { redirect } from "next/navigation";
import { currentUser, hasAnyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Nav } from "@/components/nav";
import { NotificationBell } from "@/components/notification-bell";
import { PushProvider } from "@/lib/use-push";
import { TimezoneSync } from "@/components/timezone-sync";

export const dynamic = "force-dynamic";

/**
 * Everything behind the password shares this frame.
 *
 * The header and the tab bar live here rather than inside each page, which is
 * what makes switching tabs feel like switching tabs: they stay mounted, so a
 * tap only swaps the content below them. When they were part of every page,
 * every navigation tore down the whole chrome and rebuilt it, and the tab you
 * pressed stayed unlit until the server answered.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  // The count only decides where to send a stranger, so it stays off the path
  // of every request from someone already signed in.
  if (!user) redirect((await hasAnyUser()) ? "/login" : "/signup");

  // The one choke point for the username/password upgrade. Gating it here
  // rather than at sign-in is what catches the 90-day sessions: an account
  // that has not signed in since before /setup existed is already inside the
  // app, and would never pass through a login-time check.
  if (!user.setupComplete) redirect("/setup");

  // A cheer nobody notices is a cheer that did not happen, and Friends is the
  // one tab with something that arrives while you are elsewhere.
  const [requests, unread] = await Promise.all([
    prisma.friendship.count({
      where: { addresseeId: user.id, status: "pending" },
    }),
    // Unread chat, not unread notes. No cleared-at filter needed: clearing a
    // chat also marks its incoming messages read, so readAt is the whole truth.
    prisma.message.count({
      where: {
        readAt: null,
        senderId: { not: user.id },
        friendship: {
          status: "accepted",
          OR: [{ requesterId: user.id }, { addresseeId: user.id }],
        },
      },
    }),
  ]);

  return (
    <PushProvider>
      <TimezoneSync current={user.timezone} />

      <header className="sticky top-0 z-20 glass !rounded-none !shadow-none md:bg-transparent md:backdrop-blur-none">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-4 md:px-6">
          <span className="font-cond text-lg font-bold tracking-tight">
            Helia
          </span>
          <div className="flex min-w-0 items-center gap-3">
            {/* Whose log this is — the app holds more than one. Stated, not
                emphasised: it is context, not an action. */}
            <span className="min-w-0 truncate text-sm text-ink-muted">
              {user.name}
            </span>
            {/* Signing out moved to Settings. It is a rare, deliberate act,
                and it does not need to sit under the thumb every morning —
                whereas silencing a notification does. */}
            <NotificationBell />
          </div>
        </div>
      </header>

      <Nav waiting={requests + unread} />

      {/* Bottom padding clears the fixed bar, which is now on every width. */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-7 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-6">
        {children}
      </main>
    </PushProvider>
  );
}
