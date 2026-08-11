import "server-only";

import { z } from "zod";
import {
  AiUnavailableError,
  aiAvailable,
  generateJson,
  type ImagePart,
} from "@/lib/ai/gemini";

/**
 * Calorie estimation lives behind this interface so the rest of the app never
 * imports a vendor SDK.
 */

/*
 * Deliberately plain: every field required, no nullable unions, and no array
 * length cap.
 *
 * Gemini compiles this into a decoding constraint with a hard complexity
 * budget, and it rejects the request outright — "too many states for serving" —
 * if the schema is too rich. A `maxItems` on a nested array is the worst
 * offender, and each nullable field doubles the states again. The length cap
 * lives in code below, where it costs nothing.
 */
const estimateSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      /** Empty string rather than null, for the same reason. */
      quantity: z.string(),
      /** The working: portion assumed, what was counted, what was left out. */
      basis: z.string(),
      calories: z.number(),
      proteinG: z.number(),
      carbsG: z.number(),
      fatG: z.number(),
      fiberG: z.number(),
      sodiumMg: z.number(),
      precision: z.enum(["exact", "estimated"]),
    }),
  ),
  note: z.string(),
});

/** Backstop on a runaway reply, enforced here instead of in the schema. */
const MAX_ITEMS = 25;

export type EstimatedItem = {
  name: string;
  quantity: string | null;
  basis: string | null;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  precision: "exact" | "estimated";
};

export type EstimateResult = {
  items: EstimatedItem[];
  /** Caveats worth showing the user, e.g. an assumed portion size. */
  note?: string;
};

export type EstimateInput = {
  /** What the person typed. May be empty when there is a photo. */
  description: string;
  /** A picture of the meal, already downscaled by the browser. */
  photo?: ImagePart;
};

export interface CalorieEstimator {
  readonly available: boolean;
  estimate(input: EstimateInput): Promise<EstimateResult>;
}

/** Re-exported so callers keep one error type to catch. */
export { AiUnavailableError as EstimatorUnavailableError };

const SYSTEM_PROMPT = `You estimate nutrition for food described in plain language.

Break the description into the individual ingredients a person could adjust.

If the description says what something is made of or topped with, itemise those
components separately — do not collapse them back into the dish name. "Chia
seed pudding made with greek yogurt and whole milk, topped with berries and
granola" is five items: chia seeds, greek yogurt, whole milk, mixed berries,
granola. Someone who used less granola needs a granola line to change.

Keep something whole only when the person did not say what went into it and
could not reasonably change it — a named restaurant dish, a packaged bar, a
shop-bought sandwich. Splitting a Big Mac into bun, patty and sauce is noise.

Always give a quantity for every item, in the units a person would use — "1
cup", "2 tbsp", "3 oz", "1 medium". Estimate a sensible portion when none was
given and say so in the note.

For each item, "basis" is one short sentence showing your working: the portion
you assumed, what you counted, and anything you left out. Write it so someone
can disagree with a specific number.

If the description says how much was actually eaten — "a third of the fries",
"half the bowl", "left the broth" — estimate what was eaten, not what was
served, and say what you assumed in the note.

Set precision to "exact" only for a packaged item with a nutrition label the
person clearly named, such as a branded bar or a canned drink. Anything a
kitchen made is "estimated", because the oil, sauce and portion are decided by
whoever cooked it.

Fill in every field. Use 0 when the food genuinely contains none of that macro
(black coffee has no fat; olive oil has no carbs). Calories are whole numbers,
macros in grams, sodium in milligrams. Never invent food the person did not
mention. If the text describes no food at all, return an empty items list and
explain why in the note.`;

/**
 * Added when there is a picture.
 *
 * The one thing a photograph cannot carry is scale, and guessing at it silently
 * is the failure every photo calorie app is known for: a confident number with
 * no way to tell which part of it is wrong. So the rules below force the
 * portion reasoning out into the open — judged against something in the frame
 * whose real size is known, and written into `basis` where the person can
 * disagree with it. An estimate you can argue with beats a better one you
 * cannot.
 */
const PHOTO_PROMPT = `A photograph of the meal comes first, before any text.

Work from what is actually visible. Name every distinct component as its own
item — the sausage, the beans, the bread, the sauce in the little pot — because
those are the things a person can tell you they did not finish. Do not collapse
the plate into one "cooked breakfast" line.

Work out the weight of each component in grams first, then the calories from
that weight. Put the grams in "basis". Going straight to a calorie figure is
where these estimates go wrong: the number comes out as a memory of a restaurant
dish rather than as a reading of the food in front of you.

Judge that weight against something in the frame whose real size you know: a
dinner plate is 26–28 cm across, a side plate 18–20 cm, a fork about 18 cm, a
standard mug holds around 300 ml, a slice of sandwich bread is about 11 cm
square. Name the reference you used — "plate reads as ~27 cm; beans fill a 9 cm
pot about 2 cm deep, so roughly 150 g".

Then check that weight against what a serving of that food usually weighs, and
say so if the two disagree. A chicken breast is 120–180 g, a fish fillet
120–170 g, cooked rice or pasta about 180 g a cupful, a scoop of vegetables
80–120 g, a slice of bread 30–40 g, a fried egg about 50 g. **Food that covers
part of a plate is a part-sized serving.** A modest heap on a large plate is
what it looks like — do not round it up to a full restaurant portion because the
plate is big.

Count only the meal this photo is of. Another plate at the edge of the frame, or
food in the background, belongs to somebody else.

**Add fat only where you can see it.** Visible oil, a sheen on the surface,
pooled dressing, melted butter, a fried crust — those are counted. Do not assume
a pan of butter behind food that could as easily have been steamed, grilled or
baked dry. Where a lean and a rich version of the same thing look alike — egg
whites against whole eggs, dry-roasted potatoes against fried, plain yoghurt
against cream — say in "basis" which you decided and what the picture shows to
support it. Note in the note when something significant may be hidden, such as
dressing under a salad or oil already absorbed.

If the photo shows a nutrition label, a packet or a menu board, read the figures
off it and use those. Only then set precision to "exact", and say in "basis"
that the number was read rather than estimated.

Where the person's own words and the picture disagree, follow the words. They
were there and you were not: if they say half of it was left, or that the mug is
a large one, price what they said.

If the picture contains no food at all, return an empty items list and say what
you can see instead.`;

class GeminiEstimator implements CalorieEstimator {
  readonly available = true;

  async estimate({ description, photo }: EstimateInput): Promise<EstimateResult> {
    const parsed = await generateJson({
      schema: estimateSchema,
      system: photo ? `${SYSTEM_PROMPT}\n\n${PHOTO_PROMPT}` : SYSTEM_PROMPT,
      prompt:
        description ||
        // The parts array still needs text after the image, and an empty string
        // is not a prompt. This says out loud that there is nothing to add.
        "No description was given. Work from the photograph alone.",
      image: photo,
      // A picture costs thinking tokens before a single item is written, and on
      // 2.5-flash those come out of the same budget as the reply — too small a
      // budget returns no text at all rather than a short answer.
      maxOutputTokens: photo ? 8192 : 4096,
    });

    return {
      items: parsed.items.slice(0, MAX_ITEMS).map((item) => ({
        name: item.name.slice(0, 200),
        quantity: item.quantity.trim().slice(0, 100) || null,
        basis: item.basis.trim().slice(0, 300) || null,
        calories: Math.max(0, Math.round(item.calories)),
        proteinG: round1(item.proteinG),
        carbsG: round1(item.carbsG),
        fatG: round1(item.fatG),
        fiberG: round1(item.fiberG),
        sodiumMg: Math.max(0, Math.round(item.sodiumMg)),
        precision: item.precision,
      })),
      note: parsed.note.trim() || undefined,
    };
  }
}

class UnavailableEstimator implements CalorieEstimator {
  readonly available = false;

  async estimate(): Promise<EstimateResult> {
    throw new AiUnavailableError(
      "Estimation is off. Add GEMINI_API_KEY to your environment to turn it on.",
    );
  }
}

export function getEstimator(): CalorieEstimator {
  return aiAvailable() ? new GeminiEstimator() : new UnavailableEstimator();
}

function round1(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}
