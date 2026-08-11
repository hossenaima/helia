"use client";

import { useState, useTransition } from "react";
import { cancelFreezeAction, scheduleFreezeAction } from "@/app/actions/weight";
import { formatDayShort } from "@/lib/dates";

export type Freeze = { id: string; startDate: string; endDate: string };

/**
 * Declare the days you will be away from a scale.
 *
 * A `<details>`, because most mornings this is not what anybody came here for.
 * The dates are native `<input type="date">` — the phone's own picker beats
 * anything hand-rolled, and `min` gives the "today or later" rule to the
 * keyboard as well as to the server.
 *
 * Actions are called directly through `useTransition` rather than through a
 * `<form action>`: React resets a form after an action returns, *including*
 * after a rejected one, which would empty both dates and leave an error
 * pointing at fields the form had just cleared.
 */
export function StreakFreeze({
  freezes,
  today,
}: {
  freezes: Freeze[];
  today: string;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await scheduleFreezeAction({
        startDate: start,
        // One-day trips are a trip: an empty end date means the start day.
        endDate: end || start,
      });
      if (result.ok) {
        setStart("");
        setEnd("");
      } else {
        setError(result.error ?? "Could not save that.");
      }
    });
  }

  function cancel(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await cancelFreezeAction(id);
      if (!result.ok) setError(result.error ?? "Could not cancel that.");
    });
  }

  return (
    <details className="card mt-3 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Going away? Freeze your streak
      </summary>

      <p className="mt-3 text-sm text-ink-muted">
        Days you pick will not break your streak — and will not add to it
        either. Pick them before you go: a freeze cannot cover a day already
        past.
      </p>

      {/* Each field takes half the row and the button wraps below it. The
          native date control is ~154px at its intrinsic width, which is two
          pixels too wide for two of them side by side on a 390px screen. */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[8rem] flex-1">
          <label htmlFor="freeze-start" className="eyebrow block">
            First day
          </label>
          <input
            id="freeze-start"
            type="date"
            min={today}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1.5 w-full rounded-lg bg-surface-sunk px-3 py-2 text-sm focus:outline-2 focus:outline-trace"
          />
        </div>
        <div className="min-w-[8rem] flex-1">
          <label htmlFor="freeze-end" className="eyebrow block">
            Last day
          </label>
          <input
            id="freeze-end"
            type="date"
            min={start || today}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1.5 w-full rounded-lg bg-surface-sunk px-3 py-2 text-sm focus:outline-2 focus:outline-trace"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy || start === ""}
          className="btn btn-soft"
        >
          {busy ? "Saving" : "Freeze these days"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-up">
          {error}
        </p>
      )}

      {freezes.length > 0 && (
        <ul className="mt-4 divide-y divide-rule border-t border-rule">
          {freezes.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span aria-hidden>❄️</span>
              <span className="min-w-0 flex-1">
                {f.startDate === f.endDate
                  ? formatDayShort(f.startDate)
                  : `${formatDayShort(f.startDate)} – ${formatDayShort(f.endDate)}`}
              </span>
              {f.startDate > today ? (
                <button
                  type="button"
                  onClick={() => cancel(f.id)}
                  disabled={busy}
                  className="eyebrow transition-colors hover:!text-up"
                >
                  Cancel
                </button>
              ) : (
                <span className="eyebrow">Under way</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
