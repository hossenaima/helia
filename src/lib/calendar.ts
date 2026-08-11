import { addDays, dayKeyToDate } from "@/lib/dates";

/** "YYYY-MM" for the month a day belongs to. */
export function monthKey(day: string): string {
  return day.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * The month laid out as weeks starting Monday, padded with nulls so the grid
 * keeps its shape. Monday-first because a week of habit reads Mon→Sun.
 */
export function monthGrid(month: string): Array<Array<string | null>> {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  // getUTCDay is Sunday-based; shift so Monday is 0.
  const lead = (first.getUTCDay() + 6) % 7;

  const cells: Array<string | null> = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

/** What a streak is computed from: the day, and where the reading came from. */
export type StreakEntry = { date: string; source: string };
/** Inclusive day bounds — a declared stretch away from the scale. */
export type DayRange = { startDate: string; endDate: string };

/**
 * Whether a reading counts toward a streak.
 *
 * A weigh-in typed into the calendar for a day already past is unverifiable —
 * and typing a row of them was how a tester ran their streak up without
 * standing on a scale. Live readings and Apple Health imports count; a
 * backfill is still your data and still draws on the chart, it just does not
 * buy a day of attendance.
 */
export function countsForStreak(entry: StreakEntry): boolean {
  return entry.source !== "backfill";
}

/** Every day inside a declared freeze, as day keys. */
export function frozenDays(freezes: DayRange[]): Set<string> {
  const days = new Set<string>();
  for (const f of freezes) {
    // String comparison is a date comparison for "YYYY-MM-DD", and a reversed
    // range simply yields nothing.
    for (let d = f.startDate; d <= f.endDate; d = addDays(d, 1)) days.add(d);
  }
  return days;
}

/** True when everything strictly between two logged days is frozen. */
function bridged(from: string, to: string, frozen: Set<string>): boolean {
  for (let d = addDays(from, 1); d < to; d = addDays(d, 1)) {
    if (!frozen.has(d)) return false;
  }
  return true;
}

/**
 * Consecutive days ending today (or yesterday — a streak should survive until
 * the day is actually over, otherwise it reads as broken every morning before
 * you step on the scale).
 *
 * A frozen day is stepped over: it neither breaks the run nor adds to it.
 * Holding the number rather than growing it is what makes an unlimited freeze
 * harmless — freezing a month leaves you exactly where you were, so there is
 * nothing to win by it and no budget to enforce.
 */
export function weighInStreak(
  entries: StreakEntry[],
  freezes: DayRange[],
  today: string,
): { current: number; best: number } {
  const set = new Set(entries.filter(countsForStreak).map((e) => e.date));
  const frozen = frozenDays(freezes);

  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor) || frozen.has(cursor)) {
    if (set.has(cursor)) current++;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  const sorted = [...set].sort();
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && bridged(sorted[i - 1], sorted[i], frozen) ? run + 1 : 1;
    best = Math.max(best, run);
  }

  return { current, best: Math.max(best, current) };
}

/**
 * One runnable check, since this decides a number people care about:
 *
 *   npx tsx -e "import('./src/lib/calendar.ts').then(m => m.__checkStreak())"
 */
export function __checkStreak(): string {
  const live = (...dates: string[]) => dates.map((date) => ({ date, source: "live" }));
  const back = (...dates: string[]) =>
    dates.map((date) => ({ date, source: "backfill" }));
  const eq = (got: unknown, want: unknown, what: string) => {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a !== b) throw new Error(`${what}: got ${a}, wanted ${b}`);
  };

  const T = "2026-08-11";
  eq(weighInStreak(live("2026-08-10", "2026-08-11"), [], T).current, 2, "today counted");
  // Yesterday still counts before this morning's weigh-in.
  eq(weighInStreak(live("2026-08-09", "2026-08-10"), [], T).current, 2, "grace day");
  eq(weighInStreak(live("2026-08-08", "2026-08-09"), [], T).current, 0, "two days gone");

  // The bug: backfilled days must not extend a streak, in either direction.
  eq(
    weighInStreak([...live("2026-08-10", "2026-08-11"), ...back("2026-08-09")], [], T)
      .current,
    2,
    "backfill ignored",
  );
  eq(weighInStreak(back("2026-08-09", "2026-08-10", "2026-08-11"), [], T).current, 0,
    "a typed-in week is not a streak");
  eq(weighInStreak(back("2026-06-01", "2026-06-02", "2026-06-03"), [], T).best, 0,
    "nor a typed-in best");

  // A freeze bridges the gap without inflating the count.
  const away = [{ startDate: "2026-08-08", endDate: "2026-08-09" }];
  eq(weighInStreak(live("2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11"), away, T),
    { current: 4, best: 4 }, "freeze bridges");
  eq(weighInStreak(live("2026-08-10", "2026-08-11"), away, T).current, 2,
    "a freeze alone adds nothing");
  // Frozen today, nothing logged since: the run holds.
  eq(
    weighInStreak(live("2026-08-09"), [{ startDate: "2026-08-10", endDate: "2026-08-11" }], T)
      .current,
    1,
    "frozen through today",
  );
  eq(weighInStreak([], [], T), { current: 0, best: 0 }, "empty");

  return "streak checks passed";
}

/** The seven days ending on `day`, oldest first — for the week strip. */
export function weekEnding(day: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(day, i - 6));
}

export { dayKeyToDate };

/** Milestones land every five pounds. Close enough together to arrive while
 *  the effort is still fresh, far enough apart to still mean something. */
export const MILESTONE_STEP_LBS = 5;

export type Milestone =
  | { kind: "goal" }
  | { kind: "lost"; lbs: number }
  | null;

/**
 * The milestone worth congratulating right now, or null.
 *
 * `alreadyShown` is the largest one already acknowledged, so crossing back and
 * forth over the same five pounds does not congratulate you twice — and a long
 * gap in logging that skips several at once reports the one actually reached
 * rather than a queue of them.
 */
export function milestoneReached({
  startLbs,
  currentLbs,
  goalLbs,
  alreadyShown,
}: {
  startLbs: number | null;
  currentLbs: number | null;
  goalLbs: number | null;
  alreadyShown: number;
}): Milestone {
  if (currentLbs === null) return null;

  if (goalLbs !== null && currentLbs <= goalLbs) {
    // The goal is the last milestone; anything past it is still the goal.
    return alreadyShown >= Number.MAX_SAFE_INTEGER ? null : { kind: "goal" };
  }

  if (startLbs === null) return null;
  const lost = startLbs - currentLbs;
  if (lost < MILESTONE_STEP_LBS) return null;

  const reached = Math.floor(lost / MILESTONE_STEP_LBS) * MILESTONE_STEP_LBS;
  return reached > alreadyShown ? { kind: "lost", lbs: reached } : null;
}
