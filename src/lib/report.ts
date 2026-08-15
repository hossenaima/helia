import type { Nutrition } from "@/lib/nutrition";

/**
 * A day report: the day's weigh-in, totals and meals as one shareable thing.
 *
 * The page and the share-sheet text are two renders of this one object, built
 * in `(app)/report/page.tsx` — display-ready strings (weights already in the
 * user's units, times already in their zone) so the two cannot disagree about
 * a figure. The text render exists because the report's main audience after
 * friends is an LLM ("analyze my day"), and structured text beats a
 * screenshot for that.
 */

export type ReportItem = {
  name: string;
  quantity: string | null;
  basis: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  precision: string;
};

export type ReportMeal = {
  name: string;
  note: string;
  calories: number;
  precision: "exact" | "estimated";
  /** ± band, only when estimated. */
  band: { low: number; high: number } | null;
  macros: Nutrition;
  /** Empty when listing items would just repeat the meal line. */
  items: ReportItem[];
};

export type DayReport = {
  /** "Friday, August 15, 2026" */
  dayLabel: string;
  name: string;
  weight: {
    /** "178.2 lb" — already in the user's units. */
    display: string;
    /** "7:41 AM", or null when the clock time would not mean what it says. */
    time: string | null;
    note: string | null;
    change: {
      direction: "down" | "up" | "flat";
      /** "0.4 lb" — magnitude only. */
      amount: string;
      /** "Aug 14" — the previous reading's day. */
      since: string;
    } | null;
  } | null;
  totals: {
    calories: number;
    mealCount: number;
    target: number | null;
    activeBurn: number | null;
    macros: Nutrition;
  };
};

const kcal = (n: number) => `${Math.round(n).toLocaleString("en-US")} kcal`;

function macroLine(m: Nutrition): string {
  const g = (v: number) => Math.round(v);
  return `Protein ${g(m.proteinG)} g · Carbs ${g(m.carbsG)} g · Fat ${g(m.fatG)} g · Fiber ${g(m.fiberG)} g · Sodium ${g(m.sodiumMg)} mg`;
}

export function changeText(c: NonNullable<DayReport["weight"]>["change"]): string | null {
  if (!c) return null;
  if (c.direction === "flat") return `no change since ${c.since}`;
  return `${c.direction} ${c.amount} since ${c.since}`;
}

/** The report as plain text — what the share sheet and the clipboard get. */
export function reportText(r: DayReport): string {
  const lines: string[] = [`Helia day report — ${r.dayLabel} (${r.name})`, ""];

  lines.push("WEIGHT");
  if (r.weight) {
    lines.push(
      [
        r.weight.display + (r.weight.time ? `, logged ${r.weight.time}` : ""),
        changeText(r.weight.change),
        r.weight.note,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  } else {
    lines.push("No weigh-in logged this day.");
  }

  lines.push("", "DAY TOTALS");
  if (r.totals.mealCount === 0) {
    lines.push("No meals logged this day.");
  } else {
    const target =
      r.totals.target === null
        ? null
        : r.totals.target - Math.round(r.totals.calories) >= 0
          ? `target ${r.totals.target.toLocaleString("en-US")}, ${(r.totals.target - Math.round(r.totals.calories)).toLocaleString("en-US")} under`
          : `target ${r.totals.target.toLocaleString("en-US")}, ${(Math.round(r.totals.calories) - r.totals.target).toLocaleString("en-US")} over`;
    lines.push(
      [
        `${kcal(r.totals.calories)} across ${r.totals.mealCount} meal${r.totals.mealCount === 1 ? "" : "s"}`,
        target,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    lines.push(macroLine(r.totals.macros));
  }
  if (r.totals.activeBurn !== null && r.totals.activeBurn > 0) {
    lines.push(`Active burn: ${kcal(r.totals.activeBurn)}`);
  }

  return lines.join("\n");
}

/** One meal as text, appended below the totals by the page. */
export function mealText(m: ReportMeal, index: number): string {
  const lines: string[] = [""];
  const band =
    m.precision === "estimated" && m.band
      ? ` (estimated, ${m.band.low.toLocaleString("en-US")}–${m.band.high.toLocaleString("en-US")})`
      : m.precision === "exact"
        ? " (exact)"
        : "";
  lines.push(`${index + 1}. ${m.name} — ${kcal(m.calories)}${band}`);
  if (m.note && m.note !== m.name) lines.push(`   "${m.note}"`);
  if (m.calories > 0) lines.push(`   ${macroLine(m.macros)}`);
  for (const item of m.items) {
    lines.push(
      `   - ${item.name}${item.quantity ? ` (${item.quantity})` : ""}: ${item.calories === null ? "—" : kcal(item.calories)} [${item.precision}]`,
    );
    if (item.basis) lines.push(`     basis: ${item.basis}`);
  }
  return lines.join("\n");
}

export function fullReportText(r: DayReport, meals: ReportMeal[]): string {
  const parts = [reportText(r)];
  if (meals.length > 0) {
    parts.push("\n\nMEALS");
    parts.push(meals.map(mealText).join("\n"));
  }
  parts.push(
    "\n\nFigures marked \"estimated\" are estimates, not measurements.",
  );
  return parts.join("");
}

/**
 * Self-check. Run with:
 *   npx tsx -e "import('./src/lib/report.ts').then(m => m.__checkReport())"
 */
export function __checkReport(): string {
  const macros: Nutrition = {
    calories: 1840,
    proteinG: 92.4,
    carbsG: 210,
    fatG: 61,
    fiberG: 24,
    sodiumMg: 2900,
  };
  const report: DayReport = {
    dayLabel: "Friday, August 15, 2026",
    name: "Test",
    weight: {
      display: "178.2 lb",
      time: "7:41 AM",
      note: null,
      change: { direction: "down", amount: "0.4 lb", since: "Aug 14" },
    },
    totals: { calories: 1840, mealCount: 2, target: 2000, activeBurn: 320, macros },
  };
  const meals: ReportMeal[] = [
    {
      name: "Chicken over rice",
      note: "chicken over rice with white sauce",
      calories: 720,
      precision: "estimated",
      band: { low: 612, high: 828 },
      macros,
      items: [
        {
          name: "Chicken thigh",
          quantity: "200 g",
          basis: "plate reads as ~27 cm",
          calories: 340,
          proteinG: 30,
          carbsG: 0,
          fatG: 24,
          fiberG: 0,
          sodiumMg: 400,
          precision: "estimated",
        },
      ],
    },
  ];
  const text = fullReportText(report, meals);
  const mustContain = [
    "Helia day report — Friday, August 15, 2026 (Test)",
    "178.2 lb, logged 7:41 AM · down 0.4 lb since Aug 14",
    "1,840 kcal across 2 meals · target 2,000, 160 under",
    "Protein 92 g",
    "Active burn: 320 kcal",
    "1. Chicken over rice — 720 kcal (estimated, 612–828)",
    "basis: plate reads as ~27 cm",
    "estimates, not measurements",
  ];
  for (const s of mustContain) {
    if (!text.includes(s)) throw new Error(`missing: ${s}\n---\n${text}`);
  }
  // Over target, no weigh-in, no meals — the empty states say so plainly.
  const sparse = fullReportText(
    {
      ...report,
      weight: null,
      totals: { calories: 2400, mealCount: 3, target: 2000, activeBurn: null, macros },
    },
    [],
  );
  for (const s of ["No weigh-in logged this day.", "target 2,000, 400 over"]) {
    if (!sparse.includes(s)) throw new Error(`missing: ${s}\n---\n${sparse}`);
  }
  const empty = fullReportText(
    { ...report, totals: { calories: 0, mealCount: 0, target: null, activeBurn: null, macros } },
    [],
  );
  if (!empty.includes("No meals logged this day.")) throw new Error("missing empty-meals line");
  return "report: all checks passed";
}
