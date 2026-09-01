"use client";

import { useActionState } from "react";
import {
  setFoodLogModeAction,
  setTrackingModeAction,
  type SettingsResult,
} from "@/app/actions/settings";

/**
 * The quiet mode switches at the bottom of a tab. Each mode drops a layer of
 * judgment — the goal UI on Weight, the numbers on Meals — without touching
 * what is stored; flipping back restores everything. A mode, not a daily
 * control, which is why it sits last on the page.
 */

export function TrackingToggle({ trackingOnly }: { trackingOnly: boolean }) {
  return (
    <ModeToggle
      action={setTrackingModeAction}
      field="trackingOnly"
      on={trackingOnly}
      titleOn="Daily tracking"
      titleOff="Working toward a goal"
      bodyOn="No goal, no up or down — just the log. Your goal settings are kept."
      bodyOff="Prefer no goal hanging over the numbers? Switch to plain day-to-day tracking any time."
      buttonOn="Goal mode"
      buttonOff="Just track"
    />
  );
}

export function FoodLogToggle({ foodLogOnly }: { foodLogOnly: boolean }) {
  return (
    <ModeToggle
      action={setFoodLogModeAction}
      field="foodLogOnly"
      on={foodLogOnly}
      titleOn="Simple meal log"
      titleOff="Counting calories"
      bodyOn="Just what you ate, in your words — no numbers. Your targets and past estimates are kept."
      bodyOff="Rather not see the numbers? Switch to a simple log of what you ate any time."
      buttonOn="Count calories"
      buttonOff="Just log meals"
    />
  );
}

function ModeToggle({
  action,
  field,
  on,
  titleOn,
  titleOff,
  bodyOn,
  bodyOff,
  buttonOn,
  buttonOff,
}: {
  action: (
    prev: SettingsResult,
    formData: FormData,
  ) => Promise<SettingsResult>;
  field: string;
  on: boolean;
  titleOn: string;
  titleOff: string;
  bodyOn: string;
  bodyOff: string;
  buttonOn: string;
  buttonOff: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    ok: false,
  } as SettingsResult);

  return (
    <section className="mt-10" aria-label="Tracking mode">
      <form
        action={formAction}
        className="card flex items-start justify-between gap-4 p-5"
      >
        <input type="hidden" name={field} value={on ? "0" : "1"} />
        <div className="min-w-0">
          <p className="text-sm font-bold">{on ? titleOn : titleOff}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{on ? bodyOn : bodyOff}</p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-quiet shrink-0 !py-2"
        >
          {pending ? "…" : on ? buttonOn : buttonOff}
        </button>
      </form>
      {state.message && (
        <p role="status" className="mt-2 text-sm text-ink-muted">
          {state.message}
        </p>
      )}
    </section>
  );
}
