import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { frozenDays, weighInStreak } from "@/lib/calendar";
import { PageTitle } from "@/components/page-title";
import { WeightCalendar } from "@/components/weight-calendar";
import { HealthImport } from "@/components/health-import";
import { StreakTile } from "@/components/streak-tile";
import { StreakFreeze } from "@/components/streak-freeze";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [entries, freezes] = await Promise.all([
    prisma.weightEntry.findMany({
      where: { userId: user.id },
      orderBy: { date: "asc" },
      select: { date: true, weightLbs: true, source: true },
    }),
    prisma.streakFreeze.findMany({
      where: { userId: user.id },
      orderBy: { startDate: "asc" },
      select: { id: true, startDate: true, endDate: true },
    }),
  ]);

  const today = todayIn(user.timezone);
  const streak = weighInStreak(entries, freezes, today);

  return (
    <>
      <PageTitle>Calendar</PageTitle>
      <p className="mt-2 text-sm text-ink-muted">
        Tap any day to log or fix a weigh-in.
      </p>

      <StreakTile current={streak.current} best={streak.best} />

      <StreakFreeze
        // Past freezes are history nobody needs to scroll; the ones still worth
        // seeing are the ones still doing something.
        freezes={freezes.filter((f) => f.endDate >= today)}
        today={today}
      />

      <WeightCalendar
        entries={entries}
        frozen={[...frozenDays(freezes)]}
        today={today}
        units={user.units}
      />

      <section className="mt-8">
        <h2 className="eyebrow">Bring in history</h2>
        <HealthImport units={user.units} />
      </section>

      <Link
        href="/"
        className="eyebrow mt-8 inline-block transition-colors hover:!text-ink"
      >
        ← Back to weight
      </Link>
    </>
  );
}
