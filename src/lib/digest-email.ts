import type { Digest } from "@/lib/digest";
import { fromLbs, type Units } from "@/lib/units";

/**
 * The weekly digest email.
 *
 * ## The charts are tables
 *
 * There is no other option. Gmail strips `<svg>` entirely, `<canvas>` and any
 * script are gone everywhere, and a generated PNG would need hosting *and*
 * would arrive as an empty box for the many clients that block remote images by
 * default. A chart drawn from table cells with background colours renders in
 * every client including Outlook, needs no assets, and survives image blocking
 * because it is not an image.
 *
 * ## The weight columns do not start at zero
 *
 * A 2 lb move on a 180 lb person renders as seven identical bars against a zero
 * baseline. The columns are scaled to the *week's own* spread — the same rule
 * the app's chart follows, and the friend sparkline before it. A truncated
 * baseline is only honest if it is disclosed, so the top and bottom of the
 * range are printed beside the chart and every column carries its own reading.
 *
 * ## Order
 *
 * Attendance first, then the trend, and the raw change well below both. This
 * email arrives unprompted: opening the Weight tab is a choice, an inbox is
 * not, and leading with "+2.3 lb" on a bad week is how a digest becomes the
 * thing that makes somebody stop reading.
 *
 * Colour follows the app: `--protein`, `--carbs` and `--fat` are the only
 * saturated things here, and they mean exactly what they mean in the app.
 * Duplicated as literals from `globals.css` because `var()` resolves nowhere in
 * Outlook — a colour that fails to resolve is an invisible bar.
 */

const INK = "#181d20";
const INK_MUTED = "#5a656b";
const INK_FAINT = "#98a2a7";
const GROUND = "#f7f9f9";
const SURFACE = "#ffffff";
const SUNK = "#eef1f2";
const RULE = "#e7ebec";
const TRACE = "#2e776b";
const DOWN = "#3a6d4a";
const PROTEIN = "#4e86e0";
const CARBS = "#bf8c22";
const FAT = "#ae5fb0";

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const SITE = "https://helia-plum.vercel.app";

const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const dowOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

const w = (lbs: number, units: Units) =>
  `${(Math.round(fromLbs(lbs, units) * 10) / 10).toFixed(1)}`;

export function digestSubject(d: Digest): string {
  return `Helia weekly: ${d.daysWeighed} of 7 days logged`;
}

/** Column chart of the week's weights, scaled to the week's own spread. */
function weightChart(d: Digest): string {
  const units = d.units as Units;
  const values = d.days.map((x) => x.lbs).filter((v): v is number => v !== null);
  if (values.length === 0) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat week would otherwise divide by zero; give it a nominal band so the
  // columns land mid-height instead of collapsing.
  const span = max - min || 1;
  const MAX_H = 84;

  const cols = d.days
    .map((day) => {
      if (day.lbs === null) {
        return (
          `<td valign="bottom" align="center" style="padding:0 3px">` +
          `<div style="height:${MAX_H}px;line-height:${MAX_H}px;font-family:${FONT};font-size:11px;color:${INK_FAINT}">&middot;</div>` +
          `</td>`
        );
      }
      // 18px floor so the lowest reading of the week is still a visible bar
      // rather than a hairline.
      const h = Math.round(18 + ((day.lbs - min) / span) * (MAX_H - 18));
      return (
        `<td valign="bottom" align="center" style="padding:0 3px">` +
        `<div style="font-family:${FONT};font-size:10px;color:${INK_MUTED};padding-bottom:3px">${w(day.lbs, units)}</div>` +
        `<div style="height:${h}px;background:${TRACE};border-radius:4px 4px 0 0;font-size:0;line-height:0">&nbsp;</div>` +
        `</td>`
      );
    })
    .join("");

  const labels = d.days
    .map(
      (day) =>
        `<td align="center" style="padding:6px 3px 0;font-family:${FONT};font-size:11px;color:${INK_FAINT}">${dowOf(day.date)}</td>`,
    )
    .join("");

  return `
  <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${INK_MUTED}">Weight</p>
  <p style="margin:0 0 12px;font-family:${FONT};font-size:12px;color:${INK_FAINT}">
    Scaled to this week only &mdash; ${w(min, units)} to ${w(max, units)} ${esc(units)}.
  </p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>${cols}</tr>
    <tr>${labels}</tr>
  </table>`;
}

/** Stacked macro bars, one row per day, with the day's calories alongside. */
function macroChart(d: Digest): string {
  const logged = d.days.filter((x) => x.logged);
  if (logged.length === 0) return "";

  // Width tracks the calorie figure printed beside it, and the segments are
  // each macro's share *of that same figure*.
  //
  // These were two different quantities once: the bar was scaled to
  // protein·4 + carbs·4 + fat·9 while the number beside it was the sum of the
  // items' calories. Plenty of items carry a calorie count and no macros — a
  // manually typed meal has none at all — so the biggest day of the week drew
  // the shortest bar. Anything the macros do not account for is now drawn in
  // neutral grey, which says "not recorded" instead of quietly shrinking the day.
  const peak = Math.max(...logged.map((x) => x.calories ?? 0), 1);

  const rows = d.days
    .map((day) => {
      const kcal = day.calories ?? 0;
      const share = (g: number, per: number) =>
        kcal === 0 ? 0 : Math.max(0, Math.round(((g * per) / kcal) * 100));
      const p = share(day.proteinG, 4);
      const c = share(day.carbsG, 4);
      const f = share(day.fatG, 9);
      const unaccounted = Math.max(0, 100 - p - c - f);
      const width = Math.max(2, Math.round((kcal / peak) * 100));

      const seg = (pct: number, colour: string) =>
        pct <= 0
          ? ""
          : `<td width="${pct}%" style="height:14px;background:${colour};font-size:0;line-height:0">&nbsp;</td>`;

      const bar = !day.logged
        ? `<div style="height:14px;background:${SUNK};border-radius:7px;font-size:0;line-height:0">&nbsp;</div>`
        : `<table role="presentation" width="${width}%" cellpadding="0" cellspacing="0" border="0" style="border-radius:7px;overflow:hidden">
             <tr>
               ${seg(p, PROTEIN)}${seg(c, CARBS)}${seg(f, FAT)}${seg(unaccounted, RULE)}
             </tr>
           </table>`;

      return `<tr>
        <td width="24" valign="middle" style="padding:0 0 8px;font-family:${FONT};font-size:11px;color:${INK_FAINT}">${dowOf(day.date)}</td>
        <td valign="middle" style="padding:0 10px 8px">${bar}</td>
        <td width="64" align="right" valign="middle" style="padding:0 0 8px;font-family:${FONT};font-size:12px;color:${day.logged ? INK_MUTED : INK_FAINT}">${
          day.calories === null ? "&mdash;" : `${day.calories.toLocaleString()}`
        }</td>
      </tr>`;
    })
    .join("");

  const key = [
    [PROTEIN, "Protein"],
    [CARBS, "Carbs"],
    [FAT, "Fat"],
    [RULE, "Not recorded"],
  ]
    .map(
      ([c, label]) =>
        `<td style="padding-right:14px;font-family:${FONT};font-size:11px;color:${INK_MUTED}">` +
        `<span style="display:inline-block;width:8px;height:8px;background:${c};border-radius:2px">&nbsp;</span> ${label}</td>`,
    )
    .join("");

  return `
  <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${INK_MUTED}">What you ate</p>
  <p style="margin:0 0 12px;font-family:${FONT};font-size:12px;color:${INK_FAINT}">Calories on the right; bar width compares days to each other.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:2px"><tr>${key}</tr></table>`;
}

function statRow(label: string, value: string, note = ""): string {
  return `<tr>
    <td style="padding:0 0 10px;font-family:${FONT};font-size:14px;color:${INK_MUTED}">${label}</td>
    <td align="right" style="padding:0 0 10px;font-family:${FONT};font-size:14px;font-weight:700;color:${INK}">${value}${
      note ? `<span style="font-weight:400;color:${INK_FAINT}"> ${note}</span>` : ""
    }</td>
  </tr>`;
}

export function renderDigestHtml(d: Digest): string {
  const units = d.units as Units;
  const first = d.name.trim().split(/\s+/)[0];

  const attendance =
    d.daysWeighed === 7
      ? "You weighed in every day this week."
      : d.daysWeighed === 0
        ? "No weigh-ins this week."
        : `You weighed in on ${d.daysWeighed} of 7 days.`;

  // The trend leads because it is the figure that does not flinch on a bad
  // morning — the whole reason MacroFactor puts it in front of the raw number.
  const trendLine =
    d.trendChangeLbs === null
      ? ""
      : `<p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_MUTED}">
           Your 7-day trend ${
             d.trendChangeLbs < 0
               ? `moved down <strong style="color:${DOWN}">${w(Math.abs(d.trendChangeLbs), units)} ${esc(units)}</strong>`
               : d.trendChangeLbs > 0
                 ? `moved up <strong style="color:${INK}">${w(d.trendChangeLbs, units)} ${esc(units)}</strong>`
                 : "held steady"
           }.
         </p>`;

  const stats = [
    d.highLbs !== null ? statRow("Highest", `${w(d.highLbs, units)} ${units}`) : "",
    d.lowLbs !== null ? statRow("Lowest", `${w(d.lowLbs, units)} ${units}`) : "",
    d.changeLbs !== null
      ? statRow(
          "Change over the week",
          `${d.changeLbs > 0 ? "+" : d.changeLbs < 0 ? "−" : ""}${w(Math.abs(d.changeLbs), units)} ${units}`,
          "raw",
        )
      : "",
    d.streak > 0
      ? statRow("Current streak", `${d.streak} day${d.streak === 1 ? "" : "s"}`)
      : "",
    d.daysLogged > 0 ? statRow("Days with meals logged", `${d.daysLogged} of 7`) : "",
    // Targets are hidden rather than guessed when blank — the same rule the app
    // follows for every figure derived from one.
    d.avgCalories !== null
      ? statRow(
          "Average calories",
          d.avgCalories.toLocaleString(),
          d.calorieTarget ? `of ${d.calorieTarget.toLocaleString()}` : "",
        )
      : "",
    d.avgProteinG !== null && d.avgProteinG > 0
      ? statRow(
          "Average protein",
          `${d.avgProteinG} g`,
          d.proteinTargetG ? `of ${d.proteinTargetG} g` : "",
        )
      : "",
  ]
    .filter(Boolean)
    .join("");

  const cheers =
    d.encouragements.length === 0
      ? ""
      : `<tr><td style="padding:16px 0 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};border:1px solid ${RULE};border-radius:20px">
            <tr><td style="padding:26px 32px">
              <p style="margin:0 0 12px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${INK_MUTED}">From your friends</p>
              ${d.encouragements
                .map(
                  (n) =>
                    `<p style="margin:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_MUTED}">
                       &ldquo;${esc(n.body)}&rdquo;
                       <span style="color:${INK_FAINT}">&mdash; ${esc(n.from)}</span>
                     </p>`,
                )
                .join("")}
            </td></tr>
          </table>
        </td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(digestSubject(d))}</title>
</head>
<body style="margin:0;padding:0;background:${GROUND};font-family:${FONT};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(attendance)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">

  <tr><td align="center" style="padding:0 0 10px">
    <img src="${SITE}/icon-192.png" width="52" height="52" alt="" style="display:block;border:0">
  </td></tr>
  <tr><td align="center" style="padding:0 0 26px;font-family:${FONT};font-size:15px;font-weight:700;color:${INK}">Helia</td></tr>

  <tr><td style="background:${SURFACE};border:1px solid ${RULE};border-radius:20px;padding:36px 32px">

    <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${TRACE}">Your week</p>
    <h1 style="margin:0 0 16px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;color:${INK}">Hi ${esc(first)}, here is your week</h1>

    <p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_MUTED}">${esc(attendance)}</p>
    ${trendLine}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 22px">
      <tr><td style="width:36px;height:2px;background:${TRACE};font-size:0;line-height:0">&nbsp;</td></tr>
    </table>

    ${weightChart(d)}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0">${stats}</table>

    ${macroChart(d) ? `<div style="margin-top:26px">${macroChart(d)}</div>` : ""}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0">
      <tr><td align="center" bgcolor="${INK}" style="border-radius:999px">
        <a href="${SITE}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:${SURFACE};text-decoration:none;border-radius:999px">Open Helia</a>
      </td></tr>
    </table>

  </td></tr>

  ${cheers}

  <tr><td style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_FAINT}">
    You are getting this because you turned on the weekly digest in
    <a href="${SITE}/settings" style="color:${INK_MUTED}">Helia&rsquo;s settings</a>.
    Turn it off there and these stop.
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`;
}

export function renderDigestText(d: Digest): string {
  const units = d.units as Units;
  const first = d.name.trim().split(/\s+/)[0];
  const lines = [
    `Hi ${first}, here is your week.`,
    "",
    `Weighed in on ${d.daysWeighed} of 7 days.`,
  ];
  if (d.trendChangeLbs !== null) {
    lines.push(
      `7-day trend: ${d.trendChangeLbs > 0 ? "+" : ""}${w(d.trendChangeLbs, units)} ${units}`,
    );
  }
  if (d.highLbs !== null) lines.push(`Highest: ${w(d.highLbs, units)} ${units}`);
  if (d.lowLbs !== null) lines.push(`Lowest: ${w(d.lowLbs, units)} ${units}`);
  if (d.changeLbs !== null) {
    lines.push(
      `Change over the week: ${d.changeLbs > 0 ? "+" : ""}${w(d.changeLbs, units)} ${units} (raw)`,
    );
  }
  if (d.streak > 0) lines.push(`Current streak: ${d.streak} days`);
  if (d.daysLogged > 0) lines.push(`Days with meals logged: ${d.daysLogged} of 7`);
  if (d.avgCalories !== null) {
    lines.push(
      `Average calories: ${d.avgCalories}${d.calorieTarget ? ` of ${d.calorieTarget}` : ""}`,
    );
  }
  lines.push("", "Day by day:");
  for (const day of d.days) {
    lines.push(
      `  ${day.date}  ${day.lbs === null ? "—" : `${w(day.lbs, units)} ${units}`}` +
        `${day.calories !== null ? `  ${day.calories} kcal` : ""}`,
    );
  }
  if (d.encouragements.length > 0) {
    lines.push("", "From your friends:");
    for (const n of d.encouragements) lines.push(`  "${n.body}" — ${n.from}`);
  }
  lines.push(
    "",
    `Open Helia: ${SITE}`,
    "",
    "---",
    "You are getting this because you turned on the weekly digest in Helia's",
    `settings. Turn it off there to stop: ${SITE}/settings`,
  );
  return lines.join("\n");
}
