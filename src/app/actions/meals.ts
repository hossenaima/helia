"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isDayKey } from "@/lib/dates";
import {
  EstimatorUnavailableError,
  getEstimator,
  type EstimatedItem,
} from "@/lib/ai/estimator";
import { scaleToTotal } from "@/lib/nutrition";

export type MealActionResult = {
  ok: boolean;
  error?: string;
  note?: string;
};

const mealSchema = z.object({
  date: z.string().refine(isDayKey, "Not a valid date."),
  name: z.string().trim().min(1, "Give the meal a name.").max(60),
  // Not required on its own any more: a photograph is also a description of
  // what you ate. Which of the two has to be present is decided below, because
  // it depends on whether the estimator is being asked.
  note: z.string().trim().max(2000),
});

/**
 * Photographs the browser has already downscaled. The cap is a backstop against
 * a hand-rolled POST, not something the form can hit: it sends a JPEG about
 * 1024px on its longest edge, which lands well under 300KB.
 */
const MAX_PHOTO_BYTES = 4_000_000;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function readPhoto(
  value: FormDataEntryValue | null,
): Promise<{ data: Uint8Array; mimeType: string } | null | { error: string }> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (!PHOTO_TYPES.includes(value.type)) {
    return { error: "That photo is in a format Helia cannot read." };
  }
  if (value.size > MAX_PHOTO_BYTES) {
    return { error: "That photo is too large." };
  }
  return {
    data: new Uint8Array(await value.arrayBuffer()),
    mimeType: value.type,
  };
}

/**
 * Saves a meal. A day holds as many meals as the user logs — there is no fixed
 * set of slots, so this always creates rather than replacing anything.
 */
export async function saveMealAction(
  _prev: MealActionResult,
  formData: FormData,
): Promise<MealActionResult> {
  const user = await requireUser();

  const parsed = mealSchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { date, name } = parsed.data;
  let { note } = parsed.data;
  const useAi = formData.get("estimate") === "1";
  const manualCalories = formData.get("calories");

  const photoResult = await readPhoto(formData.get("photo"));
  if (photoResult && "error" in photoResult) {
    return { ok: false, error: photoResult.error };
  }
  const photo = photoResult;

  // A photo is a description; without the estimator it is neither, since
  // nothing would read it and the meal would have no name for its one item.
  if (note === "" && !(useAi && photo)) {
    return {
      ok: false,
      error: useAi
        ? "Describe what you ate, or add a photo."
        : "Describe what you ate.",
    };
  }

  const typedRaw = String(manualCalories ?? "").trim();
  let typedCalories: number | null = null;
  if (typedRaw !== "") {
    const value = Number(typedRaw);
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: "Calories must be a number." };
    }
    typedCalories = value;
  }

  let items: EstimatedItem[] = [];
  let aiNote: string | undefined;

  if (useAi) {
    try {
      const result = await getEstimator().estimate({
        description: note,
        photo: photo ?? undefined,
      });
      items = result.items;
      aiNote = result.note;
      if (items.length === 0) {
        return {
          ok: false,
          // A picture gets the flat answer, never the model's commentary on
          // what it saw instead. It read "a login screen for a health log
          // application, not any food items" back to somebody once — accurate,
          // faintly unnerving, and no help at all. What the person needs to
          // know is that nothing was logged and why.
          error: photo
            ? "No food detected."
            : (aiNote ?? "Could not identify any food in that description."),
        };
      }
      // A photo with nothing typed leaves the meal with no words of its own, so
      // what the model saw becomes the description. Otherwise the card, the
      // reuse list and the digest would all show a nameless meal.
      if (note === "") {
        note = items
          .map((item) => item.name)
          .join(", ")
          .slice(0, 2000);
      }
    } catch (error) {
      if (error instanceof EstimatorUnavailableError) {
        return { ok: false, error: error.message };
      }
      return {
        ok: false,
        error:
          "Estimation failed. Save it with a calorie number instead, or try again.",
      };
    }

    // A typed total wins over the estimate. The model still decides what the
    // components are and how they divide; it does not get to overrule a number
    // the person read off a label or a menu.
    if (typedCalories !== null) {
      items = scaleToTotal(items, typedCalories);
      aiNote = aiNote
        ? `${aiNote} Scaled to your ${typedCalories.toLocaleString()} kcal.`
        : `Scaled to your ${typedCalories.toLocaleString()} kcal.`;
    }
  } else if (typedCalories !== null) {
    const calories = typedCalories;
    items = [
      {
        name: note.slice(0, 200),
        quantity: null,
        basis: null,
        calories: Math.round(calories),
        proteinG: optionalGrams(formData.get("protein")),
        carbsG: optionalGrams(formData.get("carbs")),
        fatG: optionalGrams(formData.get("fat")),
        fiberG: optionalGrams(formData.get("fiber")),
        sodiumMg: optionalGrams(formData.get("sodium")),
        // Typed by the person, so it is their number — the same rule the AI
        // path follows when a total is supplied. It was "estimated" here, which
        // put a ± band around a figure somebody had read off a label.
        precision: "exact",
      },
    ];
  }

  await prisma.meal.create({
    data: {
      userId: user.id,
      date,
      name,
      note,
      items: {
        create: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          basis: item.basis,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          fiberG: item.fiberG,
          sodiumMg: item.sodiumMg,
          precision: item.precision,
          // "photo" rather than "ai" when a picture was read: same estimator,
          // but where the figure came from is worth keeping, the same way a
          // weigh-in records whether anybody watched it happen.
          source: useAi ? (photo ? "photo" : "ai") : "manual",
        })),
      },
    },
  });

  revalidatePath("/meals");
  return { ok: true, note: aiNote };
}

/** Active burn for a day, typed by hand on the meals page. */
export async function saveActiveBurnAction(formData: FormData) {
  const user = await requireUser();

  const date = String(formData.get("date") ?? "");
  if (!isDayKey(date)) return;

  const raw = String(formData.get("activeBurn") ?? "").trim();
  const value = raw === "" ? null : Number(raw);
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 10000)) {
    return;
  }

  await prisma.dayLog.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: { activeBurnKcal: value === null ? null : Math.round(value) },
    create: {
      userId: user.id,
      date,
      activeBurnKcal: value === null ? null : Math.round(value),
    },
  });

  revalidatePath("/meals");
}

/**
 * Correct an estimate. The figures the model produced are a starting point, not
 * a verdict, so every item's calories and portion text can be edited and any
 * item removed. Macros are scaled with the calories rather than edited by hand
 * — nobody wants to retype four numbers to say "that was half the size".
 */
export async function updateMealItemsAction(input: {
  mealId: string;
  items: Array<{ id: string; calories: number; quantity: string }>;
  removedIds: string[];
}): Promise<MealActionResult> {
  const user = await requireUser();

  const meal = await prisma.meal.findFirst({
    where: { id: input.mealId, userId: user.id },
    include: { items: true },
  });
  if (!meal) return { ok: false, error: "That meal is gone." };

  const byId = new Map(meal.items.map((i) => [i.id, i]));

  const updates = input.items.flatMap((edit) => {
    const original = byId.get(edit.id);
    if (!original) return [];

    const calories = Math.max(0, Math.round(Number(edit.calories)));
    if (!Number.isFinite(calories)) return [];

    // Scale macros by however much the calorie figure moved, so the split stays
    // honest. A zeroed original has no ratio to preserve, so macros go to zero.
    const before = original.calories ?? 0;
    const ratio = before > 0 ? calories / before : 0;
    const scale = (v: number | null) =>
      v === null ? null : Math.round(v * ratio * 10) / 10;

    return [
      prisma.mealItem.update({
        where: { id: edit.id },
        data: {
          calories,
          quantity: edit.quantity.trim().slice(0, 100) || null,
          proteinG: scale(original.proteinG),
          carbsG: scale(original.carbsG),
          fatG: scale(original.fatG),
          fiberG: scale(original.fiberG),
          sodiumMg: scale(original.sodiumMg),
          // Once a human has adjusted it, it is their number, not an estimate.
          precision: "exact",
        },
      }),
    ];
  });

  const removable = input.removedIds.filter((id) => byId.has(id));
  if (removable.length > 0) {
    updates.push(
      prisma.mealItem.deleteMany({ where: { id: { in: removable } } }) as never,
    );
  }

  await prisma.$transaction(updates);

  revalidatePath("/meals");
  return { ok: true };
}

/** A rename is a label change and nothing else: the items, their calories
 *  and the ± band stay untouched, and the reuse list follows the new name.
 *  `note` is deliberately NOT touched — it is the verbatim text the
 *  estimate was based on, and rewriting history helps nobody. */
export async function renameMealAction(input: {
  mealId: string;
  name: string;
}) {
  const me = await requireUser();
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false as const, error: "Give it a name." };

  const { count } = await prisma.meal.updateMany({
    where: { id: input.mealId, userId: me.id },
    data: { name },
  });
  if (count === 0) return { ok: false as const, error: "No such meal." };

  revalidatePath("/meals");
  return { ok: true as const };
}

/** A typed addition to a logged meal: name + calories, exact because it was
 *  typed (the house rule), macros blank like every hand-typed item. */
export async function addMealItemAction(input: {
  mealId: string;
  name: string;
  calories: number;
}) {
  const me = await requireUser();
  const name = input.name.trim().slice(0, 80);
  const calories = Math.round(input.calories);
  if (!name) return { ok: false as const, error: "What was it?" };
  if (!Number.isFinite(calories) || calories < 0 || calories > 5000) {
    return { ok: false as const, error: "Calories look off." };
  }

  // Ownership first: the create is not scoped by userId, the check is.
  const meal = await prisma.meal.findFirst({
    where: { id: input.mealId, userId: me.id },
    select: { id: true },
  });
  if (!meal) return { ok: false as const, error: "No such meal." };

  await prisma.mealItem.create({
    data: {
      mealId: meal.id,
      name,
      calories,
      source: "manual",
      precision: "exact",
    },
  });

  revalidatePath("/meals");
  return { ok: true as const };
}

export async function deleteMealAction(formData: FormData) {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Scoped by userId, so a forged post cannot delete someone else's meal.
  await prisma.meal.deleteMany({ where: { id, userId: user.id } });

  revalidatePath("/meals");
}

export async function deleteMealItemAction(formData: FormData) {
  const user = await requireUser();

  const id = String(formData.get("itemId") ?? "");
  if (!id) return;

  await prisma.mealItem.deleteMany({
    where: { id, meal: { userId: user.id } },
  });
  revalidatePath("/meals");
}

function optionalGrams(value: FormDataEntryValue | null): number | null {
  if (value === null || String(value).trim() === "") return null;
  const grams = Number(value);
  return Number.isFinite(grams) && grams >= 0
    ? Math.round(grams * 10) / 10
    : null;
}

/**
 * Log a past meal again on `date`, copying its items across.
 *
 * Deliberately no estimator call. The items were already priced — by the model
 * or by hand — and re-running the description would spend a request to get an
 * answer we have, and might get a slightly different one, which would make the
 * same breakfast drift in calories from day to day.
 */
export async function repeatMealAction(
  mealId: string,
  date: string,
): Promise<MealActionResult> {
  const user = await requireUser();

  if (!isDayKey(date)) return { ok: false, error: "Not a valid date." };

  // Scoped to the account, so a forged id cannot copy someone else's meal.
  const source = await prisma.meal.findFirst({
    where: { id: mealId, userId: user.id },
    include: { items: true },
  });
  if (!source) return { ok: false, error: "That meal is no longer saved." };

  await prisma.meal.create({
    data: {
      userId: user.id,
      date,
      name: source.name,
      note: source.note,
      items: {
        create: source.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          basis: item.basis,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          fiberG: item.fiberG,
          sodiumMg: item.sodiumMg,
          precision: item.precision,
          source: item.source,
        })),
      },
    },
  });

  revalidatePath("/meals");
  return { ok: true };
}
