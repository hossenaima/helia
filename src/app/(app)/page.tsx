import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import {
  todayIn,
  formatDayShort,
  formatMonthDay,
  loggedTime,
} from "@/lib/dates";
import { formatDelta, fromLbs, formatWeight, type Units } from "@/lib/units";
import { projectGoal, type GoalProjection } from "@/lib/projection";
import { PageTitle } from "@/components/page-title";
import { UnitSwitch } from "@/components/unit-switch";
import { WeighInForm } from "@/components/weigh-in-form";
import { LazyWeightChart } from "@/components/weight-chart-lazy";
import { WaterWeightBanner } from "@/components/water-weight-banner";
import { ProgressRing } from "@/components/progress-ring";
import { WeekStrip } from "@/components/week-strip";
import {
  frozenDays,
  weekEnding,
  weighInStreak,
} from "@/lib/calendar";
import { milestoneReached } from "@/lib/milestones";
import { MilestoneDialog } from "@/components/milestone-dialog";
import { TrackingToggle } from "@/components/tracking-toggle";
import { flaggedMeals, mealNutrition, rollingAverage } from "@/lib/nutrition";
import { addDays } from "@/lib/dates";

// Auth state and the log itself change per request; nothing here may be
// prerendered at build time.
export const dynamic = "force-dynamic";

export default async function WeightPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  // Scoped to this account — the other user's log is never read here.
  const [entries, freezes] = await Promise.all([
    prisma.weightEntry.findMany({
      where: { userId: user.id },
      orderBy: { date: "asc" },
    }),
    prisma.streakFreeze.findMany({
      where: { userId: user.id },
      select: { startDate: true, endDate: true },
    }),
  ]);

  // Only the last couple of days of meals are needed: the banner explains an
  // overnight jump, so anything older cannot be the cause.
  const latestDate = entries.at(-1)?.date ?? todayIn(user.timezone);
  const recentMeals = await prisma.meal.findMany({
    where: {
      userId: user.id,
      date: { gte: addDays(latestDate, -2), lte: latestDate },
    },
    include: { items: true },
  });

  const { units } = user;
  const today = todayIn(user.timezone);

  // Daily tracking mode: no goal hanging over the numbers, and no up/down
  // verdicts. `goalWeightLbs` is untouched in the database — it simply is not
  // read into any of the goal UI (ring, "to go", projection, chart goal line)
  // while the mode is on. The finished cut's rainbow ring is the exception:
  // a trophy already earned stays.
  const tracking = user.trackingOnly;
  const trophy = user.milestonePct >= 100;
  const goalWeightLbs = tracking ? null : user.goalWeightLbs;

  const latest = entries.at(-1) ?? null;
  const previous = entries.at(-2) ?? null;
  const todayEntry = entries.find((e) => e.date === today) ?? null;

  // Falls back to the earliest logged weigh-in when no start weight is set, so
  // "since start" means something from day one.
  const startLbs = user.startWeightLbs ?? entries[0]?.weightLbs ?? null;

  // A 7-day trailing mean over calendar days, so gaps in logging do not
  // compress the window and overstate a short-term swing.
  const byDate = new Map(entries.map((e) => [e.date, e.weightLbs]));
  const calendar: Array<{ date: string; value: number | null }> = [];
  if (entries.length > 0) {
    for (let d = entries[0].date; d <= latestDate; d = addDays(d, 1)) {
      calendar.push({ date: d, value: byDate.get(d) ?? null });
    }
  }
  const trendByDate = new Map(
    rollingAverage(calendar, 7).map((r) => [r.date, r.average]),
  );

  const sinceLast =
    latest && previous ? latest.weightLbs - previous.weightLbs : null;
  const sinceStart =
    latest && startLbs !== null ? latest.weightLbs - startLbs : null;
  const toGoal =
    latest && goalWeightLbs !== null ? latest.weightLbs - goalWeightLbs : null;

  // When will the trend reach the goal, at the pace it has lately? Fit on the
  // smoothed trend, not raw weigh-ins — see projectGoal.
  const projection =
    goalWeightLbs === null
      ? null
      : projectGoal(
          entries
            .map((e) => ({ date: e.date, trendLbs: trendByDate.get(e.date) }))
            .filter(
              (p): p is { date: string; trendLbs: number } =>
                p.trendLbs != null,
            ),
          goalWeightLbs,
        );

  // Undefined when start and goal coincide — there is no distance to be a
  // fraction of, and dividing would blow up.
  const progress =
    startLbs !== null &&
    goalWeightLbs !== null &&
    latest &&
    startLbs !== goalWeightLbs
      ? clampPercent(
          ((startLbs - latest.weightLbs) / (startLbs - goalWeightLbs)) * 100,
        )
      : null;

  // Explain an overnight jump when a flagged meal came before it. The window
  // reaches back through the previous day so a late dinner still counts.
  const flagged = flaggedMeals(
    recentMeals.filter(
      (m) => m.date >= addDays(latestDate, -1) && m.date <= latestDate,
    ),
  );
  const priorTags = [...new Set(flagged.flatMap((f) => f.tags))];
  // What was eaten the day before the jump — the number the "not fat" maths
  // leans on. Null when nothing was logged, so the line simply does not appear.
  const priorDayKcal = recentMeals
    .filter((m) => m.date === addDays(latestDate, -1))
    .reduce((sum, m) => sum + mealNutrition(m).calories, 0);
  // Name the most recent offender — that is the one still in the system.
  const culpritDate = flagged.map((f) => f.date).sort().at(-1) ?? null;
  const overnightGain =
    latest && previous && latest.date === addDays(previous.date, 1)
      ? latest.weightLbs - previous.weightLbs
      : null;
  // A flagged meal explains the jump; its absence does not make the jump fat.
  // Requiring one meant the reassurance skipped every bad morning that followed
  // an unlogged evening, which is most of them.
  const showBanner = overnightGain !== null && overnightGain >= 0.8;

  const milestone = milestoneReached({
    startLbs,
    currentLbs: latest?.weightLbs ?? null,
    goalLbs: goalWeightLbs,
    alreadyShownPct: user.milestonePct,
  });

  const loggedDates = new Set(entries.map((e) => e.date));
  const week = weekEnding(today);
  const streak = weighInStreak(entries, freezes, today);
  const frozen = frozenDays(freezes);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Weight</PageTitle>
        {/* Governs the whole tab, so it sits with the title rather than beside
            any one figure it happens to change. */}
        <UnitSwitch units={units} />
      </div>
      <MilestoneDialog milestone={milestone} />

      {showBanner && (
        <WaterWeightBanner
          gainLbs={fromLbs(overnightGain, units)}
          units={units}
          tags={priorTags}
          onDate={culpritDate}
          // Numbers-off meal logging: the reassurance stands on the
          // physiology alone rather than quoting a calorie figure the
          // person has chosen not to see.
          loggedKcal={
            !user.foodLogOnly && priorDayKcal > 0
              ? Math.round(priorDayKcal)
              : null
          }
        />
      )}
      {latest ? (
        <>
          <section
            className="tile mt-5 flex items-center gap-5 p-5"
            aria-label="Current reading"
          >
            {!tracking || trophy ? (
              <ProgressRing
                // The goal morning itself is already the trophy — the stored
                // acknowledgment only lands after this render.
                complete={trophy || milestone?.kind === "goal"}
                percent={progress}
                value={fromLbs(latest.weightLbs, units).toFixed(1)}
                unit={units}
                caption={readingCaption(latest, today, user.timezone)}
              />
            ) : (
              // Daily tracking without a finished cut: the reading, no ring.
              <div className="shrink-0 text-center">
                <p className="tnum text-4xl font-bold leading-none">
                  {fromLbs(latest.weightLbs, units).toFixed(1)}
                </p>
                <p className="mt-0.5 text-sm font-bold text-ink-faint">
                  {units}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {readingCaption(latest, today, user.timezone)}
                </p>
              </div>
            )}
            <div className="min-w-0 flex-1">
              {tracking && (
                <p className="text-sm text-ink-muted">
                  Just tracking, day to day.
                </p>
              )}
              {progress !== null && (
                <>
                  <p className="tnum text-3xl font-bold leading-none">
                    {progress.toFixed(0)}%
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">of the way there</p>
                </>
              )}
              {toGoal !== null && (
                <p className="tnum mt-3 text-sm text-ink-muted">
                  {toGoal <= 0
                    ? "Goal reached"
                    : `${formatWeight(toGoal, units)} to go`}
                </p>
              )}
              {toGoal !== null && toGoal > 0 && projection && (
                <GoalPace
                  projection={projection}
                  units={units}
                  today={today}
                />
              )}
            </div>
          </section>

          <dl className="mt-3 grid grid-cols-2 gap-3">
            <StatTile
              label="Since last"
              deltaLbs={sinceLast}
              units={units}
              neutral={tracking}
            />
            <StatTile
              label="Since start"
              deltaLbs={sinceStart}
              units={units}
              neutral={tracking}
            />
          </dl>

          <section
            className="tile mt-3 p-5"
            aria-label="This week"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">This week</p>
              <p className="tnum text-sm font-bold">
                {streak.current > 0
                  ? `🔥 ${streak.current} day${streak.current === 1 ? "" : "s"}`
                  : "no streak yet"}
              </p>
            </div>
            <WeekStrip
              days={week}
              logged={loggedDates}
              frozen={frozen}
              today={today}
            />
          </section>
        </>
      ) : (
        <p className="mt-6 text-sm text-ink-muted">
          No weigh-ins yet. Add this morning&rsquo;s to start the line, or{" "}
          <Link href="/calendar" className="underline underline-offset-2">
            open the calendar
          </Link>
          .
        </p>
      )}

      <WeighInForm
        today={today}
        existing={
          todayEntry ? round1(fromLbs(todayEntry.weightLbs, units)) : null
        }
        units={units}
      />

      <section className="mt-8" aria-label="Weight over time">
        <h2 className="eyebrow">Morning weight over time</h2>
        <LazyWeightChart
          points={entries.map((e) => ({
            date: e.date,
            weightLbs: e.weightLbs,
            trendLbs: trendByDate.get(e.date) ?? null,
          }))}
          goalLbs={goalWeightLbs}
          units={units}
        />
      </section>

      {entries.length > 0 && (
        <section className="mt-10" aria-label="Logged weigh-ins">
          <div className="flex items-baseline justify-between">
            <h2 className="eyebrow">Log</h2>
            <Link
              href="/calendar"
              className="eyebrow transition-colors hover:!text-ink"
            >
              Calendar
            </Link>
          </div>

          <ul className="card mt-3 divide-y divide-rule">
            {[...entries]
              .reverse()
              .slice(0, 30)
              .map((entry, i, list) => {
                const prior = list[i + 1];
                const delta = prior ? entry.weightLbs - prior.weightLbs : null;
                const time = loggedTime(entry, user.timezone);

                return (
                  <li
                    key={entry.date}
                    className="settle flex items-center gap-3 px-4 py-3"
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{formatDayShort(entry.date)}</p>
                      {/* Time and note share the sub-line. On the day label
                          "Mon, Aug 10 · 11:44 AM" wraps at 390px and doubles
                          the row height, which is most of this list. */}
                      {(time || entry.note) && (
                        <p className="truncate text-xs text-ink-muted">
                          {[time, entry.note].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>

                    <span className="tnum text-sm">
                      {fromLbs(entry.weightLbs, units).toFixed(1)}
                    </span>

                    {/* No delete button here. It sat one thumb-width from the
                        number on every row of a scrolling list, and a tester
                        lost a weigh-in to it — an accident that costs a trip
                        back to the scale. Correcting or clearing a day happens
                        on the calendar, where you pick the day first. */}
                    <span className="tnum w-24 text-right text-xs">
                      {delta === null ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <DeltaText
                          deltaLbs={delta}
                          units={units}
                          neutral={tracking}
                        />
                      )}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      <TrackingToggle trackingOnly={tracking} />
    </>
  );
}

/** The line under the reading: which day it is for, and when it was logged. */
function readingCaption(
  entry: { date: string; createdAt: Date },
  today: string,
  timezone: string,
) {
  return [
    entry.date === today ? "today" : formatDayShort(entry.date).toLowerCase(),
    loggedTime(entry, timezone),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A quiet forecast under "X to go": at the recent pace, roughly when the trend
 * reaches goal. Silent until there is enough history to mean it, and it names a
 * date only while the trend is actually heading toward the goal.
 */
function GoalPace({
  projection,
  units,
  today,
}: {
  projection: GoalProjection;
  units: Units;
  today: string;
}) {
  if (projection.kind === "stalled") {
    return (
      <p className="mt-1 text-sm text-ink-faint">
        Not trending toward your goal lately.
      </p>
    );
  }
  if (projection.kind !== "eta") return null; // reached / insufficient: say nothing

  const pace = `${formatWeight(Math.abs(projection.lbsPerWeek), units)}/wk`;
  if (projection.beyondYear) {
    return (
      <p className="mt-1 text-sm text-ink-muted">
        At about {pace} — over a year to goal.
      </p>
    );
  }
  return (
    <p className="mt-1 text-sm text-ink-muted">
      At about {pace}, on track for{" "}
      <span className="tnum font-semibold text-ink">
        ~{formatMonthDay(addDays(today, projection.daysToGoal))}
      </span>
      .
    </p>
  );
}

function StatTile({
  label,
  deltaLbs,
  units,
  neutral = false,
}: {
  label: string;
  deltaLbs: number | null;
  units: Units;
  neutral?: boolean;
}) {
  return (
    <div className="tile p-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="tnum mt-1 whitespace-nowrap text-xl font-bold">
        {deltaLbs === null ? (
          "—"
        ) : (
          <DeltaText deltaLbs={deltaLbs} units={units} neutral={neutral} />
        )}
      </dd>
    </div>
  );
}

/** Direction is carried by an arrow and a sign, never by color alone.
 *  `neutral` keeps the arrow but drops the judgment colours — worn in daily
 *  tracking mode, where a change is a number, not a verdict. */
function DeltaText({
  deltaLbs,
  units,
  neutral = false,
}: {
  deltaLbs: number;
  units: Units;
  neutral?: boolean;
}) {
  const flat = Math.abs(fromLbs(deltaLbs, units)) < 0.05;
  const tone =
    flat || neutral ? "text-ink-muted" : deltaLbs < 0 ? "text-down" : "text-up";
  const arrow = flat ? "" : deltaLbs < 0 ? "↓ " : "↑ ";

  return (
    <span className={tone}>
      {arrow}
      {formatDelta(deltaLbs, units)}
    </span>
  );
}

function clampPercent(n: number) {
  return Math.max(0, Math.min(100, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
