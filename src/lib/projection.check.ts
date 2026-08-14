/**
 * Self-check for the goal-date projection. Run: `node src/lib/projection.check.ts`
 * (Node 24 strips the types). No framework — asserts, and a line when they pass.
 */
import assert from "node:assert/strict";
import { projectGoal, type TrendPoint } from "./projection.ts";

/** N daily trend points ending today, starting at `start` lb, moving `perWeek` lb/week. */
function series(start: number, perWeek: number, n: number): TrendPoint[] {
  const perDay = perWeek / 7;
  const out: TrendPoint[] = [];
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < n; i++) {
    out.push({
      date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
      trendLbs: start + perDay * i,
    });
  }
  return out;
}

// 1. Steady 1 lb/week loss toward a goal below: a real date, right pace, right ETA.
{
  const p = projectGoal(series(200, -1, 30), 190);
  assert.equal(p.kind, "eta");
  if (p.kind === "eta") {
    assert.ok(Math.abs(p.lbsPerWeek - -1) < 0.01, `pace ${p.lbsPerWeek}`);
    // Ends near 195.86 lb; 5.86 lb to go at 1/wk ≈ 41 days.
    assert.ok(Math.abs(p.daysToGoal - 41) <= 2, `days ${p.daysToGoal}`);
    assert.equal(p.beyondYear, false);
  }
}

// 2. Flat trend → stalled, never a date.
assert.equal(projectGoal(series(180, 0, 30), 170).kind, "stalled");

// 3. Gaining while the goal is below → stalled (wrong direction).
assert.equal(projectGoal(series(180, 0.5, 30), 170).kind, "stalled");

// 4. Too few points → insufficient.
assert.equal(projectGoal(series(200, -1, 5), 190).kind, "insufficient");

// 5. Already at goal → reached.
assert.equal(projectGoal(series(170.2, 0, 30), 170).kind, "reached");

// 6. Real but very slow pace over a big gap → a date, flagged beyond a year.
{
  const p = projectGoal(series(200, -0.2, 30), 180);
  assert.equal(p.kind, "eta");
  if (p.kind === "eta") assert.equal(p.beyondYear, true);
}

// 7. Gaining toward a goal above works symmetrically.
{
  const p = projectGoal(series(150, 0.5, 30), 160);
  assert.equal(p.kind, "eta");
  if (p.kind === "eta") assert.ok(p.lbsPerWeek > 0 && p.daysToGoal > 0);
}

// 8. A noisy endpoint must not hijack the pace (least-squares, not endpoints).
{
  const s = series(200, -1, 30);
  s[s.length - 1].trendLbs -= 3; // one bad final reading
  const p = projectGoal(s, 190);
  assert.equal(p.kind, "eta");
  if (p.kind === "eta") assert.ok(Math.abs(p.lbsPerWeek - -1) < 0.2, `pace ${p.lbsPerWeek}`);
}

console.log("projection.check: all assertions passed");
