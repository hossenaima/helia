/*
 * Generates every icon from one vector definition. `node scripts/make-icons.mjs`.
 *
 * The mark: a sun above a descending trace. Helia means sun, the app is a
 * morning ritual, and the line is the one thing it is actually about — so all
 * three ideas are the same drawing. The mark before this was the line alone,
 * which at home-screen size read as a stray stroke rather than anything.
 *
 * **The rays are load-bearing.** A plain disc above a line reads as a head over
 * a pair of shoulders — four separate attempts did, at every size. Rays are
 * what make it a sun instead of a face, and they are the reason this survives
 * being 40px in a notification tray.
 *
 * Two rules constrain the geometry, both learned the hard way (see NOTES.md):
 *
 *  - Everything stays inside 23–77% of the canvas, *including stroke width and
 *    ray length*, so Android's maskable crop cannot clip it. Round caps extend
 *    half a stroke past the endpoint, which is why the ends are inset.
 *  - The touch icon is opaque and un-rounded. iOS composites transparency onto
 *    black and applies its own mask, so pre-rounded corners double-round.
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const GROUND = "#f7f9f9";
const TRACE = "#2e776b";

const SAFE_LO = 512 * 0.23; // 117.8
const SAFE_HI = 512 * 0.77; // 394.2

const SUN = {
  cx: 208,
  cy: 200,
  r: 38,
  rayInner: 52,
  rayOuter: 68,
  rayWidth: 12,
  count: 8,
};
const LINE = {
  from: [140, 306],
  to: [372, 372],
  d: "M 140 306 C 216 318, 292 348, 372 372",
  width: 34,
};

// Round caps overshoot an endpoint by half the stroke; rays overshoot the sun's
// centre by their outer radius plus half of theirs.
const lineOvershoot = LINE.width / 2;
const sunReach = SUN.rayOuter + SUN.rayWidth / 2;

/** Fails loudly rather than shipping an icon Android will crop. */
function assertInsideSafeZone() {
  const bounds = [
    ["sun left", SUN.cx - sunReach],
    ["sun right", SUN.cx + sunReach],
    ["sun top", SUN.cy - sunReach],
    ["sun bottom", SUN.cy + sunReach],
    ["line left", LINE.from[0] - lineOvershoot],
    ["line top", LINE.from[1] - lineOvershoot],
    ["line right", LINE.to[0] + lineOvershoot],
    ["line bottom", LINE.to[1] + lineOvershoot],
  ];
  for (const [name, v] of bounds) {
    if (v < SAFE_LO || v > SAFE_HI) {
      throw new Error(
        `${name} at ${v.toFixed(1)} escapes the maskable safe zone ` +
          `(${SAFE_LO.toFixed(1)}–${SAFE_HI.toFixed(1)})`,
      );
    }
  }
}

function rays(ink) {
  return Array.from({ length: SUN.count }, (_, i) => {
    const a = (i * 2 * Math.PI) / SUN.count;
    const [dx, dy] = [Math.cos(a), Math.sin(a)];
    return (
      `<line x1="${(SUN.cx + dx * SUN.rayInner).toFixed(1)}"` +
      ` y1="${(SUN.cy + dy * SUN.rayInner).toFixed(1)}"` +
      ` x2="${(SUN.cx + dx * SUN.rayOuter).toFixed(1)}"` +
      ` y2="${(SUN.cy + dy * SUN.rayOuter).toFixed(1)}"` +
      ` stroke="${ink}" stroke-width="${SUN.rayWidth}" stroke-linecap="round"/>`
    );
  }).join("");
}

function svg({ background, ink }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${background ? `<rect width="512" height="512" fill="${background}"/>` : ""}
  <circle cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.r}" fill="${ink}"/>
  ${rays(ink)}
  <path d="${LINE.d}" fill="none" stroke="${ink}"
        stroke-width="${LINE.width}" stroke-linecap="round"/>
</svg>`;
}

const render = (markup, size) =>
  sharp(Buffer.from(markup)).resize(size, size).png().toBuffer();

assertInsideSafeZone();

const colour = svg({ background: GROUND, ink: TRACE });
// The badge is an alpha mask: Android keeps the shape and throws the colour
// away, so anything but a solid silhouette on transparent arrives as a blob.
// The old code pointed `badge` at the full-colour icon, which is exactly that.
const badge = svg({ background: null, ink: "#ffffff" });

await writeFile("public/icon-512.png", await render(colour, 512));
await writeFile("public/icon-192.png", await render(colour, 192));
await writeFile("public/apple-touch-icon.png", await render(colour, 180));
await writeFile("public/badge-96.png", await render(badge, 96));
await writeFile("public/icon.svg", colour);

console.log("wrote icon-512, icon-192, apple-touch-icon, badge-96, icon.svg");
