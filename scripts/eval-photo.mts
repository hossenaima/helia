/**
 * How wrong is the photo estimator?
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/eval-photo.mts
 *   … --dishes=25 --words        # also pass a short description, as a person would
 *
 * The `NODE_OPTIONS` is not optional: `src/lib/ai/*` imports `server-only`,
 * which throws under a plain tsx run before any of this executes.
 *
 * **Ground truth is the whole point.** Guessing at reference numbers would only
 * measure whether the model agrees with me, so this runs against Nutrition5k —
 * Google Research's public set of cafeteria plates where every ingredient was
 * weighed on a scale before the photo was taken. Nothing is downloaded into the
 * repo; images and metadata are cached under the system temp directory.
 *
 * What it does *not* measure: these are overhead shots from a fixed lab camera,
 * on a plain sheet, of a plate. A phone photo of your dinner has a side angle,
 * worse lighting and more clutter. Treat the figure as a floor on portion
 * judgement, not as the number a tester will experience.
 *
 * Selection is deterministic and made before any result is seen — a seeded
 * shuffle over every dish that has an overhead image, 3–12 ingredients, 150–900
 * kcal and at least 100g on the plate. Re-running picks the same dishes, so a
 * prompt change is measured against the same food rather than a fresh sample.
 */
import "dotenv/config";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getEstimator } from "../src/lib/ai/estimator";

const BUCKET = "https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset";
const LIST_API =
  "https://storage.googleapis.com/storage/v1/b/nutrition5k_dataset/o" +
  "?prefix=nutrition5k_dataset/imagery/realsense_overhead/&delimiter=/&maxResults=5000";
const CACHE = join(tmpdir(), "helia-eval-n5k");
mkdirSync(CACHE, { recursive: true });

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const DISHES = Number(arg("dishes", "15"));
const WITH_WORDS = process.argv.includes("--words");

type Dish = {
  id: string;
  kcal: number;
  massG: number;
  fatG: number;
  carbG: number;
  proteinG: number;
  ingredients: Array<{ name: string; grams: number }>;
};

async function cached(name: string, url: string): Promise<Buffer> {
  const path = join(CACHE, name);
  if (existsSync(path)) return readFileSync(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);
  return buf;
}

/** dish_id, kcal, mass, fat, carb, protein, then (id, name, grams, …) per ingredient. */
function parseDishes(csv: string): Dish[] {
  const dishes: Dish[] = [];
  for (const line of csv.split("\n")) {
    const c = line.split(",");
    if (c.length < 6 || !c[0].startsWith("dish_")) continue;
    const ingredients: Array<{ name: string; grams: number }> = [];
    for (let i = 6; i + 2 < c.length; i += 7) {
      ingredients.push({ name: c[i + 1], grams: Number(c[i + 2]) });
    }
    dishes.push({
      id: c[0],
      kcal: Number(c[1]),
      massG: Number(c[2]),
      fatG: Number(c[3]),
      carbG: Number(c[4]),
      proteinG: Number(c[5]),
      ingredients,
    });
  }
  return dishes;
}

/** Stable per-id ordering, so the sample does not move between runs. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 2 ** 32;
}

const csv = (await cached("cafe1.csv", `${BUCKET}/metadata/dish_metadata_cafe1.csv`)).toString();
const listing = JSON.parse((await cached("overhead.json", LIST_API)).toString());
const withImages = new Set<string>(
  (listing.prefixes ?? []).map((p: string) => p.split("/").filter(Boolean).at(-1)),
);

const pool = parseDishes(csv)
  .filter(
    (d) =>
      withImages.has(d.id) &&
      d.ingredients.length >= 3 &&
      d.ingredients.length <= 12 &&
      d.kcal >= 150 &&
      d.kcal <= 900 &&
      d.massG >= 100,
  )
  .sort((a, b) => seedOf(a.id) - seedOf(b.id));

const sample = pool.slice(0, DISHES);
console.log(
  `${pool.length} dishes qualify; evaluating ${sample.length}` +
    `${WITH_WORDS ? " with a short description" : " from the photo alone"}\n`,
);

const estimator = getEstimator();
type Row = {
  id: string;
  truth: number;
  got: number;
  items: number;
  fatTruth: number;
  fatGot: number;
};
const rows: Row[] = [];

for (const dish of sample) {
  const png = await cached(
    `${dish.id}.png`,
    `${BUCKET}/imagery/realsense_overhead/${dish.id}/rgb.png`,
  );
  // What a person would type: what the food is, never how much of it.
  const words = [...dish.ingredients]
    .sort((a, b) => b.grams - a.grams)
    .slice(0, 3)
    .map((i) => i.name)
    .join(", ");

  try {
    const result = await estimator.estimate({
      description: WITH_WORDS ? words : "",
      photo: { data: new Uint8Array(png), mimeType: "image/png" },
    });
    const got = result.items.reduce((sum, i) => sum + i.calories, 0);
    const fatGot = result.items.reduce((sum, i) => sum + (i.fatG ?? 0), 0);
    rows.push({
      id: dish.id,
      truth: dish.kcal,
      got,
      items: result.items.length,
      fatTruth: dish.fatG,
      fatGot,
    });
    const err = ((got - dish.kcal) / dish.kcal) * 100;
    console.log(
      `  ${dish.id.replace("dish_", "")}  truth ${dish.kcal.toFixed(0).padStart(4)}  ` +
        `got ${String(got).padStart(4)}  ${err >= 0 ? "+" : ""}${err.toFixed(0)}%  ` +
        `fat ${dish.fatG.toFixed(0)}→${fatGot.toFixed(0)}g  ` +
        `${result.items.length} items  (${words})`,
    );
  } catch (error) {
    console.log(`  ${dish.id} FAILED — ${(error as Error).message}`);
  }
}

const errs = rows.map((r) => Math.abs(r.got - r.truth) / r.truth);
const signed = rows.map((r) => (r.got - r.truth) / r.truth);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

console.log(`\n  dishes            ${rows.length}`);
console.log(`  mean abs error    ${pct(mean(errs))}`);
console.log(`  median abs error  ${pct(median(errs))}`);
console.log(`  within 25%        ${pct(rows.filter((_, i) => errs[i] <= 0.25).length / rows.length)}`);
console.log(`  within 50%        ${pct(rows.filter((_, i) => errs[i] <= 0.5).length / rows.length)}`);
// Bias matters more than spread for a food log: a number that is wrong at
// random averages out over a week, one that is always high does not.
console.log(`  bias (signed)     ${signed.length ? (mean(signed) >= 0 ? "+" : "") + pct(mean(signed)) : "—"}`);

// Fat is the macro the market gets wrong: a 2026 metabolic-kitchen study found
// four commercial apps under-counting it by ~30g a meal. The prompt tells this
// one to add fat only where it can see it, which is exactly the instruction
// that could recreate that, so it is measured rather than assumed.
const fatRows = rows.filter((r) => r.fatTruth > 1);
const fatErr = fatRows.map((r) => Math.abs(r.fatGot - r.fatTruth) / r.fatTruth);
const fatSigned = fatRows.map((r) => (r.fatGot - r.fatTruth) / r.fatTruth);
const fatGrams = mean(fatRows.map((r) => r.fatGot - r.fatTruth));
console.log(`\n  fat: dishes       ${fatRows.length}`);
console.log(`  fat: mean abs     ${pct(mean(fatErr))}`);
console.log(`  fat: bias         ${(mean(fatSigned) >= 0 ? "+" : "") + pct(mean(fatSigned))}` +
  `  (${fatGrams >= 0 ? "+" : ""}${fatGrams.toFixed(0)}g a meal)`);
