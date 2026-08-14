import { formatDayShort } from "@/lib/dates";
import type { DayTag } from "@/lib/nutrition";

/**
 * The "no-panic" note. An overnight jump is water and digestion whatever the
 * cause — a pound of fat is thousands of calories, which is not something a
 * night can do — and the number on its own invites exactly the wrong
 * conclusion, so the app says what it knows. A flagged meal the evening before
 * gets named; without one the physiology still holds, and a bad morning with
 * nothing logged is the one most in need of the reassurance.
 */
export function WaterWeightBanner({
  gainLbs,
  units,
  tags,
  onDate,
  loggedKcal,
}: {
  gainLbs: number;
  units: string;
  tags: DayTag[];
  onDate: string | null;
  /** What was logged the day before, or null if the day was empty. */
  loggedKcal: number | null;
}) {
  const causes = [
    tags.includes("high_sodium") && "a high-sodium meal",
    tags.includes("high_carb") && "a carb-heavy meal",
    tags.includes("high_volume") && "a lot of fiber",
  ].filter(Boolean) as string[];
  const named = causes.length > 0 && onDate !== null;

  // The energy it would take to store the jump as fat, in the user's own unit.
  const unitWord = units === "kg" ? "kilo" : "pound";
  const fatKcalPerUnit = units === "kg" ? 7700 : 3500;

  return (
    <aside
      role="note"
      className="
        mt-5 rounded-xl border-l-[3px] border-goal bg-surface p-4
        shadow-[var(--lift-sm)]
      "
    >
      <p className="eyebrow !text-goal">Before you panic</p>
      <p className="mt-1.5 text-sm">
        You are up{" "}
        <span className="tnum font-medium">
          {gainLbs.toFixed(1)} {units}
        </span>{" "}
        since yesterday
        {named ? (
          <>
            , and you logged {causes.join(" and ")} on{" "}
            {formatDayShort(onDate!)}. That is water and digestion, not fat —
            salt, carbs and fiber all make the body hold water, and it clears
            over a day or two.
          </>
        ) : (
          <>
            . A jump that size overnight is water and digestion, not fat — a{" "}
            {unitWord} of fat is thousands of calories, and sodium, carbs,
            fiber, a late meal or a short night all move the scale on their own.
          </>
        )}{" "}
        Watch the 7-day average instead.
      </p>
      {loggedKcal !== null && (
        <p className="mt-2 text-sm text-ink-muted">
          You logged about{" "}
          <span className="tnum font-medium text-ink">
            {loggedKcal.toLocaleString()} kcal
          </span>{" "}
          yesterday — a {unitWord} of fat is roughly{" "}
          {fatKcalPerUnit.toLocaleString()}, so the maths says water, not fat.
        </p>
      )}
    </aside>
  );
}
