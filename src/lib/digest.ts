import "server-only";

import { prisma } from "@/lib/db";
import { addDays, todayIn } from "@/lib/dates";
import { weekEnding, weighInStreak } from "@/lib/calendar";
import { mealNutrition, sumNutrition, type Nutrition } from "@/lib/nutrition";

/**
 * The week a digest covers.
 *
 * Everything here is read for one `userId` — same rule as the rest of the app,
 * and a digest is the one feature where leaking somebody else's row would be
 * both a privacy failure and mailed to a third party.
 */
export type DayLine = {
  date: string;
  /** Weight in pounds, or null on a day with no weigh-in. A gap is a gap and
   *  must not be drawn as a zero. */
  lbs: number | null;
  calories: number | null;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Whether anything was eaten *and logged* — distinguishes a zero from a
   *  blank, which the bar chart needs to tell apart. */
  logged: boolean;
};

export type Digest = {
  userId: string;
  name: string;
  email: string;
  /** Monday of the week covered, used as the idempotency key. */
  weekKey: string;
  days: DayLine[];
  daysWeighed: number;
  daysLogged: number;
  streak: number;
  /** Raw first and last readings of the week. */
  startLbs: number | null;
  endLbs: number | null;
  changeLbs: number | null;
  /** The smoothed figure — what a bad morning must not be allowed to distort. */
  trendStartLbs: number | null;
  trendEndLbs: number | null;
  trendChangeLbs: number | null;
  highLbs: number | null;
  lowLbs: number | null;
  /** Means over the days that were logged, not over seven — dividing a week's
   *  intake by seven when four were logged invents four days of fasting. */
  avgCalories: number | null;
  avgProteinG: number | null;
  calorieTarget: number | null;
  proteinTargetG: number | null;
  encouragements: Array<{ from: string; body: string }>;
  units: string;
  /** Nothing logged at all — the caller skips these rather than mailing
   *  somebody an empty page about their week. */
  empty: boolean;
};

/**
 * A 7-day trailing mean walked over *calendar* days, matching the main chart's
 * rule: a gap in logging must not compress the window and exaggerate a swing.
 * Returns null until there is at least one reading in the trailing window.
 */
function trendAt(byDate: Map<string, number>, day: string): number | null {
  const window: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const value = byDate.get(addDays(day, -i));
    if (value !== undefined) window.push(value);
  }
  if (window.length === 0) return null;
  return window.reduce((a, b) => a + b, 0) / window.length;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Build the digest for one account, for the seven days ending yesterday.
 *
 * Ending yesterday, not today: the sweep runs in the morning, and a "week" that
 * includes a today nobody has logged yet always reports a missing day that is
 * not actually missing.
 */
export async function buildDigest(userId: string): Promise<Digest | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.email) return null;

  const lastDay = addDays(todayIn(user.timezone), -1);
  const days = weekEnding(lastDay);
  const from = days[0];

  const [weights, meals, notes, priorWeights, freezes] = await Promise.all([
    prisma.weightEntry.findMany({
      where: { userId, date: { gte: from, lte: lastDay } },
      orderBy: { date: "asc" },
    }),
    prisma.meal.findMany({
      where: { userId, date: { gte: from, lte: lastDay } },
      include: { items: true },
    }),
    prisma.encouragement.findMany({
      where: { toId: userId, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      include: { from: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    // Six days before the window too, so the trend at the start of the week is
    // a real trailing mean rather than a mean of one morning.
    prisma.weightEntry.findMany({
      where: { userId, date: { gte: addDays(from, -6), lt: from } },
      select: { date: true, weightLbs: true, source: true },
    }),
    prisma.streakFreeze.findMany({
      where: { userId },
      select: { startDate: true, endDate: true },
    }),
  ]);

  const byDate = new Map<string, number>(
    [...priorWeights, ...weights].map((w) => [w.date, w.weightLbs]),
  );

  const mealsByDate = new Map<string, Nutrition[]>();
  for (const meal of meals) {
    const list = mealsByDate.get(meal.date) ?? [];
    list.push(mealNutrition(meal));
    mealsByDate.set(meal.date, list);
  }

  const lines: DayLine[] = days.map((date) => {
    const parts = mealsByDate.get(date);
    const total = parts ? sumNutrition(parts) : null;
    return {
      date,
      lbs: byDate.get(date) ?? null,
      calories: total?.calories ?? null,
      proteinG: total?.proteinG ?? 0,
      carbsG: total?.carbsG ?? 0,
      fatG: total?.fatG ?? 0,
      logged: parts !== undefined && parts.length > 0,
    };
  });

  const weighed = lines.filter((d) => d.lbs !== null).map((d) => d.lbs as number);
  const loggedDays = lines.filter((d) => d.logged);
  const calorieDays = loggedDays
    .map((d) => d.calories)
    .filter((c): c is number => c !== null);

  const startLbs = weighed.length > 0 ? weighed[0] : null;
  const endLbs = weighed.length > 0 ? weighed[weighed.length - 1] : null;

  const trendStart = trendAt(byDate, days[0]);
  const trendEnd = trendAt(byDate, lastDay);

  const mean = (xs: number[]) =>
    xs.length === 0 ? null : round1(xs.reduce((a, b) => a + b, 0) / xs.length);

  return {
    userId,
    name: user.name,
    email: user.email,
    weekKey: days[0],
    days: lines,
    daysWeighed: weighed.length,
    daysLogged: loggedDays.length,
    // Counted to yesterday, so a streak is not reported broken purely because
    // the person has not weighed in yet on the morning this arrives.
    streak: weighInStreak(
      [...priorWeights, ...weights].map((w) => ({
        date: w.date,
        source: w.source,
      })),
      freezes,
      lastDay,
    ).current,
    startLbs,
    endLbs,
    changeLbs:
      startLbs !== null && endLbs !== null && weighed.length > 1
        ? round1(endLbs - startLbs)
        : null,
    trendStartLbs: trendStart === null ? null : round1(trendStart),
    trendEndLbs: trendEnd === null ? null : round1(trendEnd),
    trendChangeLbs:
      trendStart !== null && trendEnd !== null
        ? round1(trendEnd - trendStart)
        : null,
    highLbs: weighed.length > 0 ? Math.max(...weighed) : null,
    lowLbs: weighed.length > 0 ? Math.min(...weighed) : null,
    // Rounded whole: calories are counted in units of one, and "1,536.3"
    // claims a precision the estimator does not have.
    avgCalories:
      calorieDays.length === 0
        ? null
        : Math.round(calorieDays.reduce((a, b) => a + b, 0) / calorieDays.length),
    avgProteinG: mean(loggedDays.map((d) => d.proteinG)),
    calorieTarget: user.calorieTarget,
    proteinTargetG: user.proteinTargetG,
    encouragements: notes.map((n) => ({ from: n.from.name, body: n.body })),
    units: user.units,
    empty: weighed.length === 0 && loggedDays.length === 0,
  };
}
