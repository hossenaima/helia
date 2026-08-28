/**
 * The percent milestones of a cut. Pure logic only — checked by
 * `scripts/check-milestones.mts`.
 */

export type Milestone =
  | { kind: "goal" }
  | { kind: "pct"; pct: 25 | 50 | 75 }
  | null;

/**
 * The milestone worth congratulating right now, or null.
 *
 * Quarters of the cut (25/50/75%), with the goal itself as 100%. `alreadyShownPct`
 * is the largest one acknowledged, so crossing back and forth over the same
 * stretch never replays a congratulation — and a gap that skips quarters
 * reports the one actually reached, not a queue of them.
 */
export function milestoneReached({
  startLbs,
  currentLbs,
  goalLbs,
  alreadyShownPct,
}: {
  startLbs: number | null;
  currentLbs: number | null;
  goalLbs: number | null;
  alreadyShownPct: number;
}): Milestone {
  if (currentLbs === null || goalLbs === null) return null;

  if (currentLbs <= goalLbs) {
    return alreadyShownPct >= 100 ? null : { kind: "goal" };
  }

  if (startLbs === null || startLbs <= goalLbs) return null;
  const pct = ((startLbs - currentLbs) / (startLbs - goalLbs)) * 100;
  const quarter = Math.floor(pct / 25) * 25;
  if (quarter < 25 || quarter <= alreadyShownPct) return null;
  return { kind: "pct", pct: quarter as 25 | 50 | 75 };
}
