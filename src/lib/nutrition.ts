import type { EstimatedItem } from "@/lib/ai/estimator";

/**
 * Everything the app knows about turning logged items into figures on screen.
 *
 * A meal's totals are a plain sum of its items. There were once manual
 * adjustments here — portion share, broth left behind — applied at read time;
 * they asked the person to do arithmetic the estimator infers from their own
 * description, and both the controls and their columns are gone.
 */

export type Nutrition = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sodiumMg: number;
};

export type ItemLike = {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  precision?: string;
};

export type MealLike = {
  items: ItemLike[];
};

export const ZERO: Nutrition = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  sodiumMg: 0,
};

/** A day is flagged when a single sitting crosses these. */
export const HIGH_SODIUM_MG = 1500;
export const HIGH_FIBER_G = 10;
// A carb-heavy sitting stores glycogen, and glycogen holds ~3 g of water per
// gram — a classic overnight-scale culprit.
// ponytail: heuristic; a big pasta/rice/dessert plate lands here. Tune if it over- or under-fires.
export const HIGH_CARB_G = 75;

/** Restaurant portions vary enough that a point estimate overstates certainty. */
export const ESTIMATE_RANGE = 0.15;

export function mealNutrition(meal: MealLike): Nutrition {
  return meal.items.reduce<Nutrition>(
    (total, item) => ({
      calories: total.calories + (item.calories ?? 0),
      proteinG: total.proteinG + (item.proteinG ?? 0),
      carbsG: total.carbsG + (item.carbsG ?? 0),
      fatG: total.fatG + (item.fatG ?? 0),
      fiberG: total.fiberG + (item.fiberG ?? 0),
      sodiumMg: total.sodiumMg + (item.sodiumMg ?? 0),
    }),
    { ...ZERO },
  );
}

export function sumNutrition(parts: Nutrition[]): Nutrition {
  return parts.reduce<Nutrition>(
    (total, part) => ({
      calories: total.calories + part.calories,
      proteinG: total.proteinG + part.proteinG,
      carbsG: total.carbsG + part.carbsG,
      fatG: total.fatG + part.fatG,
      fiberG: total.fiberG + part.fiberG,
      sodiumMg: total.sodiumMg + part.sodiumMg,
    }),
    { ...ZERO },
  );
}

/** A meal reads as exact only when every item in it does. */
export function mealPrecision(meal: MealLike): "exact" | "estimated" {
  if (meal.items.length === 0) return "estimated";
  return meal.items.every((i) => i.precision === "exact")
    ? "exact"
    : "estimated";
}

/** ± band to show beside an estimated figure. */
export function estimateBand(calories: number) {
  const margin = Math.round(calories * ESTIMATE_RANGE);
  return { low: Math.max(0, Math.round(calories) - margin), high: Math.round(calories) + margin, margin };
}

export type DayTag = "high_sodium" | "high_carb" | "high_volume";

/**
 * Which meals in the window crossed a flag, and when. The date matters: the
 * banner names the meal it is blaming, and guessing "yesterday" is wrong as
 * often as not — a late dinner is logged on the same day as the morning
 * weigh-in that follows it.
 */
export function flaggedMeals<T extends MealLike & { date: string }>(
  meals: T[],
): Array<{ date: string; tags: DayTag[] }> {
  const flagged: Array<{ date: string; tags: DayTag[] }> = [];
  for (const meal of meals) {
    const n = mealNutrition(meal);
    const tags: DayTag[] = [];
    if (n.sodiumMg >= HIGH_SODIUM_MG) tags.push("high_sodium");
    if (n.carbsG >= HIGH_CARB_G) tags.push("high_carb");
    if (n.fiberG >= HIGH_FIBER_G) tags.push("high_volume");
    if (tags.length) flagged.push({ date: meal.date, tags });
  }
  return flagged;
}

export function dayTags(meals: MealLike[]): DayTag[] {
  const tags: DayTag[] = [];
  // Per sitting, not per day: one salty dinner is what moves the scale
  // overnight, and it would be washed out by a daily average.
  for (const meal of meals) {
    const n = mealNutrition(meal);
    if (n.sodiumMg >= HIGH_SODIUM_MG && !tags.includes("high_sodium")) {
      tags.push("high_sodium");
    }
    if (n.carbsG >= HIGH_CARB_G && !tags.includes("high_carb")) {
      tags.push("high_carb");
    }
    if (n.fiberG >= HIGH_FIBER_G && !tags.includes("high_volume")) {
      tags.push("high_volume");
    }
  }
  return tags;
}

/** Remaining budget: target − eaten + burned. Null when no target is set. */
export function remainingCalories(
  target: number | null,
  consumed: number,
  activeBurn: number | null,
): number | null {
  if (target === null) return null;
  return Math.round(target - consumed + (activeBurn ?? 0));
}

/**
 * Trailing mean over `window` days, aligned to each day in `days`. Days with
 * nothing logged are skipped rather than counted as zero — a day you forgot to
 * log is missing data, not a fast.
 */
export function rollingAverage(
  days: Array<{ date: string; value: number | null }>,
  window: number,
): Array<{ date: string; average: number | null }> {
  return days.map((day, i) => {
    const slice = days.slice(Math.max(0, i - window + 1), i + 1);
    const values = slice
      .map((d) => d.value)
      .filter((v): v is number => v !== null);
    return {
      date: day.date,
      average: values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null,
    };
  });
}

/**
 * Rescale an estimate so its parts add up to a total the person actually knows.
 *
 * Typing a calorie number and pressing the AI button used to be mutually
 * exclusive: the branch was `if (useAi) … else if (manual)`, so the typed
 * number was silently discarded and replaced with a guess. Both are wanted at
 * once — the estimator is what splits "chicken over rice" into components you
 * can edit, and the number off the label is what the components should sum to.
 *
 * Macros scale by the same ratio, which is exactly what editing a single item's
 * calories already does elsewhere in the app.
 *
 * **The rounding is the whole job.** Scaling each item and rounding
 * independently leaves the total a few calories off the number the person
 * typed, which is precisely the number they typed it to avoid arguing with. The
 * drift is settled on the largest item, where a 1–2 kcal correction is
 * proportionally smallest and cannot push a small item negative.
 */
export function scaleToTotal(
  items: EstimatedItem[],
  total: number,
): EstimatedItem[] {
  if (items.length === 0) return items;

  const estimated = items.reduce((sum, item) => sum + item.calories, 0);

  // No basis for a split — an estimate with no calories in it at all. Spread
  // the known total evenly rather than inventing a distribution.
  const ratio = estimated > 0 ? total / estimated : 0;
  const scaled = items.map((item) => ({
    ...item,
    calories:
      estimated > 0
        ? Math.round(item.calories * ratio)
        : Math.round(total / items.length),
    proteinG: scaleMacro(item.proteinG, ratio, estimated),
    carbsG: scaleMacro(item.carbsG, ratio, estimated),
    fatG: scaleMacro(item.fatG, ratio, estimated),
    fiberG: scaleMacro(item.fiberG, ratio, estimated),
    sodiumMg: scaleMacro(item.sodiumMg, ratio, estimated),
    // The person supplied the total, so the meal is no longer an estimate and
    // must not wear a ± band. The split between items is still the model's
    // work, and its reasoning stays in `basis` for anyone who wants to argue.
    precision: "exact" as const,
  }));

  const drift = total - scaled.reduce((sum, item) => sum + item.calories, 0);
  if (drift !== 0) {
    let biggest = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (scaled[i].calories > scaled[biggest].calories) biggest = i;
    }
    scaled[biggest] = {
      ...scaled[biggest],
      calories: Math.max(0, scaled[biggest].calories + drift),
    };
  }

  return scaled;
}

function scaleMacro(
  value: number | null,
  ratio: number,
  estimated: number,
): number | null {
  if (value === null) return null;
  // Nothing to scale against; the macro split would be a fabrication.
  if (estimated <= 0) return null;
  return Math.round(value * ratio * 10) / 10;
}

/**
 * Self-check for `scaleToTotal`, whose entire job is an arithmetic promise:
 * the parts add up to the number the person typed. Rounding each item
 * independently breaks that by a few calories, which is exactly the argument
 * they typed a number to avoid. Run with:
 *
 *   npx tsx -e "import('./src/lib/nutrition.ts').then(m => m.__checkScale())"
 *
 * Exported rather than hidden behind a flag so it can be called from anywhere,
 * including the digest preview route while poking at real data.
 */
export function __checkScale(): string {
  const item = (calories: number, proteinG: number | null = 10) =>
    ({
      name: "x",
      quantity: null,
      basis: null,
      calories,
      proteinG,
      carbsG: 5,
      fatG: 2,
      fiberG: null,
      sodiumMg: null,
      precision: "estimated",
    }) as EstimatedItem;

  const sum = (xs: EstimatedItem[]) =>
    xs.reduce((n, i) => n + i.calories, 0);

  const cases: Array<[string, EstimatedItem[], number]> = [
    ["exact division", [item(100), item(100)], 400],
    ["awkward thirds", [item(100), item(100), item(100)], 1000],
    ["scaling down", [item(900), item(50), item(50)], 137],
    ["single item", [item(742)], 3000],
    ["zero total", [item(100), item(200)], 0],
    ["lopsided", [item(1), item(1), item(998)], 777],
    ["no calories at all", [item(0), item(0)], 500],
  ];

  for (const [label, items, total] of cases) {
    const out = scaleToTotal(items, total);
    if (sum(out) !== total) {
      throw new Error(`${label}: parts sum to ${sum(out)}, expected ${total}`);
    }
    if (out.some((i) => i.calories < 0)) {
      throw new Error(`${label}: produced a negative item`);
    }
    if (out.some((i) => i.precision !== "exact")) {
      throw new Error(`${label}: a typed total must mark items exact`);
    }
  }

  // An estimate with no calories to divide has no macro split to preserve
  // either — inventing one would be a fabrication.
  const noBasis = scaleToTotal([item(0), item(0)], 500);
  if (noBasis.some((i) => i.proteinG !== null)) {
    throw new Error("macros must be dropped when there is nothing to scale");
  }

  // Empty in, empty out — no division by zero.
  if (scaleToTotal([], 500).length !== 0) throw new Error("empty should stay empty");

  return `scaleToTotal: ${cases.length + 2} checks passed`;
}
