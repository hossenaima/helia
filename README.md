# Helia

A personal health log: a morning weigh-in with a progress chart, and a daily
meal log that can estimate calories from a plain-language description.

Built for a couple of people. Each person signs up with a name and a PIN, and
accounts are fully isolated — no query reads a weigh-in or a meal without
filtering on the account it belongs to. Everything lives in one Postgres
database (Supabase).

## Sections

**Weight** (`/`) — log this morning's weight, see the trace descend toward your
goal, and review or correct past entries. Re-submitting a date overwrites it, so
there is exactly one weigh-in per day. The **lb / kg** switch beside the title
changes the unit for the whole app at once; weights are stored in pounds either
way, so nothing is ever converted twice.

**Calendar** (`/calendar`) — tap any day to log or correct a weigh-in, see which
days you have logged, and track your streak. Also imports an Apple Health export
zip, parsed on your device so only the readings are sent.

**Meals** (`/meals`) — log what you ate per day. Either type a calorie number
yourself, or press **Estimate for me** to have the description broken into items with
calories, macros, fiber and sodium. Describe it however you like — "a third of
the fries", "left the broth" — and the estimate accounts for it. Estimated items are labelled, so you always know
which figures came from a model rather than from you — and tapping **Show
working** reveals the portion it assumed for each item, which you can then
correct or scale down.

**Friends** (`/friends`) — add someone by the name they signed up with. Once
they accept you can send each other short notes of encouragement, and see
whatever the other person has chosen to share: their weigh-ins, and their food
for the day — the total with each meal and what it cost. Weight starts on;
food starts off. Your streak is always visible — it says you
turned up, not what the scale said. Requests and unread notes show as a count
on the Friends tab.

**Settings** (`/settings`) — goal weight, start weight, units (lb or kg), your
PIN, and notifications.

## Notifications

Turn them on once per device, then choose what you want:

- **Morning weigh-in** — one notification a day at an hour you pick, in your own
  timezone, skipped entirely on days you have already logged. Defaults to 8am.
- **Friend activity** — when someone adds you or sends you a note.

Both are on by default: granting permission is the yes, so there is no second
round of switches to find.

On **iPhone**, notifications only reach apps on the Home Screen, never Safari
tabs. Open Helia in Safari, tap Share, then **Add to Home Screen**, and turn
reminders on from there. Settings says so on its own if you have not yet.

`/api/cron/reminders` does the work: it resolves each account's local hour and
notifies only the ones due. It is guarded by `CRON_SECRET` and is idempotent
per day, so calling it repeatedly cannot produce a second notification.

The hourly trigger is `.github/workflows/reminders.yml`, because Vercel's Hobby
plan allows only one cron run per day and one run a day can only serve one
timezone. Add two repository secrets under **Settings → Secrets and variables →
Actions** for it to work:

| Secret | Value |
| --- | --- |
| `APP_URL` | `https://helia-plum.vercel.app` (no trailing slash) |
| `CRON_SECRET` | the same value as the Vercel environment variable |

`vercel.json` keeps a daily run at 12:00 UTC as a backstop.

## Running it locally

```bash
npm install
cp .env.example .env       # then fill in the connection strings
npx prisma migrate deploy  # creates the tables
npm run dev                # http://localhost:3000
```

The first visit sends you to `/signup` to create an account. Nothing is
reachable before one exists.

## Forgot a password

Passwords are stored as scrypt hashes and there is no email recovery, so a
forgotten one is reset directly by whoever has database access:

```bash
node scripts/reset-password.mjs your_username "a new password"
```

It takes a username, or the name an account signed up with if it has not yet
picked one.

It writes to whichever database `DIRECT_URL` points at, so it fixes local and
production together. Weigh-ins and meals are untouched.

## Environment

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | yes | Supabase **transaction pooler** URI, port `6543`, with `?pgbouncer=true`. Used by the app at runtime. |
| `DIRECT_URL` | yes | Supabase **session pooler** URI, port `5432`. Used only to run migrations — the transaction pooler cannot run DDL. |
| `SESSION_SECRET` | in production | Random string, 16+ characters. Signs the session cookie. The app refuses to start in production without it. |
| `APP_TIMEZONE` | no | Fallback timezone only. Each account stores its own, captured from the browser at sign-in, and that is what decides when its day rolls over. Defaults to `America/New_York`. |
| `GEMINI_API_KEY` | no | Google AI Studio key. Turns on calorie estimation and "What can I eat?". Without it the app still works; those buttons are disabled and say why. |
| `GEMINI_MODEL` | no | Defaults to `gemini-2.5-flash`. |
| `ALLOW_SIGNUP` | no | Set to `false` to close signup once everyone who needs an account has one. The first account is always allowed. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | for reminders | Public half of the VAPID pair. Without it the reminder switch says push is not configured. |
| `VAPID_PRIVATE_KEY` | for reminders | Private half. Never sent to the browser. |
| `VAPID_SUBJECT` | for reminders | `mailto:` address push services contact about your traffic. |
| `CRON_SECRET` | for reminders | Bearer token the hourly cron must present. Without it `/api/cron/reminders` refuses every request. |

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generate the VAPID pair and a cron secret with:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deploying

The app holds no local state, so any host works — Vercel included.

1. Import this repo and let it run `npm run build`.
2. Set `DATABASE_URL`, `DIRECT_URL`, and `SESSION_SECRET`, plus `APP_TIMEZONE`
   if you are not on US Eastern.
3. Add `GEMINI_API_KEY` when you want estimation and suggestions on.

`npm run build` runs `prisma migrate deploy` first, so schema changes apply on
each deploy.

Once it is up, open it on your phone and add it to the home screen.

Note that Supabase pauses free-tier projects after a stretch of inactivity.
Daily use avoids it, but after a long break you may need to resume the project
from the dashboard before the app can reach the database.

## Notes on the data model

Days are stored as `"YYYY-MM-DD"` strings rather than timestamps. A weigh-in
belongs to a calendar day in your timezone, and storing it as a UTC instant
makes entries jump days across DST and travel.

Weights are always stored in pounds. The `units` setting only changes how they
are displayed and how your typed input is read.

Supabase is used purely as a Postgres host. The app does not use Supabase Auth,
row-level security, or the JavaScript client — it connects over the Postgres
wire protocol through Prisma, so swapping to any other Postgres provider means
changing two environment variables and nothing else.
