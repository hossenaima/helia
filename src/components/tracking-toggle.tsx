"use client";

import { useActionState } from "react";
import {
  setTrackingModeAction,
  type SettingsResult,
} from "@/app/actions/settings";

/**
 * The Weight tab's mode switch. Daily tracking drops the goal UI and the
 * up/down verdicts — just the log — without touching what is stored; goal
 * mode brings them back. Quiet and at the bottom of the tab: it is a mode,
 * not a daily control.
 */
export function TrackingToggle({ trackingOnly }: { trackingOnly: boolean }) {
  const [state, formAction, pending] = useActionState(setTrackingModeAction, {
    ok: false,
  } as SettingsResult);

  return (
    <section className="mt-10" aria-label="Tracking mode">
      <form
        action={formAction}
        className="card flex items-start justify-between gap-4 p-5"
      >
        <input
          type="hidden"
          name="trackingOnly"
          value={trackingOnly ? "0" : "1"}
        />
        <div className="min-w-0">
          <p className="text-sm font-bold">
            {trackingOnly ? "Daily tracking" : "Working toward a goal"}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {trackingOnly
              ? "No goal, no up or down — just the log. Your goal settings are kept."
              : "Prefer no goal hanging over the numbers? Switch to plain day-to-day tracking any time."}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-quiet shrink-0 !py-2"
        >
          {pending ? "…" : trackingOnly ? "Goal mode" : "Just track"}
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
