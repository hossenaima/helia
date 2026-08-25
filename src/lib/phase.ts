import { daysBetween } from "@/lib/dates";

/**
 * The reverse-dieting ramp and the percent milestones. Pure logic only —
 * checked by `scripts/check-phase.mts`.
 *
 * A phase is null (cutting — the default life of an account), "reverse"
 * (calorie target climbing on a schedule), or "maintain" (ramp done, holding).
 */

export type PhasePlan = {
  phase: string | null;
  calorieTarget: number | null;
  rampEndKcal: number | null;
  rampStepKcal: number | null;
  rampIntervalDays: number | null;
  rampLastStepOn: string | null;
};

/**
 * The write the hourly sweep should make right now, or null for none.
 *
 * One step per pass, never a catch-up jump: coming back from a long gap bumps
 * once and the cadence resumes from today — reverse dieting is gradual on
 * purpose, and three missed steps applied at once would defeat it. A target
 * already at or past the end (edited by hand, say) clamps to the end and the
 * phase rolls over to "maintain"; that rollover is the whole maintenance
 * transition.
 */
export function rampStep(
  plan: PhasePlan,
  today: string,
): { calorieTarget: number; phase: "reverse" | "maintain"; rampLastStepOn: string } | null {
  if (plan.phase !== "reverse") return null;
  if (
    plan.calorieTarget === null ||
    plan.rampEndKcal === null ||
    plan.rampStepKcal === null ||
    plan.rampIntervalDays === null ||
    plan.rampLastStepOn === null
  ) {
    return null;
  }
  if (daysBetween(plan.rampLastStepOn, today) < plan.rampIntervalDays) {
    return null;
  }

  const next = Math.min(plan.calorieTarget + plan.rampStepKcal, plan.rampEndKcal);
  return {
    calorieTarget: next,
    phase: next >= plan.rampEndKcal ? "maintain" : "reverse",
    rampLastStepOn: today,
  };
}

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
