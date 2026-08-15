import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import {
  addDays,
  formatDayLong,
  formatMonthDay,
  isDayKey,
  loggedTime,
  todayIn,
} from "@/lib/dates";
import { formatDelta, formatWeight, fromLbs } from "@/lib/units";
import {
  estimateBand,
  mealNutrition,
  mealPrecision,
  sumNutrition,
} from "@/lib/nutrition";
import {
  changeText,
  fullReportText,
  type DayReport,
  type ReportMeal,
} from "@/lib/report";
import { ShareReport } from "@/components/share-report";

/**
 * One day as a document: weigh-in, totals, every meal and its working.
 *
 * This page is the artifact. On a phone the share sheet already turns it into
 * a PDF or a Messages attachment, and the Share button hands over the same
 * report as structured text — the form an LLM reads far better than a
 * screenshot. Print chrome (header, tab bar, controls) hides via `print-hide`.
 */
export default async function ReportPage(props: PageProps<"/report">) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { d } = await props.searchParams;
  const today = todayIn(user.timezone);
  // A future day has nothing to report; clamp rather than 404.
  const date =
    typeof d === "string" && isDayKey(d) && d <= today ? d : today;

  const [meals, dayLog, entry, previous] = await Promise.all([
    prisma.meal.findMany({
      where: { userId: user.id, date },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dayLog.findUnique({
      where: { userId_date: { userId: user.id, date } },
    }),
    prisma.weightEntry.findUnique({
      where: { userId_date: { userId: user.id, date } },
    }),
    prisma.weightEntry.findFirst({
      where: { userId: user.id, date: { lt: date } },
      orderBy: { date: "desc" },
    }),
  ]);

  const { units } = user;
  const eaten = sumNutrition(meals.map(mealNutrition));

  const deltaLbs =
    entry && previous ? entry.weightLbs - previous.weightLbs : null;
  const report: DayReport = {
    dayLabel: formatDayLong(date),
    name: user.name,
    weight: entry
      ? {
          display: formatWeight(entry.weightLbs, units),
          time: loggedTime(entry, user.timezone),
          note: entry.note,
          change:
            deltaLbs === null || !previous
              ? null
              : {
                  direction:
                    Math.abs(fromLbs(deltaLbs, units)) < 0.05
                      ? "flat"
                      : deltaLbs < 0
                        ? "down"
                        : "up",
                  amount: formatDelta(deltaLbs, units),
                  since: formatMonthDay(previous.date),
                },
        }
      : null,
    totals: {
      calories: eaten.calories,
      mealCount: meals.length,
      target: user.calorieTarget,
      activeBurn: dayLog?.activeBurnKcal ?? null,
      macros: eaten,
    },
  };

  const reportMeals: ReportMeal[] = meals.map((meal) => {
    const n = mealNutrition(meal);
    const precision = mealPrecision(meal);
    return {
      name: meal.name,
      note: meal.note,
      calories: n.calories,
      precision,
      band: precision === "estimated" ? estimateBand(n.calories) : null,
      macros: n,
      // A hand-typed meal stores one item named after the note; listing it
      // would just repeat the meal line. Same rule as the meal card.
      items:
        meal.items.length === 1 && meal.items[0].name === meal.note
          ? []
          : meal.items,
    };
  });

  const text = fullReportText(report, reportMeals);
  const remaining =
    report.totals.target === null
      ? null
      : report.totals.target - Math.round(eaten.calories);
  const change = report.weight ? changeText(report.weight.change) : null;

  return (
    <>
      <nav
        aria-label="Choose a day"
        className="print-hide flex items-center justify-between gap-3"
      >
        <Link
          href={`/report?d=${addDays(date, -1)}`}
          className="eyebrow transition-colors hover:!text-ink"
        >
          ← Previous
        </Link>
        <Link href="/meals" className="eyebrow transition-colors hover:!text-ink">
          Meals
        </Link>
        {date >= today ? (
          <span className="eyebrow opacity-30">Next →</span>
        ) : (
          <Link
            href={`/report?d=${addDays(date, 1)}`}
            className="eyebrow transition-colors hover:!text-ink"
          >
            Next →
          </Link>
        )}
      </nav>

      <header className="mt-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Day report</p>
          <h1 className="font-cond text-2xl font-bold tracking-tight">
            {formatDayLong(date)}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{user.name}</p>
        </div>
        {/* The page's one action, visible without scrolling — buried below the
            meal list it read as a footnote. */}
        <div className="shrink-0 pt-1">
          <ShareReport text={text} />
        </div>
      </header>

      <section className="card mt-5 p-4" aria-label="Weight">
        <h2 className="eyebrow">Weight</h2>
        {report.weight ? (
          <>
            <p className="tnum mt-1 text-xl font-bold">
              {report.weight.display}
              {report.weight.time && (
                <span className="ml-2 text-sm font-normal text-ink-muted">
                  logged {report.weight.time}
                </span>
              )}
            </p>
            {(change || report.weight.note) && (
              <p className="mt-1 text-sm text-ink-muted">
                {[change, report.weight.note].filter(Boolean).join(" · ")}
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            No weigh-in logged this day.
          </p>
        )}
      </section>

      <section className="card mt-3 p-4" aria-label="Day totals">
        <h2 className="eyebrow">Day totals</h2>
        {meals.length > 0 ? (
          <>
            <p className="tnum mt-1 text-xl font-bold">
              {Math.round(eaten.calories).toLocaleString()} kcal
              <span className="ml-2 text-sm font-normal text-ink-muted">
                across {meals.length} {meals.length === 1 ? "meal" : "meals"}
              </span>
            </p>
            {remaining !== null && (
              <p className="tnum mt-1 text-sm text-ink-muted">
                Target {report.totals.target!.toLocaleString()} ·{" "}
                <span className={remaining < 0 ? "text-up" : "text-down"}>
                  {remaining >= 0
                    ? `${remaining.toLocaleString()} under`
                    : `${Math.abs(remaining).toLocaleString()} over`}
                </span>
              </p>
            )}
            <p className="tnum mt-2 text-xs text-ink-muted">
              Protein {Math.round(eaten.proteinG)} g · Carbs{" "}
              {Math.round(eaten.carbsG)} g · Fat {Math.round(eaten.fatG)} g ·
              Fiber {Math.round(eaten.fiberG)} g · Sodium{" "}
              {Math.round(eaten.sodiumMg)} mg
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            No meals logged this day.
          </p>
        )}
        {report.totals.activeBurn !== null && report.totals.activeBurn > 0 && (
          <p className="tnum mt-1 text-xs text-ink-muted">
            Active burn: {report.totals.activeBurn.toLocaleString()} kcal
          </p>
        )}
      </section>

      {reportMeals.length > 0 && (
        <section className="mt-6" aria-label="Meals">
          <h2 className="eyebrow">Meals</h2>
          <ul className="mt-3 space-y-3">
            {reportMeals.map((meal, i) => (
              <li key={i} className="card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {meal.name}
                  </span>
                  <span className="tnum shrink-0 text-sm font-semibold">
                    {Math.round(meal.calories).toLocaleString()} kcal
                  </span>
                </div>
                {meal.note && meal.note !== meal.name && (
                  <p className="mt-1 text-sm text-ink-muted">{meal.note}</p>
                )}
                <p className="tnum mt-1 text-xs text-ink-faint">
                  {meal.precision === "exact"
                    ? "Exact"
                    : `Estimated · ${meal.band!.low.toLocaleString()}–${meal.band!.high.toLocaleString()} kcal`}
                  {meal.calories > 0 && (
                    <>
                      {" · "}P {Math.round(meal.macros.proteinG)}g · C{" "}
                      {Math.round(meal.macros.carbsG)}g · F{" "}
                      {Math.round(meal.macros.fatG)}g
                    </>
                  )}
                </p>
                {meal.items.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-rule pt-3">
                    {meal.items.map((item, j) => (
                      <li key={j} className="text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 flex-1 font-semibold">
                            {item.name}
                            {item.quantity && (
                              <span className="font-normal text-ink-muted">
                                {" "}
                                · {item.quantity}
                              </span>
                            )}
                            <span className="ml-1.5 font-normal text-ink-faint">
                              {item.precision}
                            </span>
                          </span>
                          <span className="tnum shrink-0">
                            {item.calories ?? "—"}
                          </span>
                        </div>
                        {item.basis && (
                          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                            {item.basis}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs text-ink-faint">
        Figures marked &ldquo;estimated&rdquo; are estimates, not measurements.
      </p>
    </>
  );
}
