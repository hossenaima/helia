/**
 * Reset an account's password.
 *
 * There is no email recovery by design, and the secret is stored as a scrypt
 * hash — irreversible on purpose. So a forgotten password needs a new one set
 * directly, by someone who already has database access.
 *
 *   node scripts/reset-password.mjs <username-or-name> <new-password>
 *
 * Run it yourself rather than pasting a password into a chat window: whatever
 * you type here stays in your terminal.
 *
 * Accepts either identifier, because an account that has not yet been through
 * /setup has no username — and one that cannot sign in is exactly the account
 * likely to need this.
 */
import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const [, , rawName, newPassword] = process.argv;

if (!rawName || !newPassword) {
  console.error(
    "usage: node scripts/reset-password.mjs <username-or-name> <new-password>",
  );
  process.exit(1);
}
// Mirrors the floor in src/lib/credentials.ts. Kept as a copy because this is
// a plain .mjs script and cannot import the TypeScript module; if the rule
// there moves, move it here too.
if (newPassword.length < 8) {
  console.error("Password must be at least 8 characters, matching the signup form.");
  process.exit(1);
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("No DIRECT_URL or DATABASE_URL in the environment.");
  process.exit(1);
}

// Must match src/lib/auth.ts exactly, or the new password will not verify.
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(newPassword, salt, 64).toString("hex");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// Scoped to one account by identifier. Every scripted write against this
// database names its target — an unscoped UPDATE has destroyed real rows here.
const key = rawName.trim().toLowerCase();
const { rows } = await client.query(
  `UPDATE "User" SET "pinHash" = $1, "pinSalt" = $2, "updatedAt" = now()
   WHERE username = $3 OR handle = $3
   RETURNING name, username, handle`,
  [hash, salt, key],
);

await client.end();

if (rows.length === 0) {
  console.error(`No account matching "${rawName}".`);
  process.exit(1);
}
const who = rows[0];
console.log(
  `Password reset for ${who.name}. Sign in as "${who.username ?? who.handle}".`,
);
