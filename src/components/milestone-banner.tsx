"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { acknowledgeMilestoneAction } from "@/app/actions/settings";
import type { Milestone } from "@/lib/phase";
import { ConfettiBurst } from "@/components/confetti-burst";

/**
 * A moment, once.
 *
 * Marked as seen as soon as it renders, so it greets you the morning you cross
 * a milestone and never again — congratulation that repeats every visit stops
 * being congratulation and becomes furniture.
 *
 * Milestones are quarters of the cut, and each headline pops in the colour the
 * progress ring has warmed to at that point; the goal wears the rainbow. No
 * sub-line — the sentence is the celebration. Confetti on all of them.
 *
 * Deliberately not a modal. The point of opening this tab is the number; a
 * dialog in front of it would be celebrating at the user rather than with them.
 */

const QUARTER: Record<25 | 50 | 75, { text: string; pop: string }> = {
  25: { text: "A quarter of the way there 🎉", pop: "milestone-pop-25" },
  50: { text: "Halfway. Halfway!", pop: "milestone-pop-50" },
  75: { text: "75% — the home stretch.", pop: "milestone-pop-75" },
};

export function MilestoneBanner({
  milestone,
  canStartReverse,
}: {
  milestone: Milestone;
  /** Only an account not already in a phase is offered the button. */
  canStartReverse: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  const pct =
    milestone === null ? null : milestone.kind === "goal" ? 100 : milestone.pct;

  useEffect(() => {
    if (pct !== null) void acknowledgeMilestoneAction(pct);
  }, [pct]);

  if (!milestone || dismissed) return null;

  const goal = milestone.kind === "goal";

  return (
    <div
      role="status"
      className="celebrate card relative mt-5 overflow-hidden p-5"
    >
      <ConfettiBurst />
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 text-lg leading-none">
          {goal ? "◎" : "◆"}
        </span>
        <p
          className={`min-w-0 flex-1 text-lg font-bold ${
            goal ? "rainbow-text" : QUARTER[milestone.pct].pop
          }`}
        >
          {goal ? "You did it. Goal weight. 🎊" : QUARTER[milestone.pct].text}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 px-1 text-lg leading-none text-ink-faint transition-colors hover:text-ink"
        >
          ×
        </button>
      </div>
      {goal && canStartReverse && (
        <Link href="/settings#phase" className="btn btn-primary mt-4 w-full">
          Start reverse dieting
        </Link>
      )}
    </div>
  );
}
