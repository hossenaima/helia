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
}: {
  gainLbs: number;
  units: string;
  tags: DayTag[];
  onDate: string | null;
}) {
  const causes = [
    tags.includes("high_sodium") && "a high-sodium meal",
    tags.includes("high_volume") && "a lot of fiber",
  ].filter(Boolean) as string[];
  const named = causes.length > 0 && onDate !== null;

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
            sodium and fiber both pull water into the body and it clears over a
            day or two.
          </>
        ) : (
          <>
            . A jump that size overnight is water and digestion, not fat — a
            pound of fat is thousands of calories, and sodium, fiber, a late
            meal or a short night all move the scale on their own.
          </>
        )}{" "}
        Watch the 7-day average instead.
      </p>
    </aside>
  );
}
