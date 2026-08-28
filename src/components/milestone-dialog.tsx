"use client";

import { useEffect, useRef } from "react";
import { acknowledgeMilestoneAction } from "@/app/actions/settings";
import type { Milestone } from "@/lib/milestones";
import { ConfettiBurst } from "@/components/confetti-burst";

/**
 * A moment, once — as a pop-up.
 *
 * A native <dialog> via showModal(), same machinery as the friend-removal
 * confirm: top layer, focus handling, Escape-to-close and a backdrop for
 * free. (This reverses the earlier "celebration is not a modal" call, on the
 * owner's instruction, 2026-08-28.)
 *
 * Dismissing it is the acknowledgment — `milestonePct` advances then, so the
 * same congratulation greets you until you actually close it and never after.
 * Acknowledging the goal itself also rolls the account into daily tracking;
 * the full rainbow ring is what remains after the dialog goes.
 */

const QUARTER: Record<25 | 50 | 75, string> = {
  25: "A quarter of the way there 🎉",
  50: "Halfway. Halfway!",
  75: "75% — the home stretch.",
};

export function MilestoneDialog({ milestone }: { milestone: Milestone }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pct =
    milestone === null ? null : milestone.kind === "goal" ? 100 : milestone.pct;

  // Keyed on the milestone, not run once: the component is mounted with
  // nothing to show on most mornings, and the dialog element only appears —
  // and must then be opened — when a save crosses a quarter mid-session.
  useEffect(() => {
    const dialog = ref.current;
    if (pct !== null && dialog && !dialog.open) dialog.showModal();
  }, [pct]);

  if (milestone === null || pct === null) return null;
  const goal = milestone.kind === "goal";

  return (
    <dialog
      ref={ref}
      // Close via the button, Escape, or anything else all land here — the
      // acknowledgment cannot be skipped by dismissing some other way.
      onClose={() => void acknowledgeMilestoneAction(pct)}
      // No `relative` here: a modal dialog is position: fixed by UA style —
      // which is both what centers it (inset 0 + .confirm's margin auto) and
      // what makes it the containing block for the confetti canvas. A
      // position utility would override the fixed and strand the dialog
      // in-flow at the top of the page.
      className="confirm overflow-hidden text-center"
      aria-label="Milestone"
    >
      <ConfettiBurst />
      <p aria-hidden className="text-2xl leading-none">
        {goal ? "◎" : "◆"}
      </p>
      <p className="mt-3 text-lg font-bold">
        {goal ? "You did it. Goal weight. 🎊" : QUARTER[milestone.pct]}
      </p>
      {goal && (
        <p className="mt-2 text-sm text-ink-muted">
          From here Helia just tracks your weight day to day — no goal hanging
          over it. The rainbow stays.
        </p>
      )}
      <form method="dialog">
        <button className="btn btn-primary mt-5 w-full">Nice</button>
      </form>
    </dialog>
  );
}
