/**
 * The announcement email.
 *
 * Its own module so it can be rendered and looked at without sending anything —
 * `announce.mjs --preview` writes it to a file. An email template you have only
 * ever seen as source is one you have not seen.
 *
 * ## Why this looks nothing like the app's CSS
 *
 * Email clients are a decade behind browsers and disagree with each other.
 * The rules followed here, each because something breaks without it:
 *
 * - **Tables for layout.** Outlook on Windows renders through Word, which has
 *   no flexbox and no grid. A `<div>` column layout collapses there.
 * - **Every style inlined.** Gmail keeps `<style>` in most cases and drops it
 *   in others (notably when a message is clipped, or forwarded). Anything that
 *   *must* hold is on the element.
 * - **No custom properties.** `var(--ink)` resolves nowhere in Outlook, and a
 *   colour that fails to resolve is a black-on-black paragraph. The tokens are
 *   copied here as literals and named in comments instead.
 * - **System fonts.** Manrope would need a webfont, which Gmail strips — the
 *   stack degrades to something similar in weight rather than to Times.
 * - **600px.** The width every client has agreed on since Outlook 2007.
 * - **The mark is a PNG, not SVG.** Gmail removes SVG entirely. It is fetched
 *   from the live site, which works because `proxy.ts` exempts `icon-*` from
 *   the auth gate — and it carries alt text, because most clients block remote
 *   images until asked.
 *
 * The design brief is the app's: quiet over loud, colour reserved for meaning.
 * `--trace` appears twice — the rule under the mark and the button — and
 * nowhere else, so the email reads as the same object as the app rather than a
 * marketing message wearing its colours.
 */

const INK = "#181d20";
const INK_MUTED = "#5a656b";
const INK_FAINT = "#98a2a7";
const GROUND = "#f7f9f9";
const SURFACE = "#ffffff";
const RULE = "#e7ebec";
const TRACE = "#2e776b";

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const SITE = "https://helia-plum.vercel.app";

export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Blank-line-separated paragraphs, so a multi-paragraph body stays readable. */
function paragraphs(body) {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        // font-family repeated on every text element on purpose. Clients do not
        // reliably inherit it through table cells, and one element that misses
        // it falls back to the client default — which is a serif, so a single
        // omission reads as two different emails stapled together.
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_MUTED}">` +
        `${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

export function renderText(title, body) {
  return (
    `${title}\n\n${body}\n\n` +
    `Open Helia: ${SITE}\n\n` +
    `—\n` +
    `You are getting this because you added your email in Helia's settings.\n` +
    `Clear it there to stop: ${SITE}/settings\n`
  );
}

export function renderHtml(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Tells Apple Mail and Outlook.com this design has its own light treatment,
     so they tone down automatic inversion instead of recolouring everything. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${GROUND};font-family:${FONT};-webkit-text-size-adjust:100%">

<!-- Preheader: the grey line clients show beside the subject. Without one they
     scrape the first visible text, which would be the word "Helia" twice. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">
  ${escapeHtml(body.slice(0, 140))}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND}">
  <tr>
    <td align="center" style="padding:32px 16px">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">

        <!-- Mark and wordmark.
             The mark is the app icon, which is the descending stroke drawn on
             --ground with no alpha — so on this background it has no edge and
             reads as a stray squiggle by itself. The wordmark under it is what
             makes the pair a logo. alt is empty because the word beside it
             already says "Helia"; with images blocked, one name is right and
             two is a stutter. -->
        <tr>
          <td align="center" style="padding:0 0 10px">
            <img src="${SITE}/icon-192.png" width="52" height="52" alt=""
                 style="display:block;border:0">
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 0 26px;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:0.01em;color:${INK}">
            Helia
          </td>
        </tr>

        <!-- The card -->
        <tr>
          <td style="background:${SURFACE};border:1px solid ${RULE};border-radius:20px;padding:36px 32px">

            <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${TRACE}">
              What&rsquo;s new
            </p>

            <h1 style="margin:0 0 20px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;color:${INK}">
              ${escapeHtml(title)}
            </h1>

            <!-- A short rule in the accent, the one piece of colour besides the
                 button. Drawn as a table cell because an <hr> is styled
                 differently by every client. -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px">
              <tr><td style="width:36px;height:2px;background:${TRACE};font-size:0;line-height:0">&nbsp;</td></tr>
            </table>

            ${paragraphs(body)}

            <!-- Bulletproof button: padding on the <a> inside a table cell, so
                 the whole box is clickable even where the cell background is
                 dropped. Square corners in Outlook desktop, which is fine. -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0">
              <tr>
                <td align="center" bgcolor="${INK}" style="border-radius:999px">
                  <a href="${SITE}"
                     style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:${SURFACE};text-decoration:none;border-radius:999px">
                    Open Helia
                  </a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Why this arrived, and how to stop it. Quiet, but never absent. -->
        <tr>
          <td style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_FAINT}">
            You are getting this because you added your email in
            <a href="${SITE}/settings" style="color:${INK_MUTED}">Helia&rsquo;s settings</a>.
            Clear it there and these stop &mdash; your weigh-ins and meals are
            never in an email.
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}
