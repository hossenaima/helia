/**
 * Self-check for the reverse-dieting ramp and the percent milestones.
 * Run: npx tsx scripts/check-phase.mts — exits non-zero on the first failure.
 */
import assert from "node:assert/strict";
import { rampStep, milestoneReached } from "../src/lib/phase";

// --- rampStep ---------------------------------------------------------------

const plan = {
  phase: "reverse" as string | null,
  calorieTarget: 1600 as number | null,
  rampEndKcal: 2000 as number | null,
  rampStepKcal: 100 as number | null,
  rampIntervalDays: 14 as number | null,
  rampLastStepOn: "2026-08-01" as string | null,
};

// Not in a reverse phase → never steps.
assert.equal(rampStep({ ...plan, phase: null }, "2026-08-25"), null);
assert.equal(rampStep({ ...plan, phase: "maintain" }, "2026-08-25"), null);

// Not due yet: 13 of 14 days elapsed.
assert.equal(rampStep(plan, "2026-08-14"), null);

// Due on the day the interval completes.
assert.deepEqual(rampStep(plan, "2026-08-15"), {
  calorieTarget: 1700,
  phase: "reverse",
  rampLastStepOn: "2026-08-15",
});

// The final step lands exactly on the end → maintenance.
assert.deepEqual(
  rampStep({ ...plan, calorieTarget: 1900 }, "2026-08-15"),
  { calorieTarget: 2000, phase: "maintain", rampLastStepOn: "2026-08-15" },
);

// A step that would overshoot clamps to the end.
assert.deepEqual(
  rampStep({ ...plan, calorieTarget: 1950 }, "2026-08-15"),
  { calorieTarget: 2000, phase: "maintain", rampLastStepOn: "2026-08-15" },
);

// Target already at or past the end (say, edited by hand) → clamp and finish.
assert.deepEqual(
  rampStep({ ...plan, calorieTarget: 2200 }, "2026-08-15"),
  { calorieTarget: 2000, phase: "maintain", rampLastStepOn: "2026-08-15" },
);

// A long absence still advances one step per pass, not a catch-up jump.
assert.deepEqual(rampStep(plan, "2026-09-30"), {
  calorieTarget: 1700,
  phase: "reverse",
  rampLastStepOn: "2026-09-30",
});

// Any missing plan field → no-op rather than a guess.
assert.equal(rampStep({ ...plan, calorieTarget: null }, "2026-08-15"), null);
assert.equal(rampStep({ ...plan, rampEndKcal: null }, "2026-08-15"), null);
assert.equal(rampStep({ ...plan, rampStepKcal: null }, "2026-08-15"), null);
assert.equal(rampStep({ ...plan, rampIntervalDays: null }, "2026-08-15"), null);
assert.equal(rampStep({ ...plan, rampLastStepOn: null }, "2026-08-15"), null);

// --- milestoneReached (percent quarters) ------------------------------------

const cut = { startLbs: 145, goalLbs: 125 }; // 20 lb cut, quarters every 5 lb

// Goal outranks everything, and only shows once.
assert.deepEqual(
  milestoneReached({ ...cut, currentLbs: 125, alreadyShownPct: 75 }),
  { kind: "goal" },
);
assert.equal(
  milestoneReached({ ...cut, currentLbs: 124, alreadyShownPct: 100 }),
  null,
);

// Quarters floor to the one actually reached, shown once each.
assert.equal(
  milestoneReached({ ...cut, currentLbs: 141, alreadyShownPct: 0 }),
  null, // 20% — nothing yet
);
assert.deepEqual(
  milestoneReached({ ...cut, currentLbs: 140, alreadyShownPct: 0 }),
  { kind: "pct", pct: 25 },
);
assert.deepEqual(
  milestoneReached({ ...cut, currentLbs: 134, alreadyShownPct: 25 }),
  { kind: "pct", pct: 50 }, // 55% → the 50 quarter
);
assert.equal(
  milestoneReached({ ...cut, currentLbs: 134, alreadyShownPct: 50 }),
  null,
);

// A gap that skips quarters reports only the highest one reached, not a queue.
assert.deepEqual(
  milestoneReached({ ...cut, currentLbs: 129, alreadyShownPct: 0 }),
  { kind: "pct", pct: 75 }, // 80% of the way
);

// Regaining past a shown quarter and re-losing it does not replay it.
assert.equal(
  milestoneReached({ ...cut, currentLbs: 140, alreadyShownPct: 75 }),
  null,
);

// No start, no goal, or no reading → nothing (goal still fires without start).
assert.equal(
  milestoneReached({ startLbs: null, goalLbs: 125, currentLbs: 130, alreadyShownPct: 0 }),
  null,
);
assert.deepEqual(
  milestoneReached({ startLbs: null, goalLbs: 125, currentLbs: 125, alreadyShownPct: 0 }),
  { kind: "goal" },
);
assert.equal(
  milestoneReached({ ...cut, goalLbs: null, currentLbs: 130, alreadyShownPct: 0 }),
  null,
);
assert.equal(
  milestoneReached({ ...cut, currentLbs: null, alreadyShownPct: 0 }),
  null,
);

// Start equal to goal: no distance to be a fraction of.
assert.equal(
  milestoneReached({ startLbs: 125, goalLbs: 125, currentLbs: 126, alreadyShownPct: 0 }),
  null,
);

console.log("check-phase: all assertions passed");
