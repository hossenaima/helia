/**
 * Self-check for the percent milestones.
 * Run: npx tsx scripts/check-milestones.mts — exits non-zero on the first failure.
 */
import assert from "node:assert/strict";
import { milestoneReached } from "../src/lib/milestones";

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

console.log("check-milestones: all assertions passed");
