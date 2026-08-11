"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addDays, isDayKey, todayIn } from "@/lib/dates";
import { sourceForDate } from "@/lib/calendar";
import { toLbs } from "@/lib/units";

export type ActionResult = { ok: boolean; error?: string; saved?: number };


// Sanity bounds in pounds. Catches a kg/lb mix-up or a slipped decimal point
// before it lands in the chart and skews every axis.
const MIN_LBS = 40;
const MAX_LBS = 1000;

const entrySchema = z.object({
  date: z.string().refine(isDayKey, "Not a valid date."),
  weight: z.coerce
    .number({ message: "Enter a number." })
    .positive("Weight must be greater than zero."),
  note: z.string().trim().max(500).optional(),
});

export async function saveWeightAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = entrySchema.safeParse({
    date: formData.get("date"),
    weight: formData.get("weight"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const weightLbs = toLbs(parsed.data.weight, user.units);
  if (weightLbs < MIN_LBS || weightLbs > MAX_LBS) {
    return { ok: false, error: "That weight looks off — check the units." };
  }

  const note = parsed.data.note?.length ? parsed.data.note : null;

  // One weigh-in per person per day: re-submitting the same date corrects it.
  await prisma.weightEntry.upsert({
    where: { userId_date: { userId: user.id, date: parsed.data.date } },
    update: { weightLbs, note },
    create: {
      userId: user.id,
      date: parsed.data.date,
      weightLbs,
      note,
      source: sourceForDate(parsed.data.date, todayIn(user.timezone)),
    },
  });

  revalidatePath("/");
  return { ok: true, saved: 1 };
}

/**
 * Save, correct, or clear one day's weigh-in from the calendar. A null weight
 * deletes the entry, which is how a mistyped day gets undone without a
 * separate delete affordance.
 */
export async function saveWeightForDateAction(input: {
  date: string;
  weight: number | null;
}): Promise<ActionResult> {
  const user = await requireUser();

  if (!isDayKey(input.date)) return { ok: false, error: "Not a valid date." };

  if (input.weight === null) {
    await prisma.weightEntry.deleteMany({
      where: { userId: user.id, date: input.date },
    });
    revalidatePath("/");
    revalidatePath("/calendar");
    return { ok: true, saved: 0 };
  }

  if (!Number.isFinite(input.weight) || input.weight <= 0) {
    return { ok: false, error: "Enter a number." };
  }

  const weightLbs = toLbs(input.weight, user.units);
  if (weightLbs < MIN_LBS || weightLbs > MAX_LBS) {
    return { ok: false, error: "That weight looks off — check the units." };
  }

  await prisma.weightEntry.upsert({
    where: { userId_date: { userId: user.id, date: input.date } },
    update: { weightLbs },
    create: {
      userId: user.id,
      date: input.date,
      weightLbs,
      source: sourceForDate(input.date, todayIn(user.timezone)),
    },
  });

  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true, saved: 1 };
}

// --- Streak freezes --------------------------------------------------------

/** A single freeze is capped, so one tap cannot pause a year. */
const MAX_FREEZE_DAYS = 21;

/**
 * Declare a stretch of days away from the scale.
 *
 * **It may only start today or later.** That single rule is what keeps this
 * from being a second way to fake a streak: a freeze protects a day you have
 * not lived yet, never one you already missed. Nothing else needs guarding —
 * a frozen day holds the number where it is rather than adding to it, so
 * there is nothing to be gained by freezing more of them.
 */
export async function scheduleFreezeAction(input: {
  startDate: string;
  endDate: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  const { startDate, endDate } = input;

  if (!isDayKey(startDate) || !isDayKey(endDate)) {
    return { ok: false, error: "Pick both dates." };
  }
  if (endDate < startDate) {
    return { ok: false, error: "The last day comes before the first one." };
  }
  const today = todayIn(user.timezone);
  if (startDate < today) {
    return {
      ok: false,
      error: "A freeze can only start today or later — past days are already counted.",
    };
  }
  if (endDate >= addDays(startDate, MAX_FREEZE_DAYS)) {
    return { ok: false, error: `${MAX_FREEZE_DAYS} days at a time is the most.` };
  }

  const clash = await prisma.streakFreeze.findFirst({
    where: { userId: user.id, startDate: { lte: endDate }, endDate: { gte: startDate } },
  });
  if (clash) {
    return { ok: false, error: "Those days overlap a freeze you already have." };
  }

  await prisma.streakFreeze.create({
    data: { userId: user.id, startDate, endDate },
  });

  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true };
}

/**
 * Call off a freeze that has not begun. One that has is left alone: it is
 * already holding days, and withdrawing it would rewrite them.
 */
export async function cancelFreezeAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const today = todayIn(user.timezone);

  // Scoped by userId, so a forged id cannot cancel someone else's.
  const { count } = await prisma.streakFreeze.deleteMany({
    where: { id, userId: user.id, startDate: { gt: today } },
  });
  if (count === 0) return { ok: false, error: "That one has already started." };

  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true };
}

// --- Bulk import -----------------------------------------------------------

/** Behind the Apple Health importer. */
async function saveRows(
  userId: string,
  units: "lb" | "kg",
  rows: Array<{ date: string; weight: number }>,
  /** Health-app values are already in pounds; typed values are in `units`. */
  alreadyLbs = false,
): Promise<ActionResult> {
  const converted = rows.map((r) => ({
    date: r.date,
    weightLbs: alreadyLbs ? r.weight : toLbs(r.weight, units),
  }));

  const bad = converted.find(
    (r) => r.weightLbs < MIN_LBS || r.weightLbs > MAX_LBS,
  );
  if (bad) {
    return {
      ok: false,
      error: `${bad.date} has an out-of-range weight — check the units.`,
    };
  }

  // Chunked so a long history does not build one enormous transaction.
  for (let i = 0; i < converted.length; i += 200) {
    const chunk = converted.slice(i, i + 200);
    await prisma.$transaction(
      chunk.map((r) =>
        prisma.weightEntry.upsert({
          where: { userId_date: { userId, date: r.date } },
          update: { weightLbs: r.weightLbs },
          // A reading off a device is written for a past day, but it is not an
          // unverifiable one — Health rows keep counting toward a streak.
          create: { userId, date: r.date, weightLbs: r.weightLbs, source: "health" },
        }),
      ),
    );
  }

  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true, saved: converted.length };
}

/**
 * Receives rows already extracted from an Apple Health export in the browser.
 * Only the parsed readings cross the network — never the 200MB+ export itself.
 */
export async function importHealthRowsAction(
  rows: Array<{ date: string; weightLbs: number }>,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No weight readings found in that export." };
  }
  if (rows.length > 20_000) {
    return { ok: false, error: "That export has an implausible number of readings." };
  }

  // Re-validate here: this action is reachable by direct POST, so the browser's
  // parsing is treated as untrusted input.
  const clean: Array<{ date: string; weight: number }> = [];
  for (const row of rows) {
    if (!row || typeof row.date !== "string" || !isDayKey(row.date)) continue;
    const weight = Number(row.weightLbs);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    clean.push({ date: row.date, weight });
  }

  if (clean.length === 0) {
    return { ok: false, error: "No usable weight readings in that export." };
  }

  return saveRows(user.id, user.units, clean, true);
}
