import "server-only";

import { prisma } from "@/lib/db";
import { weekEnding, weighInStreak } from "@/lib/calendar";
import { todayIn } from "@/lib/dates";
import { mealNutrition } from "@/lib/nutrition";

export type FriendSummary = {
  id: string;
  name: string;
  /** Most recent weigh-in, in pounds. Null when never logged, or not shared. */
  latestLbs: number | null;
  latestDate: string | null;
  /** Change since their previous weigh-in, in pounds. */
  changeLbs: number | null;
  /** Their last seven days, oldest first, for the card's sparkline. Always
   *  seven slots so the chart can space them by calendar day; an unlogged day
   *  is null, because a gap is a gap and not a zero. Empty when weight is not
   *  shared. */
  week: Array<{ date: string; lbs: number | null }>;
  /** Today's intake in kcal, when they share their food. */
  caloriesToday: number | null;
  /** Today's meals with what each one cost, when they share their food. */
  mealsToday: Array<{ name: string; calories: number }>;
  streak: number;
  loggedToday: boolean;
  /** What they have chosen to show *you*. Sent so the card can say "not
   *  shared" rather than silently render an empty row. */
  shares: { weight: boolean; meals: boolean };
  /** Whether *you* share your food with them. Per-friend, so it is a control
   *  on their card rather than one switch in Settings. */
  iShareMeals: boolean;
};

/**
 * What each friend has chosen to show.
 *
 * The decision is the *subject's*, never the viewer's: your flags govern what
 * others see of you. Enforced here rather than in the component, because a
 * value that reaches the client has already been shared regardless of whether
 * anything renders it.
 *
 * Weight is one switch on the account; food is a flag on each friendship, so
 * the answer differs per friend and has to be read from the link, not the user.
 *
 * The streak and "logged today" are always visible. They say that a person
 * turned up, not what they weigh or ate, and with everything else off a friend
 * card would otherwise be a name and nothing to encourage.
 */
const FRIEND_FIELDS = {
  id: true,
  name: true,
  timezone: true,
  shareWeight: true,
} as const;

export async function friendSummaries(userId: string): Promise<FriendSummary[]> {
  const links = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: {
      requester: { select: FRIEND_FIELDS },
      addressee: { select: FRIEND_FIELDS },
    },
  });

  // Which side of the row you are on decides which meal flag is theirs and
  // which is yours. Carried alongside the user so the mapping below never has
  // to work it out twice.
  const others = links.map((l) => {
    const mine = l.requesterId === userId;
    return {
      ...(mine ? l.addressee : l.requester),
      sharesMealsWithMe: mine ? l.addresseeSharesMeals : l.requesterSharesMeals,
      iShareMeals: mine ? l.requesterSharesMeals : l.addresseeSharesMeals,
    };
  });
  if (others.length === 0) return [];

  const [entries, freezes] = await Promise.all([
    prisma.weightEntry.findMany({
      where: { userId: { in: others.map((o) => o.id) } },
      orderBy: { date: "asc" },
      select: { userId: true, date: true, weightLbs: true, source: true },
    }),
    // Their freezes, so a friend's streak reads the same on their card as it
    // does on their own screen.
    prisma.streakFreeze.findMany({
      where: { userId: { in: others.map((o) => o.id) } },
      select: { userId: true, startDate: true, endDate: true },
    }),
  ]);

  const byUser = new Map<string, typeof entries>();
  for (const e of entries) {
    byUser.set(e.userId, [...(byUser.get(e.userId) ?? []), e]);
  }
  const freezesByUser = new Map<string, typeof freezes>();
  for (const f of freezes) {
    freezesByUser.set(f.userId, [...(freezesByUser.get(f.userId) ?? []), f]);
  }

  // Only fetch food for the people who share some of it, and only their own
  // today — "today" differs per person, so each is filtered to their own date.
  const foodSharers = others.filter((o) => o.sharesMealsWithMe);
  const meals = foodSharers.length
    ? await prisma.meal.findMany({
        where: {
          OR: foodSharers.map((o) => ({
            userId: o.id,
            date: todayIn(o.timezone),
          })),
        },
        include: { items: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const mealsByUser = new Map<string, typeof meals>();
  for (const m of meals) {
    mealsByUser.set(m.userId, [...(mealsByUser.get(m.userId) ?? []), m]);
  }

  return others.map((other) => {
    const mine = byUser.get(other.id) ?? [];
    const latest = mine.at(-1) ?? null;
    const previous = mine.at(-2) ?? null;
    const today = todayIn(other.timezone);
    const streak = weighInStreak(mine, freezesByUser.get(other.id) ?? [], today);
    const theirMeals = mealsByUser.get(other.id) ?? [];

    return {
      id: other.id,
      name: other.name,
      latestLbs: other.shareWeight ? (latest?.weightLbs ?? null) : null,
      latestDate: other.shareWeight ? (latest?.date ?? null) : null,
      changeLbs:
        other.shareWeight && latest && previous
          ? latest.weightLbs - previous.weightLbs
          : null,
      // Gated on the same flag as the figures above it: a week of readings is
      // still their weight, and drawing it would share what the number hides.
      week: other.shareWeight
        ? weekEnding(today).map((date) => ({
            date,
            lbs: mine.find((m) => m.date === date)?.weightLbs ?? null,
          }))
        : [],
      caloriesToday: other.sharesMealsWithMe
        ? Math.round(
            theirMeals.reduce((sum, m) => sum + mealNutrition(m).calories, 0),
          )
        : null,
      mealsToday: other.sharesMealsWithMe
        ? theirMeals.map((m) => ({
            name: m.name,
            calories: Math.round(mealNutrition(m).calories),
          }))
        : [],
      streak: streak.current,
      // Still true when weight is private: it says they turned up, not what
      // the scale said.
      loggedToday: latest?.date === today,
      shares: { weight: other.shareWeight, meals: other.sharesMealsWithMe },
      iShareMeals: other.iShareMeals,
    };
  });
}

/**
 * How long a note stays after it has been read.
 *
 * Encouragement is about a moment — "nice work today" a fortnight later is
 * clutter, not warmth. Unread notes never expire: the clock starts when you
 * have actually seen it, not when it was sent, so nothing vanishes unread.
 */
export const NOTE_TTL_HOURS = 12;

export function noteCutoff(now = new Date()): Date {
  return new Date(now.getTime() - NOTE_TTL_HOURS * 60 * 60 * 1000);
}
