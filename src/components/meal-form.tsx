"use client";

import { useActionState, useState } from "react";
import { saveMealAction, type MealActionResult } from "@/app/actions/meals";
import { suggestMealName } from "@/lib/meals";

const INITIAL: MealActionResult = { ok: false };

export function MealForm({
  date,
  aiEnabled,
}: {
  date: string;
  /** False when no GEMINI_API_KEY is configured. */
  aiEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveMealAction, INITIAL);
  const [name, setName] = useState(() => suggestMealName(new Date().getHours()));
  const [note, setNote] = useState("");
  const [showMacros, setShowMacros] = useState(false);

  // Whether the description goes to the estimator is carried by the submit
  // button's own name/value, which the browser serialises natively. A React
  // state flag set in onClick would race the submission.
  const [pendingAi, setPendingAi] = useState(false);

  return (
    <form
      action={(formData) => {
        formAction(formData);
        setNote("");
        setName(suggestMealName(new Date().getHours()));
      }}
      className="card mt-4 p-5"
    >
      <input type="hidden" name="date" value={date} />

      <label htmlFor="name" className="eyebrow block">
        Meal
      </label>
      <input
        id="name"
        name="name"
        type="text"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name it anything"
        className="
          mt-2 w-full border-b border-rule bg-transparent pb-1 text-lg
          placeholder:text-ink-faint focus:border-trace focus:outline-none
        "
      />

      <label htmlFor="note" className="eyebrow block mt-5 block">
        What you ate
      </label>
      <textarea
        id="note"
        name="note"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Two eggs, sourdough toast with butter, black coffee"
        className="
          mt-2 w-full rounded-lg bg-surface-sunk p-3 text-sm
          placeholder:text-ink-faint focus:outline-2 focus:outline-trace
        "
      />

      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
        <div>
          <label htmlFor="calories" className="eyebrow block">
            Calories
          </label>
          <input
            id="calories"
            name="calories"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="—"
            className="
              tnum mt-1.5 w-24 border-b border-rule bg-transparent pb-1 text-lg
              placeholder:text-ink-faint focus:border-trace focus:outline-none
            "
          />
        </div>

        {/* The box and the AI button look like alternatives and are not: a
            typed total is kept and the estimate is scaled to match it. Nothing
            in the layout said so. */}
        <p className="w-full order-last text-xs text-ink-muted">
          Know the total? Type it — an estimate will be split to add up to it.
        </p>

        <button
          type="button"
          onClick={() => setShowMacros((v) => !v)}
          aria-expanded={showMacros}
          className="eyebrow pb-2 transition-colors hover:!text-ink"
        >
          {showMacros ? "− Macros" : "+ Macros"}
        </button>
      </div>

      {showMacros && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
          <GramField id="protein" label="Protein" tint="var(--protein)" />
          <GramField id="carbs" label="Carbs" tint="var(--carbs)" />
          <GramField id="fat" label="Fat" tint="var(--fat)" />
          <GramField id="fiber" label="Fiber" tint="var(--carbs)" />
          <GramField id="sodium" label="Sodium (mg)" tint="var(--fat)" />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          name="estimate"
          value="0"
          onClick={() => setPendingAi(false)}
          disabled={pending || note.trim() === "" || name.trim() === ""}
          className="btn btn-soft flex-1"
        >
          Log it
        </button>

        <button
          type="submit"
          name="estimate"
          value="1"
          onClick={() => setPendingAi(true)}
          disabled={
            pending || note.trim() === "" || name.trim() === "" || !aiEnabled
          }
          title={
            aiEnabled
              ? undefined
              : "Add GEMINI_API_KEY to your environment to turn this on."
          }
          className="btn btn-primary flex-1"
        >
          {pending && pendingAi ? "Estimating" : "Estimate for me"}
        </button>
      </div>

      {!aiEnabled && (
        <p className="mt-3 text-xs text-ink-muted">
          Estimation is off. Add a Gemini API key to your environment to turn it
          on.
        </p>
      )}

      <p
        role="status"
        className={`mt-3 text-sm ${state.error ? "text-up" : "text-ink-muted"}`}
      >
        {state.error ?? (state.ok ? (state.note ?? "Logged.") : "")}
      </p>
    </form>
  );
}

function GramField({
  id,
  label,
  tint,
}: {
  id: string;
  label: string;
  tint: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: tint }}
        />
        {label} (g)
      </label>
      <input
        id={id}
        name={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="—"
        className="
          tnum mt-1.5 w-20 border-b border-rule bg-transparent pb-1 text-base
          placeholder:text-ink-faint focus:border-trace focus:outline-none
        "
      />
    </div>
  );
}
