import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { todayIn, formatDayShort } from "@/lib/dates";
import { formatDelta, fromLbs, formatWeight, type Units } from "@/lib/units";
import { PageTitle } from "@/components/page-title";
import { UnitSwitch } from "@/components/unit-switch";
import { WeighInForm } from "@/components/weigh-in-form";
import { WeightChart } from "@/components/weight-chart";
import { deleteWeightAction } from "@/app/actions/weight";
import { WaterWeightBanner } from "@/components/water-weight-banner";
import { ProgressRing } from "@/components/progress-ring";
import { WeekStrip } from "@/components/week-strip";
import { milestoneReached, weekEnding, weighInStreak } from "@/lib/calendar";
import { MilestoneBanner } from "@/components/milestone-banner";
import { flaggedMeals, rollingAverage } from "@/lib/nutrition";
import { addDays } from "@/lib/dates";

// Auth state and the log itself change per request; nothing here may be
// prerendered at build time.
export const dynamic = "force-dynamic";

export default async function WeightPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  // Scoped to this account — the other user's log is never read here.
  const entries = await prisma.weightEntry.findMany({
    where: { userId: user.id },
    orderBy: { date: "asc" },
  });

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

  const { units, goalWeightLbs } = user;
  const today = todayIn(user.timezone);

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

  const loggedDates = new Set(entries.map((e) => e.date));
  const week = weekEnding(today);
  const streak = weighInStreak([...loggedDates], today);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Weight</PageTitle>
        {/* Governs the whole tab, so it sits with the title rather than beside
            any one figure it happens to change. */}
        <UnitSwitch units={units} />
      </div>
      <MilestoneBanner
        milestone={milestoneReached({
          startLbs,
          currentLbs: latest?.weightLbs ?? null,
          goalLbs: goalWeightLbs,
          alreadyShown: user.milestoneLbs,
        })}
        units={units}
      />

      {showBanner && (
        <WaterWeightBanner
          gainLbs={fromLbs(overnightGain, units)}
          units={units}
          tags={priorTags}
          onDate={culpritDate}
        />
      )}
      {latest ? (
        <>
          <section
            className="tile mt-5 flex items-center gap-5 p-5"
            aria-label="Current reading"
          >
            <ProgressRing
              percent={progress}
              value={fromLbs(latest.weightLbs, units).toFixed(1)}
              unit={units}
              caption={
                latest.date === today
                  ? "today"
                  : formatDayShort(latest.date).toLowerCase()
              }
            />
            <div className="min-w-0 flex-1">
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
            </div>
          </section>

          <dl className="mt-3 grid grid-cols-2 gap-3">
            <StatTile label="Since last" deltaLbs={sinceLast} units={units} />
            <StatTile label="Since start" deltaLbs={sinceStart} units={units} />
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
            <WeekStrip days={week} logged={loggedDates} today={today} />
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
        <WeightChart
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

                return (
                  <li
                    key={entry.date}
                    className="settle flex items-center gap-3 px-4 py-3"
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{formatDayShort(entry.date)}</p>
                      {entry.note && (
                        <p className="truncate text-xs text-ink-muted">
                          {entry.note}
                        </p>
                      )}
                    </div>

                    <span className="tnum text-sm">
                      {fromLbs(entry.weightLbs, units).toFixed(1)}
                    </span>

                    <span className="tnum w-24 text-right text-xs">
                      {delta === null ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <DeltaText deltaLbs={delta} units={units} />
                      )}
                    </span>

                    <form action={deleteWeightAction}>
                      <input type="hidden" name="date" value={entry.date} />
                      <button
                        type="submit"
                        aria-label={`Delete the weigh-in for ${formatDayShort(entry.date)}`}
                        className="px-1 text-lg leading-none text-ink-faint transition-colors hover:text-up"
                      >
                        ×
                      </button>
                    </form>
                  </li>
                );
              })}
          </ul>
        </section>
      )}
    </>
  );
}

function StatTile({
  label,
  deltaLbs,
  units,
}: {
  label: string;
  deltaLbs: number | null;
  units: Units;
}) {
  return (
    <div className="tile p-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="tnum mt-1 whitespace-nowrap text-xl font-bold">
        {deltaLbs === null ? "—" : <DeltaText deltaLbs={deltaLbs} units={units} />}
      </dd>
    </div>
  );
}

/** Direction is carried by an arrow and a sign, never by color alone. */
function DeltaText({ deltaLbs, units }: { deltaLbs: number; units: Units }) {
  const flat = Math.abs(fromLbs(deltaLbs, units)) < 0.05;
  const tone = flat ? "text-ink-muted" : deltaLbs < 0 ? "text-down" : "text-up";
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
