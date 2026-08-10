/**
 * Send an announcement to everyone: web push to subscribed devices, email to
 * accounts with an address on file.
 *
 *   node scripts/announce.mjs "Title" "What changed"          # dry run
 *   node scripts/announce.mjs "Title" "What changed" --send   # actually sends
 *
 * **Dry run is the default and that is deliberate.** This is the one command
 * here that reaches people outside the database, and it cannot be taken back.
 * Run it without `--send` first and read the recipient list.
 *
 * A local script rather than a page in the app: announcements go out a handful
 * of times, from the same terminal that runs the deploy, and an admin UI would
 * mean putting a send-to-everyone button on the public internet with its own
 * owner check to get wrong.
 *
 * Push needs NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; email needs
 * GMAIL_USER / GMAIL_APP_PASSWORD. Either half works without the other — a
 * missing pair is reported and skipped, not fatal, so a push-only send is a
 * normal thing to do.
 */
import "dotenv/config";
import pg from "pg";
import webpush from "web-push";
import nodemailer from "nodemailer";

const [, , title, body, ...flags] = process.argv;
const send = flags.includes("--send");

if (!title || !body) {
  console.error('usage: node scripts/announce.mjs "Title" "Body" [--send]');
  process.exit(1);
}
if (title.length > 80) {
  // A push title is truncated by the OS well before this; anything longer is
  // a body that ended up in the wrong argument.
  console.error("Title is over 80 characters — did the body land in $1?");
  process.exit(1);
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No DIRECT_URL or DATABASE_URL in the environment.");
  process.exit(1);
}

const db = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const { rows: mailTo } = await db.query(
  `SELECT name, email FROM "User" WHERE email IS NOT NULL ORDER BY name`,
);
const { rows: pushTo } = await db.query(
  `SELECT s.id, s.endpoint, s.p256dh, s.auth, u.name
     FROM "PushSubscription" s
     JOIN "User" u ON u.id = s."userId"
    ORDER BY u.name`,
);

console.log(`\n  ${title}\n  ${body}\n`);
console.log(`push devices : ${pushTo.length}`);
for (const p of pushTo) console.log(`   · ${p.name} — ${p.endpoint.slice(0, 48)}…`);
console.log(`email        : ${mailTo.length}`);
for (const m of mailTo) console.log(`   · ${m.name} — ${m.email}`);

if (!send) {
  console.log("\nDRY RUN — nothing sent. Re-run with --send to deliver.\n");
  await db.end();
  process.exit(0);
}

// ---------------------------------------------------------------- push -----
let pushSent = 0;
const dead = [];
if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  console.log("\nno VAPID keys — skipping push");
} else {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:noreply@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const payload = JSON.stringify({ title, body, url: "/", tag: "announcement" });

  await Promise.all(
    pushTo.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        pushSent++;
      } catch (error) {
        const status = error?.statusCode;
        // Same rule as src/lib/push.ts: 404/410 means forget the device.
        if (status === 404 || status === 410) dead.push(s.endpoint);
        else console.error(`  push failed for ${s.name}:`, status ?? error);
      }
    }),
  );

  if (dead.length > 0) {
    await db.query(`DELETE FROM "PushSubscription" WHERE endpoint = ANY($1)`, [
      dead,
    ]);
  }
}

// --------------------------------------------------------------- email -----
let mailSent = 0;
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.log("no GMAIL_USER / GMAIL_APP_PASSWORD — skipping email");
} else {
  const mailer = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  for (const person of mailTo) {
    try {
      await mailer.sendMail({
        from: `Helia <${process.env.GMAIL_USER}>`,
        to: person.email,
        subject: title,
        // Both parts, because a text-only mail is likelier to be filtered and
        // an HTML-only one is unreadable wherever HTML is off.
        text: `${body}\n\n—\nhttps://helia-plum.vercel.app\n\nYou are getting this because you added your email in Helia's settings. Clear it there to stop.`,
        html:
          `<p style="margin:0 0 1em">${escapeHtml(body)}</p>` +
          `<p style="margin:0 0 2em"><a href="https://helia-plum.vercel.app">Open Helia</a></p>` +
          `<p style="color:#5a656b;font-size:12px;margin:0">You are getting this because you added your email in Helia&rsquo;s settings. Clear it there to stop.</p>`,
      });
      mailSent++;
    } catch (error) {
      // One bad address must not stop the rest of the send.
      console.error(`  email failed for ${person.email}:`, error.message);
    }
  }
}

console.log(
  `\nsent: ${pushSent} push${dead.length ? ` (${dead.length} dead endpoints pruned)` : ""}, ${mailSent} email\n`,
);

await db.end();

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
