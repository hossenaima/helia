"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useOptimistic, useTransition } from "react";

const LINKS = [
  { href: "/", label: "Weight" },
  { href: "/calendar", label: "Calendar" },
  { href: "/meals", label: "Meals" },
  { href: "/friends", label: "Friends" },
  { href: "/settings", label: "Settings" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * A bar on the bottom edge, at every width.
 *
 * It was a top rail on desktop, which broke twice over: `md:static` left the
 * glass `::after` with no positioned ancestor, so its `inset: -36px`
 * refraction resolved against the viewport and washed out the whole page. One
 * bar in one place is also simply less to reason about — and the thumb is at
 * the bottom on a phone, which is where this is actually used.
 *
 * The tab you press lights up on the press, not when the server answers. The
 * pathname only changes once the new route is ready, so on its own it leaves
 * every tab looking a beat behind; the optimistic value covers that gap and
 * falls back automatically if the navigation is abandoned.
 */
export function Nav({ waiting = 0 }: { waiting?: number }) {
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [heading, setHeading] = useOptimistic(pathname);
  const litIndex = LINKS.findIndex((l) => isActive(heading, l.href));

  // A conversation is full-screen: the composer owns the bottom edge and the
  // back link is the exit, like every messenger. Only /friends/<id> — the
  // Friends list itself keeps its tabs.
  if (/^\/friends\/.+/.test(pathname)) return null;

  return (
    <nav
      aria-label="Sections"
      className="
        glass fixed inset-x-0 bottom-0 z-20 !rounded-none
        pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]
        pr-[env(safe-area-inset-right)]
      "
    >
      {/* Equal-width tabs at every size, so the marker's position is the
          index and nothing has to be measured. */}
      <ul className="relative mx-auto flex max-w-2xl px-2">
        {litIndex >= 0 && (
          <span
            aria-hidden
            className="nav-marker pointer-events-none absolute inset-y-0 left-0"
            style={{
              width: `${100 / LINKS.length}%`,
              transform: `translateX(${litIndex * 100}%)`,
            }}
          >
            <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-trace" />
          </span>
        )}

        {LINKS.map((link) => {
          // What the URL says, versus what the tap has promised.
          const current = isActive(pathname, link.href);
          const lit = isActive(heading, link.href);

          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                onNavigate={() => startTransition(() => setHeading(link.href))}
                className={`
                  eyebrow relative flex items-center justify-center py-4
                  transition-colors
                  ${lit ? "!text-ink" : "hover:!text-ink-muted"}
                `}
              >
                {link.label}
                {link.href === "/friends" && waiting > 0 && (
                  <span
                    aria-label={`${waiting} waiting`}
                    className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-trace px-1 text-[0.625rem] font-bold text-ground"
                  >
                    {waiting}
                  </span>
                )}
                <PendingHint />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * A hairline that creeps across the tab while its route is still in flight —
 * the case where the prefetch has not landed, typically a cold or slow
 * connection. Always rendered, so it cannot shift the layout, and delayed, so
 * a fast navigation never flashes it.
 */
function PendingHint() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={`
        absolute inset-x-4 top-0 h-0.5 origin-left rounded-full bg-trace/60
        ${pending ? "nav-hint" : "scale-x-0 opacity-0"}
      `}
    />
  );
}
