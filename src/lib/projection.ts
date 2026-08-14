/**
 * Estimate when the weight trend reaches the goal, from the recent slope of the
 * 7-day trend line.
 *
 * Self-contained on purpose — no imports — so the pace maths can be exercised
 * directly (`node src/lib/projection.check.ts`) without the app around it.
 *
 * Accuracy notes, because a wrong date here is worse than no date:
 *  - Fit on the SMOOTHED trend, never raw weigh-ins: a single heavy or dehydrated
 *    morning would otherwise swing the whole slope.
 *  - Least-squares slope over the window, not (last − first)/span: one noisy
 *    endpoint should not set the pace by itself.
 *  - Regressed against real calendar days, so gaps in logging do not distort it.
 *  - Anchored at the latest trend value — where you are now — and projected
 *    forward at the fitted pace: the intuitive "you're here, moving this fast".
 *  - A date only when the trend is actually moving toward the goal by more than
 *    daily noise. Flat or wrong-way returns `stalled`, never an invented date.
 */

export type TrendPoint = { date: string; trendLbs: number };

export type GoalProjection =
  | { kind: "reached" }
  | { kind: "insufficient" }
  | { kind: "stalled" }
  | { kind: "eta"; daysToGoal: number; lbsPerWeek: number; beyondYear: boolean };

/** Recent history the pace is fit over. */
const WINDOW_DAYS = 28;
/** Enough weigh-ins inside the window to trust a slope. */
const MIN_POINTS = 8;
/** …and spanning at least this long, so a busy few days is not a "trend". */
const MIN_SPAN_DAYS = 14;
/** Below this |pace| the trend is noise, not movement. */
const FLAT_LBS_PER_WEEK = 0.1;
/** Within this of goal, call it reached rather than projecting a date. */
const REACHED_LBS = 0.5;
/** Past this, state "over a year" instead of a falsely precise far-off date. */
const YEAR_DAYS = 365;

/** "YYYY-MM-DD" → integer day index (days since epoch, UTC). */
function dayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * @param trend  Ascending by date, one point per weigh-in day that has a
 *               7-day trend value.
 * @param goalLbs  The goal weight, in pounds.
 */
export function projectGoal(
  trend: TrendPoint[],
  goalLbs: number,
): GoalProjection {
  if (trend.length === 0) return { kind: "insufficient" };

  const last = trend[trend.length - 1];
  const gap = goalLbs - last.trendLbs; // <0 need to lose, >0 need to gain
  if (Math.abs(gap) <= REACHED_LBS) return { kind: "reached" };

  // Keep only the recent window, measured back from the latest point.
  const lastIdx = dayIndex(last.date);
  const window = trend.filter((p) => lastIdx - dayIndex(p.date) <= WINDOW_DAYS);
  const spanDays = lastIdx - dayIndex(window[0].date);
  if (window.length < MIN_POINTS || spanDays < MIN_SPAN_DAYS) {
    return { kind: "insufficient" };
  }

  // Least-squares slope of trendLbs against day index (pounds per day).
  const xs = window.map((p) => dayIndex(p.date));
  const ys = window.map((p) => p.trendLbs);
  const xBar = xs.reduce((a, b) => a + b, 0) / xs.length;
  const yBar = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxx += (xs[i] - xBar) ** 2;
    sxy += (xs[i] - xBar) * (ys[i] - yBar);
  }
  if (sxx === 0) return { kind: "insufficient" };

  const lbsPerDay = sxy / sxx;
  const lbsPerWeek = lbsPerDay * 7;

  // Moving toward the goal means the slope's sign matches the gap's, by more
  // than daily noise. (gap and lbsPerDay then share a sign, so days > 0.)
  const toward = Math.sign(lbsPerDay) === Math.sign(gap);
  if (!toward || Math.abs(lbsPerWeek) < FLAT_LBS_PER_WEEK) {
    return { kind: "stalled" };
  }

  const daysToGoal = Math.round(gap / lbsPerDay);
  return {
    kind: "eta",
    daysToGoal,
    lbsPerWeek,
    beyondYear: daysToGoal > YEAR_DAYS,
  };
}
