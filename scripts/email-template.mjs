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

/**
 * Where "tell me what's broken" goes. Defaults to the sending account, which is
 * also what a plain Reply reaches — so the two routes land in the same inbox
 * whichever one someone takes.
 */
const FEEDBACK =
  process.env.FEEDBACK_EMAIL || process.env.GMAIL_USER || "vthecookie@gmail.com";

/**
 * The subject line: who it is from, then what it is about.
 *
 * "Helia update:" carries the sender, because in a crowded inbox the first
 * question is whose mail this is — the From name is easy to miss on a phone,
 * where Gmail shows the subject at nearly full weight and the sender small.
 *
 * **Email only.** The push notification keeps the bare title: a push already
 * shows which app it came from, so prefixing it there would spend the one line
 * a locked phone displays on a word the reader can already see. Same reason
 * "Friend request" was dropped from those titles.
 *
 * Keep the title short — Gmail truncates a subject around 70 characters on
 * desktop and closer to 35 on a phone, and this prefix spends 14 of them.
 */
export function renderSubject(title) {
  return `Helia update: ${title}`;
}

/**
 * First word of the display name. "Aima Hossen" greets as "Aima"; a one-word
 * name like "fatboy" is left as it is. Blank falls back to no greeting rather
 * than "Hi ," — a broken greeting is worse than none.
 */
export function firstName(name) {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

// font-family is repeated on every text element on purpose. Clients do not
// reliably inherit it through table cells, and one element that misses it falls
// back to the client default — which is a serif, so a single omission reads as
// two different emails stapled together.
const P = `margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_MUTED}`;

/**
 * A bulleted block, drawn as a two-column table rather than a `<ul>`.
 *
 * List indentation and bullet position are among the least consistent things
 * across mail clients — Outlook applies its own Word list formatting and
 * ignores most of what you ask for. A row per item with the glyph in its own
 * fixed cell puts the wrap exactly where it is drawn here, everywhere.
 *
 * The glyph is neutral ink, not `--trace`: in this app the trace means weight,
 * and spending it on decoration is what the design notes warn against.
 */
function bullets(items) {
  const rows = items
    .map(
      (item) =>
        `<tr>` +
        `<td valign="top" style="width:18px;padding:0 0 10px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_FAINT}">&bull;</td>` +
        `<td valign="top" style="padding:0 0 10px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK_MUTED}">${escapeHtml(item)}</td>` +
        `</tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px">${rows}</table>`;
}

/**
 * Blank-line-separated blocks. A block whose every line starts with `-` becomes
 * a bulleted list; anything else stays a paragraph — so a body can open with a
 * sentence and then list what changed.
 */
function blocks(body) {
  return body
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const isList = lines.every((l) => /^[-*•]\s+/.test(l));
      if (isList) return bullets(lines.map((l) => l.replace(/^[-*•]\s+/, "")));
      return `<p style="${P}">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

export function renderText(title, body, name) {
  const who = firstName(name);
  // The plain-text part gets the same content, including the feedback ask —
  // a reader whose client shows text only is exactly the reader most likely to
  // have something to report about it.
  return (
    `${title}\n\n` +
    (who ? `Hi ${who},\n\n` : "") +
    `${body}\n\n` +
    `Open Helia: ${SITE}\n\n` +
    `---\n` +
    `Something missing, or something broken? Reply to this email and tell me\n` +
    `what you want Helia to do — or write to ${FEEDBACK}.\n\n` +
    `---\n` +
    `You are getting this because you added your email in Helia's settings.\n` +
    `Clear it there to stop: ${SITE}/settings\n`
  );
}

export function renderHtml(title, body, name) {
  const who = firstName(name);
  // Sits after the rule rather than above the eyebrow: the eyebrow and headline
  // are what the eye lands on first, and a greeting above them pushes the
  // subject of the email below the fold on a phone.
  const greeting = who
    ? `<p style="${P}">Hi ${escapeHtml(who)},</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Tells Apple Mail and Outlook.com this design has its own light treatment,
     so they tone down automatic inversion instead of recolouring everything. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(renderSubject(title))}</title>
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

            ${greeting}${blocks(body)}

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

        <!-- Ask for feedback.
             This is where a textbox would go, and a textbox cannot go here:
             Gmail and Outlook strip <form> and its inputs outright, and an
             input field in a message is a phishing signal to spam filters. A
             mailto: link is the thing that works in every client — it opens
             their own mail app already addressed, with a subject filled in.
             Replying works too, since these are sent from that same account,
             so the sentence names both routes. -->
        <tr>
          <td style="padding:16px 0 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background:${SURFACE};border:1px solid ${RULE};border-radius:20px">
              <tr>
                <td style="padding:26px 32px">
                  <p style="margin:0 0 6px;font-family:${FONT};font-size:15px;font-weight:700;color:${INK}">
                    Something missing, or something broken?
                  </p>
                  <p style="margin:0 0 18px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_MUTED}">
                    Tell me what you want Helia to do and I will build it. Reply
                    to this email, or use the button &mdash; both reach me.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="border:1px solid ${INK};border-radius:999px">
                        <a href="mailto:${FEEDBACK}?subject=Helia%20feedback&body=What%20I%20would%20change%3A%0A%0A"
                           style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:14px;font-weight:700;color:${INK};text-decoration:none;border-radius:999px">
                          Send feedback
                        </a>
                      </td>
                    </tr>
                  </table>
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
