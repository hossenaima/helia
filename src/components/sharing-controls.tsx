"use client";

import { useState, useTransition } from "react";
import { setSharingAction } from "@/app/actions/friends";

/**
 * What your friends see of you.
 *
 * Weight lives here because it is one answer for everybody — the number is the
 * same number whoever is looking. Food does not: it is a switch on each
 * friend's own card, where the person it applies to is on screen.
 *
 * Stated as "friends can see", not "share my…", because the thing worth being
 * unambiguous about is who ends up looking. Held locally so a tap answers
 * immediately; the server is the record but not the render.
 */
export function SharingControls({
  shareWeight,
  friendCount,
}: {
  shareWeight: boolean;
  friendCount: number;
}) {
  const [weight, setWeight] = useState(shareWeight);
  const [, startSaving] = useTransition();

  return (
    <section className="mt-8" aria-label="What friends can see">
      <h2 className="eyebrow">What friends can see</h2>
      <div className="card mt-3 p-5">
        <p className="text-xs text-ink-muted">
          {friendCount === 0
            ? "Applies to everyone you add."
            : `Applies to all ${friendCount} of your friends.`}{" "}
          Your streak is always visible — it says you turned up, not what the
          scale said.
        </p>

        <div className="mt-4 space-y-1">
          <Toggle
            label="Weight"
            hint="Your latest weigh-in, the change since the one before, and your last seven days."
            checked={weight}
            onChange={(v) => {
              setWeight(v);
              startSaving(async () => {
                await setSharingAction({ shareWeight: v });
              });
            }}
          />
        </div>

        <p className="mt-4 text-xs text-ink-muted">
          Meals are set per friend — open someone&rsquo;s card to choose whether
          they see your food.
        </p>
      </div>
    </section>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="
          relative h-6 w-10 shrink-0 rounded-full bg-rule transition-colors
          peer-checked:bg-trace peer-focus-visible:outline-2
          peer-focus-visible:outline-offset-2 peer-focus-visible:outline-trace
          after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5
          after:rounded-full after:bg-ground after:transition-transform
          after:content-[''] peer-checked:after:translate-x-4
        "
      />
    </label>
  );
}
