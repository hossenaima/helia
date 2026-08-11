"use client";

import { useMemo, useState, useTransition } from "react";
import {
  WEEKDAY_INITIALS,
  monthGrid,
  monthKey,
  monthLabel,
  shiftMonth,
} from "@/lib/calendar";
import { formatDayLong } from "@/lib/dates";
import { fromLbs, type Units } from "@/lib/units";
import { saveWeightForDateAction } from "@/app/actions/weight";

export type CalendarEntry = { date: string; weightLbs: number };

/**
 * Tap a day, type a weight. Replaces a paste box that required the date to be
 * typed in a format you had to learn — here the date is the thing you touch,
 * so there is no format to get wrong.
 */
export function WeightCalendar({
  entries,
  frozen,
  today,
  units,
}: {
  entries: CalendarEntry[];
  /** Declared days away — marked so a gap in the grid explains itself. */
  frozen: string[];
  today: string;
  units: Units;
}) {
  const byDate = useMemo(
    () => new Map(entries.map((e) => [e.date, e.weightLbs])),
    [entries],
  );
  const frozenSet = useMemo(() => new Set(frozen), [frozen]);

  const [month, setMonth] = useState(() => monthKey(today));
  const [selected, setSelected] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const weeks = useMemo(() => monthGrid(month), [month]);

  function pick(day: string) {
    setSelected(day);
    setError(null);
    const existing = byDate.get(day);
    setValue(existing === undefined ? "" : String(round1(fromLbs(existing, units))));
  }

  function save() {
    if (!selected) return;
    startSaving(async () => {
      const result = await saveWeightForDateAction({
        date: selected,
        weight: value.trim() === "" ? null : Number(value),
      });
      if (result.ok) {
        setSelected(null);
        setValue("");
      } else {
        setError(result.error ?? "Could not save that.");
      }
    });
  }

  return (
    <div className="card mt-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Previous month"
          className="rounded-full px-3 py-1.5 text-lg leading-none text-ink-muted transition-colors hover:bg-surface-sunk"
        >
          ‹
        </button>
        <p className="font-bold">{monthLabel(month)}</p>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= monthKey(today)}
          aria-label="Next month"
          className="rounded-full px-3 py-1.5 text-lg leading-none text-ink-muted transition-colors hover:bg-surface-sunk disabled:opacity-25"
        >
          ›
        </button>
      </div>

      <div className="mx-auto mt-4 grid max-w-[22rem] grid-cols-7 gap-1.5 text-center">
        {WEEKDAY_INITIALS.map((d, i) => (
          <span key={i} className="pb-0.5 text-[0.7rem] font-bold text-ink-faint">
            {d}
          </span>
        ))}

        {weeks.flat().map((day, i) => {
          if (!day) return <span key={`pad-${i}`} />;

          const entry = byDate.get(day);
          const logged = entry !== undefined;
          const isToday = day === today;
          const isSelected = day === selected;
          const future = day > today;
          const isFrozen = !logged && frozenSet.has(day);
          const reading =
            entry === undefined ? null : round1(fromLbs(entry, units)).toFixed(1);

          return (
            <button
              key={day}
              type="button"
              disabled={future}
              onClick={() => pick(day)}
              aria-label={`${formatDayLong(day)}${
                reading
                  ? `, ${reading} ${units}`
                  : isFrozen
                    ? ", frozen"
                    : ", not logged"
              }`}
              aria-pressed={isSelected}
              className={`
                relative flex aspect-square flex-col items-center justify-center
                rounded-xl leading-none font-semibold
                transition-colors
                ${/* A frozen day stays legible even though it is in the
                      future — it is the one future day worth seeing. */ ""}
                ${future && !isFrozen ? "opacity-20" : ""}
                ${isToday && !isSelected ? "ring-2 ring-ink/25" : ""}
                ${
                  isSelected
                    ? "bg-ink text-ground"
                    : logged
                      ? "bg-trace/12 text-ink"
                      : isFrozen
                        ? "bg-surface-sunk text-ink-faint"
                        : "text-ink-muted hover:bg-surface-sunk"
                }
              `}
            >
              {/* With a reading to show, the date steps back and becomes the
                  label — the number is what the day is now worth looking at
                  for. Empty days keep the date at full size. */}
              <span
                className={
                  reading
                    ? `text-[0.6rem] font-bold ${isSelected ? "opacity-70" : "text-ink-faint"}`
                    : "text-sm"
                }
              >
                {Number(day.slice(8))}
              </span>
              {reading && (
                <span className="tnum mt-0.5 text-[0.68rem] font-bold">
                  {reading}
                </span>
              )}
              {isFrozen && (
                <span aria-hidden className="mt-0.5 text-[0.6rem] leading-none">
                  ❄️
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-5 rounded-2xl bg-surface-sunk p-4">
          <label htmlFor="cal-weight" className="eyebrow block">
            {formatDayLong(selected)}
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="cal-weight"
              type="text"
              inputMode="decimal"
              autoFocus
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="000.0"
              className="tnum w-32 rounded-xl bg-surface px-3 py-2 text-2xl font-bold focus:outline-2 focus:outline-trace"
            />
            <span className="text-sm text-ink-muted">{units}</span>

            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-ground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "Saving" : byDate.has(selected) ? "Update" : "Save"}
              </button>
            </div>
          </div>

          {byDate.has(selected) && (
            <p className="mt-2 text-xs text-ink-muted">
              Clear the box and save to delete this weigh-in.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-up">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
