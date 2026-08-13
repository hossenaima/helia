import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { addDays, formatDayLong, isDayKey, todayIn } from "@/lib/dates";
import { getEstimator } from "@/lib/ai/estimator";
import { mealNutrition, sumNutrition } from "@/lib/nutrition";
import { repeatableMeals } from "@/lib/meals";
import { PageTitle } from "@/components/page-title";
import { MealForm } from "@/components/meal-form";
import { DayTotals } from "@/components/day-totals";
import { ActiveBurnField } from "@/components/active-burn-field";
import { MealCard } from "@/components/meal-card";
import { SavedMeals } from "@/components/saved-meals";

export default async function MealsPage(props: PageProps<"/meals">) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { d } = await props.searchParams;
  const requested = typeof d === "string" && isDayKey(d) ? d : null;
  const date = requested ?? todayIn(user.timezone);
  const today = todayIn(user.timezone);

  // The trailing week is fetched alongside the day so the rolling buffer can be
  // computed without a second round trip.
  const weekStart = addDays(date, -6);
  const [meals, dayLog, weekMeals, recent] = await Promise.all([
    prisma.meal.findMany({
      where: { userId: user.id, date },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dayLog.findUnique({
      where: { userId_date: { userId: user.id, date } },
    }),
    prisma.meal.findMany({
      where: { userId: user.id, date: { gte: weekStart, lte: date } },
      include: { items: true },
    }),
    // The recent past, for the "log again" list. Newest first, and capped —
    // `repeatableMeals` only needs enough rows to find a few distinct names.
    prisma.meal.findMany({
      where: { userId: user.id },
      include: { items: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 60,
    }),
  ]);

  const eaten = sumNutrition(meals.map(mealNutrition));

  // Averaged over days that actually have food logged — a day you forgot to log
  // is missing data, not a fast, and counting it as zero would flatter the mean.
  const perDay = new Map<string, number>();
  for (const meal of weekMeals) {
    const cals = mealNutrition(meal).calories;
    perDay.set(meal.date, (perDay.get(meal.date) ?? 0) + cals);
  }
  const loggedDays = [...perDay.values()].filter((c) => c > 0);
  const weeklyAverage = loggedDays.length
    ? loggedDays.reduce((a, b) => a + b, 0) / loggedDays.length
    : null;

  return (
    <>
      <PageTitle>Meals</PageTitle>
      <nav
        aria-label="Choose a day"
        className="mt-5 flex items-center justify-between gap-3"
      >
        <DayLink date={addDays(date, -1)} label="← Previous" />
        <p className="text-center text-sm">
          {date === today ? "Today" : formatDayLong(date)}
        </p>
        {date >= today ? (
          <span className="eyebrow opacity-30">Next →</span>
        ) : (
          <DayLink date={addDays(date, 1)} label="Next →" />
        )}
      </nav>

      <DayTotals
        eaten={eaten}
        activeBurn={dayLog?.activeBurnKcal ?? null}
        calorieTarget={user.calorieTarget}
        proteinTargetG={user.proteinTargetG}
        fiberTargetG={user.fiberTargetG}
        mealCount={meals.length}
        weeklyAverage={weeklyAverage}
        isToday={date === today}
      />

      <ActiveBurnField date={date} value={dayLog?.activeBurnKcal ?? null} />

      <MealForm date={date} aiEnabled={getEstimator().available} />

      {meals.length > 0 && (
        <section className="mt-9" aria-label="Meals logged">
          <h2 className="eyebrow">Log</h2>

          <ul className="mt-3 space-y-3">
            {meals.map((meal, i) => (
              // Key carries the item count so a save that changes the items
              // remounts the card and reseeds its draft state — meal.id alone
              // never changes, so useState's initializers only ran once and a
              // reopened Edit kept showing the pre-save items and total.
              <MealCard key={`${meal.id}:${meal.items.length}`} meal={meal} index={i} />
            ))}
          </ul>
        </section>
      )}

      {meals.length === 0 && (
        <p className="mt-8 text-sm text-ink-muted">
          Nothing logged for this day yet. Add as many meals as you like.
        </p>
      )}

      <SavedMeals meals={repeatableMeals(recent)} date={date} />
    </>
  );
}

function DayLink({ date, label }: { date: string; label: string }) {
  return (
    <Link
      href={`/meals?d=${date}`}
      className="eyebrow transition-colors hover:!text-ink"
    >
      {label}
    </Link>
  );
}
