"use client";

import { useActionState, useState } from "react";
import {
  changePasswordAction,
  saveEmailAction,
  setDigestAction,
  saveSettingsAction,
  type SettingsResult,
} from "@/app/actions/settings";
import { toLbs, type Units } from "@/lib/units";

/** Clinical rule-of-thumb floors, kept here so both cautions read from one place. */
const MIN_CALORIES = 1200;
const UNDERWEIGHT_BMI = 18.5;

/** BMI from a weight already in pounds and a height in inches, or null. */
function bmi(lbs: number | null, inches: number | null): number | null {
  if (lbs === null || inches === null || inches <= 0) return null;
  return (703 * lbs) / (inches * inches);
}

function num(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

const INITIAL: SettingsResult = { ok: false };

export function GoalForm({
  units,
  goalWeight,
  startWeight,
  heightInches,
  calorieTarget,
  proteinTargetG,
  fiberTargetG,
}: {
  units: Units;
  goalWeight: number | null;
  startWeight: number | null;
  heightInches: number | null;
  calorieTarget: number | null;
  proteinTargetG: number | null;
  fiberTargetG: number | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveSettingsAction,
    INITIAL,
  );

  // Live values for the two gentle cautions. Seeded from what is saved so a
  // dangerous figure already on file is flagged the moment the form opens.
  const [goalStr, setGoalStr] = useState(goalWeight?.toString() ?? "");
  const [heightStr, setHeightStr] = useState(heightInches?.toString() ?? "");
  const [calorieStr, setCalorieStr] = useState(calorieTarget?.toString() ?? "");

  const calorieCaution =
    num(calorieStr) !== null && num(calorieStr)! < MIN_CALORIES
      ? `Below about ${MIN_CALORIES.toLocaleString()} kcal a day is very low — worth checking with a professional first.`
      : null;

  // Goal weight is typed in the unit selected on this form; height is inches.
  const goalNum = num(goalStr);
  const goalBmi = bmi(
    goalNum === null ? null : toLbs(goalNum, units),
    num(heightStr),
  );
  const goalCaution =
    goalBmi !== null && goalBmi < UNDERWEIGHT_BMI
      ? "This goal is in the underweight range for your height — worth a word with a professional."
      : null;

  return (
    <form action={formAction} className="mt-4 rounded-xl border border-rule bg-surface p-5">
      <fieldset>
        <legend className="eyebrow">Units</legend>
        <div className="mt-2 flex gap-2">
          {(["lb", "kg"] as const).map((option) => (
            <label
              key={option}
              className="
                chip cursor-pointer border border-rule text-ink-muted
                has-[:checked]:border-ink has-[:checked]:bg-ink
                has-[:checked]:text-ground
              "
            >
              <input
                type="radio"
                name="units"
                value={option}
                defaultChecked={units === option}
                className="sr-only"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="mt-3 text-xs text-ink-muted">
        Weights below are read in the unit selected here.
      </p>

      <NumberField
        id="goalWeight"
        name="goalWeight"
        label={`Goal weight (${units})`}
        defaultValue={goalWeight}
        onValue={setGoalStr}
        caution={goalCaution}
      />
      <NumberField
        id="startWeight"
        name="startWeight"
        label={`Start weight (${units})`}
        hint="Leave blank to use your earliest weigh-in."
        defaultValue={startWeight}
      />
      <NumberField
        id="heightInches"
        name="heightInches"
        label="Height (inches)"
        defaultValue={heightInches}
        onValue={setHeightStr}
      />

      <div className="mt-7 border-t border-rule pt-5">
        <p className="eyebrow">Daily targets</p>
        <p className="mt-1 text-xs text-ink-muted">
          Drives your remaining-calorie budget, the progress bars, and what
          &ldquo;What can I eat?&rdquo; suggests. Left blank, those stay hidden
          rather than guessing a number for you. General wellness targets, not
          medical advice.
        </p>

        <NumberField
          id="calorieTarget"
          name="calorieTarget"
          label="Calories"
          defaultValue={calorieTarget}
          onValue={setCalorieStr}
          caution={calorieCaution}
        />
        <NumberField
          id="proteinTargetG"
          name="proteinTargetG"
          label="Protein (g)"
          defaultValue={proteinTargetG}
        />
        <NumberField
          id="fiberTargetG"
          name="fiberTargetG"
          label="Fiber (g)"
          defaultValue={fiberTargetG}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary mt-6 w-full"
      >
        {pending ? "Saving" : "Save goal"}
      </button>

      <Status state={state} />
    </form>
  );
}

/**
 * The announcement email.
 *
 * Its own small form rather than a field on the goal form: it saves to a
 * different action, and burying an address people are asked to consent to
 * inside a form about goal weight would be the wrong place to ask.
 */
export function EmailForm({ email }: { email: string | null }) {
  const [state, formAction, pending] = useActionState(saveEmailAction, INITIAL);

  return (
    <form action={formAction} className="mt-4 rounded-xl border border-rule bg-surface p-5">
      <label htmlFor="email" className="eyebrow block">
        Email
      </label>
      <p className="mt-1 text-xs text-ink-muted">
        Only for occasional notes about new features — never your weigh-ins or
        meals. Clear the box to stop them.
      </p>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        maxLength={254}
        defaultValue={email ?? ""}
        placeholder="you@example.com"
        className="
          mt-2 w-full border-b border-rule bg-transparent pb-1 text-lg
          placeholder:text-ink-faint focus:border-trace focus:outline-none
        "
      />

      <button
        type="submit"
        disabled={pending}
        className="btn btn-quiet mt-6 w-full"
      >
        {pending ? "Saving" : "Save email"}
      </button>

      <Status state={state} />
    </form>
  );
}

/**
 * The Monday digest switch.
 *
 * Its own form because it is a different consent from the address above it —
 * and it is disabled without one, since there would be nowhere to send it.
 */
export function DigestForm({
  enabled,
  hasEmail,
}: {
  enabled: boolean;
  hasEmail: boolean;
}) {
  const [state, formAction, pending] = useActionState(setDigestAction, INITIAL);

  return (
    <form action={formAction} className="mt-3 rounded-xl border border-rule bg-surface p-5">
      <input type="hidden" name="notifyDigest" value={enabled ? "0" : "1"} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold">Weekly digest</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            A Monday summary of your week — the days you logged, your trend, and
            what you ate. {hasEmail ? "" : "Add an email above to turn it on."}
          </p>
        </div>
        <button
          type="submit"
          disabled={pending || (!hasEmail && !enabled)}
          className={`btn shrink-0 !py-2 ${enabled ? "btn-quiet" : "btn-primary"}`}
        >
          {pending ? "…" : enabled ? "Turn off" : "Turn on"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="mt-4 rounded-xl border border-rule bg-surface p-5">
      <SecretField
        id="currentPassword"
        name="currentPassword"
        label="Current password"
      />
      <SecretField id="newPassword" name="newPassword" label="New password" />
      <SecretField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm new password"
      />

      <button
        type="submit"
        disabled={pending}
        className="btn btn-quiet mt-6 w-full"
      >
        {pending ? "Updating" : "Change password"}
      </button>

      <Status state={state} />
    </form>
  );
}

function NumberField({
  id,
  name,
  label,
  hint,
  defaultValue,
  onValue,
  caution,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultValue: number | null;
  onValue?: (value: string) => void;
  /** A gentle, non-blocking note shown under the field. */
  caution?: string | null;
}) {
  return (
    <div className="mt-5">
      <label htmlFor={id} className="eyebrow block">
        {label}
      </label>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={defaultValue === null ? "" : String(defaultValue)}
        onChange={onValue ? (e) => onValue(e.target.value) : undefined}
        placeholder="—"
        className="
          tnum mt-2 w-32 border-b border-rule bg-transparent pb-1 text-lg
          placeholder:text-ink-faint focus:border-trace focus:outline-none
        "
      />
      {caution && (
        <p className="mt-2 max-w-xs text-xs text-up">{caution}</p>
      )}
    </div>
  );
}

/**
 * No `inputMode="numeric"` and no `pattern="\d*"` — both were right for a PIN
 * and would now stop people typing the letters the password rules ask for. On
 * a phone the numeric keypad alone would have.
 */
function SecretField({
  id,
  name,
  label,
}: {
  id: string;
  name: string;
  label: string;
}) {
  return (
    <div className="mt-5 first:mt-0">
      <label htmlFor={id} className="eyebrow block">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="password"
        autoComplete="off"
        autoCapitalize="none"
        maxLength={200}
        className="
          mt-2 w-full border-b border-rule bg-transparent pb-1 text-lg
          focus:border-trace focus:outline-none
        "
      />
    </div>
  );
}

function Status({ state }: { state: SettingsResult }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      role="status"
      className={`mt-3 text-sm ${state.error ? "text-up" : "text-ink-muted"}`}
    >
      {state.error ?? state.message}
    </p>
  );
}
