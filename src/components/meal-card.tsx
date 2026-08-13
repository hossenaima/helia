"use client";

import { useState, useTransition } from "react";
import { MacroBar } from "@/components/macro-bar";
import {
  addMealItemAction,
  deleteMealAction,
  renameMealAction,
  updateMealItemsAction,
} from "@/app/actions/meals";
import { estimateBand, mealNutrition, mealPrecision } from "@/lib/nutrition";

type Item = {
  id: string;
  name: string;
  quantity: string | null;
  basis: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  source: string;
  precision: string;
};

export type MealCardMeal = {
  id: string;
  name: string;
  note: string;
  items: Item[];
};

/**
 * A logged meal, and the estimator's working behind it.
 *
 * Every figure here is a guess about food someone else cooked, so the card
 * opens up: you can see the portion that was assumed for each item and change
 * the number if it is wrong. An estimate you cannot argue with is just a number
 * you have to trust.
 */
export function MealCard({
  meal,
  index = 0,
}: {
  meal: MealCardMeal;
  index?: number;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, startSaving] = useTransition();

  const [draft, setDraft] = useState(() =>
    meal.items.map((i) => ({
      id: i.id,
      calories: String(i.calories ?? 0),
      quantity: i.quantity ?? "",
    })),
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [nameDraft, setNameDraft] = useState(meal.name);
  const [addName, setAddName] = useState("");
  const [addCalories, setAddCalories] = useState("");

  const n = mealNutrition(meal);
  const precision = mealPrecision(meal);
  const band = estimateBand(n.calories);
  const hasCalories = meal.items.some((i) => i.calories !== null);
  const estimated = meal.items.some(
    (i) => i.source === "ai" || i.source === "photo",
  );
  const fromPhoto = meal.items.some((i) => i.source === "photo");

  // A hand-typed meal stores one item named after the note, so listing it would
  // just repeat the line above.
  const showItems =
    meal.items.length > 0 &&
    !(meal.items.length === 1 && meal.items[0].name === meal.note);

  const draftTotal = draft
    .filter((d) => !removed.includes(d.id))
    .reduce((sum, d) => sum + (Number(d.calories) || 0), 0);

  function scaleAll(factor: number) {
    setDraft((rows) =>
      rows.map((r) => ({
        ...r,
        calories: String(Math.round((Number(r.calories) || 0) * factor)),
      })),
    );
  }

  function save() {
    startSaving(async () => {
      if (nameDraft.trim() !== meal.name) {
        await renameMealAction({ mealId: meal.id, name: nameDraft });
      }
      if (addName.trim()) {
        await addMealItemAction({
          mealId: meal.id,
          name: addName,
          calories: Number(addCalories) || 0,
        });
      }
      await updateMealItemsAction({
        mealId: meal.id,
        // Inputs hold strings while being typed; the action wants numbers.
        items: draft
          .filter((d) => !removed.includes(d.id))
          .map((d) => ({
            id: d.id,
            calories: Number(d.calories) || 0,
            quantity: d.quantity,
          })),
        removedIds: removed,
      });
      setEditing(false);
      setRemoved([]);
      setAddName("");
      setAddCalories("");
    });
  }

  return (
    <li
      className="settle card p-4"
      // Capped, or a long day's tenth meal would still be waiting.
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate font-bold">{meal.name}</span>
        </button>
        <div className="flex shrink-0 items-baseline gap-3">
          <span className="tnum text-sm font-semibold">
            {hasCalories ? `${Math.round(n.calories).toLocaleString()} kcal` : "—"}
          </span>
          <form action={deleteMealAction}>
            <input type="hidden" name="id" value={meal.id} />
            <button
              type="submit"
              aria-label={`Delete ${meal.name}`}
              className="text-lg leading-none text-ink-faint transition-colors hover:text-up"
            >
              ×
            </button>
          </form>
        </div>
      </div>

      <p className="mt-1.5 text-sm text-ink-muted">{meal.note}</p>

      {hasCalories && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <PrecisionBadge precision={precision} />
          {precision === "estimated" && (
            <span className="tnum text-xs text-ink-muted">
              {band.low.toLocaleString()}–{band.high.toLocaleString()} kcal
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="eyebrow ml-auto transition-colors hover:!text-ink"
          >
            {open ? "Hide working" : "Show working"}
          </button>
        </div>
      )}

      {n.calories > 0 && <MacroBar macros={n} size="compact" />}

      {open && (
        <div className="mt-3 border-t border-rule pt-3">
          {!editing ? (
            <>
              {showItems && (
                <>
                  <ul className="space-y-3">
                    {meal.items.map((item) => (
                      <li key={item.id}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 flex-1 font-semibold">
                            {item.name}
                            {item.quantity && (
                              <span className="font-normal text-ink-muted">
                                {" "}
                                · {item.quantity}
                              </span>
                            )}
                          </span>
                          <span className="tnum shrink-0 text-sm">
                            {item.calories ?? "—"}
                          </span>
                        </div>
                        {item.basis && (
                          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                            {item.basis}
                          </p>
                        )}
                        <p className="tnum mt-1 text-xs text-ink-faint">
                          P {round(item.proteinG)}g · C {round(item.carbsG)}g · F{" "}
                          {round(item.fatG)}g · fiber {round(item.fiberG)}g ·{" "}
                          {round(item.sodiumMg)}mg sodium
                        </p>
                      </li>
                    ))}
                  </ul>

                  {estimated && (
                    <p className="mt-3 text-xs text-ink-muted">
                      {fromPhoto
                        ? "Read from your photo. A picture cannot show a portion exactly — the working is under each line, so correct anything that looks wrong."
                        : "Estimated from your description. Numbers off? Correct them."}
                    </p>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-3 w-full rounded-full bg-surface-sunk px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80"
              >
                Edit
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                aria-label="Meal name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="w-full rounded-lg bg-surface-sunk px-3 py-2 text-sm font-bold focus:outline-2 focus:outline-trace"
              />

              <p className="eyebrow mt-4">Ate less than estimated?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  ["Half", 0.5],
                  ["Two thirds", 0.667],
                  ["A third", 0.333],
                  ["A quarter", 0.25],
                ].map(([label, factor]) => (
                  <button
                    key={label as string}
                    type="button"
                    onClick={() => scaleAll(factor as number)}
                    className="rounded-full bg-surface-sunk px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-80"
                  >
                    {label as string}
                  </button>
                ))}
              </div>

              <ul className="mt-4 space-y-3">
                {meal.items.map((item, i) => {
                  const gone = removed.includes(item.id);
                  return (
                    <li
                      key={item.id}
                      className={gone ? "opacity-40" : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {item.name}
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Calories for ${item.name}`}
                          disabled={gone}
                          value={draft[i]?.calories ?? ""}
                          onChange={(e) =>
                            setDraft((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, calories: e.target.value } : r,
                              ),
                            )
                          }
                          className="tnum w-20 rounded-lg bg-surface-sunk px-2 py-1.5 text-right text-sm font-semibold focus:outline-2 focus:outline-trace"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setRemoved((r) =>
                              gone
                                ? r.filter((x) => x !== item.id)
                                : [...r, item.id],
                            )
                          }
                          aria-label={gone ? `Keep ${item.name}` : `Remove ${item.name}`}
                          className="px-1 text-lg leading-none text-ink-faint transition-colors hover:text-up"
                        >
                          {gone ? "↺" : "×"}
                        </button>
                      </div>
                      <input
                        type="text"
                        aria-label={`Portion for ${item.name}`}
                        disabled={gone}
                        placeholder="portion, e.g. 1 bowl"
                        value={draft[i]?.quantity ?? ""}
                        onChange={(e) =>
                          setDraft((rows) =>
                            rows.map((r, j) =>
                              j === i ? { ...r, quantity: e.target.value } : r,
                            ),
                          )
                        }
                        className="mt-1.5 w-full rounded-lg bg-surface-sunk px-2 py-1.5 text-xs placeholder:text-ink-faint focus:outline-2 focus:outline-trace"
                      />
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex items-center gap-2">
                <input
                  type="text"
                  aria-label="New item name"
                  placeholder="what did the estimate miss?"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg bg-surface-sunk px-2 py-1.5 text-sm placeholder:text-ink-faint focus:outline-2 focus:outline-trace"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Calories for new item"
                  placeholder="kcal"
                  value={addCalories}
                  onChange={(e) => setAddCalories(e.target.value)}
                  className="tnum w-20 rounded-lg bg-surface-sunk px-2 py-1.5 text-right text-sm font-semibold placeholder:text-ink-faint focus:outline-2 focus:outline-trace"
                />
              </div>

              <p className="tnum mt-3 text-sm font-bold">
                New total{" "}
                {Math.round(
                  draftTotal + (Number(addCalories) || 0),
                ).toLocaleString()}{" "}
                kcal
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setRemoved([]);
                    setDraft(
                      meal.items.map((i) => ({
                        id: i.id,
                        calories: String(i.calories ?? 0),
                        quantity: i.quantity ?? "",
                      })),
                    );
                    setNameDraft(meal.name);
                    setAddName("");
                    setAddCalories("");
                  }}
                  className="flex-1 rounded-full bg-surface-sunk px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="flex-1 rounded-full bg-ink px-4 py-2 text-sm font-bold text-ground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? "Saving" : "Save"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function PrecisionBadge({ precision }: { precision: string }) {
  const exact = precision === "exact";
  return (
    <span
      className="eyebrow inline-flex items-center gap-1.5"
      title={
        exact
          ? "Read off a label, or corrected by you."
          : "Oils, sauces and portions vary, so treat this as a range."
      }
    >
      <span
        aria-hidden
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: exact ? "var(--down)" : "var(--carbs)" }}
      />
      {exact ? "Exact" : "Estimated"}
    </span>
  );
}

function round(v: number | null) {
  return v === null ? 0 : Math.round(v);
}
