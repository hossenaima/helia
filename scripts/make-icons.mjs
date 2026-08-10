/*
 * Derives `public/badge-96.png` from `public/icon-512.png`.
 * `node scripts/make-icons.mjs` — run it after changing the icon.
 *
 * A notification `badge` is an **alpha mask**, not an icon: Android keeps the
 * shape and throws the colour away. Pointing it at the full-colour icon, which
 * is what this used to do, put a grey blob in the status bar. So the badge is a
 * white silhouette on transparent.
 *
 * The silhouette is measured off the icon rather than drawn again, so the two
 * cannot drift apart. Alpha comes from how dark a pixel is, which keeps the
 * mark's antialiased edges instead of hard-thresholding them into jaggies.
 *
 * This script does *not* generate the icons themselves. A generated sun-over-
 * trace mark was tried on 2026-08-10 and rejected by the owner ("ugly"); the
 * original hand-made single-descent PNGs were restored and are the source of
 * truth. Edit those, then re-run this.
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const SOURCE = "public/icon-512.png";
const GROUND_LUMA = (0xf7 + 0xf9 + 0xf9) / 3; // --ground, the page behind the mark
const TRACE_LUMA = (0x2e + 0x77 + 0x6b) / 3; // --trace, the mark itself

const { data, info } = await sharp(SOURCE)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const mask = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, p = 0; i < data.length; i += 3, p += 4) {
  const luma = (data[i] + data[i + 1] + data[i + 2]) / 3;
  const ink = (GROUND_LUMA - luma) / (GROUND_LUMA - TRACE_LUMA);
  mask[p] = 255;
  mask[p + 1] = 255;
  mask[p + 2] = 255;
  mask[p + 3] = Math.round(Math.min(1, Math.max(0, ink)) * 255);
}

const badge = await sharp(mask, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .resize(96, 96)
  .png()
  .toBuffer();

await writeFile("public/badge-96.png", badge);

// Cheap check that the mask is actually a mask: a silhouette of this mark
// should cover a slice of the canvas, not none of it and not all of it.
const covered =
  mask.filter((_, i) => i % 4 === 3).reduce((n, a) => n + (a > 128 ? 1 : 0), 0) /
  (info.width * info.height);
if (covered < 0.01 || covered > 0.5) {
  throw new Error(
    `badge silhouette covers ${(covered * 100).toFixed(1)}% of the canvas — ` +
      `expected 1–50%. Did ${SOURCE}'s colours change?`,
  );
}

console.log(
  `wrote badge-96.png from ${SOURCE} (${(covered * 100).toFixed(1)}% coverage)`,
);
