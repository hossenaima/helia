# Helia — engineering context

**This is the handoff document.** It is the accumulated reasoning behind the
code: what was decided, what was tried and abandoned, and which mistakes have
already been made so they need not be made again. Read it before changing
anything non-trivial. `README.md` is for someone *using* Helia; this is for
someone *working on* it.

It is a living document. When you learn something here that the next session
would otherwise rediscover the hard way, add it — see
[Keeping this document alive](#keeping-this-document-alive) at the end.

---

## Contents

- [What Helia is](#what-helia-is)
- [Who it is for, and how they work](#who-it-is-for-and-how-they-work)
- [Stack](#stack)
- [Where things live](#where-things-live)
- [Data model](#data-model)
- [Load-bearing decisions](#load-bearing-decisions)
- [Working on this database safely](#working-on-this-database-safely)
- [Gotchas](#gotchas)
- [Design system](#design-system)
- [Motion](#motion)
- [Verifying work](#verifying-work)
- [Third-party research already done](#third-party-research-already-done)
- [Tried and rejected](#tried-and-rejected)
- [Open items](#open-items)
- [Keeping this document alive](#keeping-this-document-alive)

---

## What Helia is

A personal health log for a handful of people. Two daily habits: a morning
weigh-in and meal logging, plus a light social layer for encouragement, and
small celebrations when a milestone or a calorie target is met.

- Repo: `git@github.com:hossenaima/helia.git`
- Live: <https://helia-plum.vercel.app>
- Five tabs: **Weight** (`/`), **Calendar**, **Meals**, **Friends**, **Settings**

**State of play, 2026-08-10.** Seven accounts, five of them testers. `main` is
pushed. Working: weigh-ins with a trend chart, a lb/kg switch and the time each one was
logged, the calendar —
which now shows each day's reading — and Apple Health import, meals with Gemini
estimation and one-tap reuse of a past meal, friends with account-wide weight
sharing and **per-friend** food sharing, a week chart behind each friend card,
web push reminders on an hourly GitHub Actions sweep, and milestone
celebrations. Not yet built: the steps-driven calorie bar. See
[Open items](#open-items) for what is waiting.

> **A migration and a deploy have to go together.** The per-friend sharing
> migration dropped `User.shareMeals` while the old build was still live, and
> `currentUser()` does a bare `findUnique` — so Prisma kept selecting a column
> that no longer existed and every signed-in page load threw until the deploy
> landed. A column drop is only safe once the code that reads it is gone.
> Deploy first, or add and drop across two releases.

The app is used mostly on an iPhone, first thing in the morning. Optimise for
that: fast, quiet, few taps, works one-handed.

## Who it is for, and how they work

Built by its owner, with a handful of invited testers using it — currently
Jerry plus Matthew, Saleh, Spider Man, fatboy and Nahian — seven accounts in
all. Anyone with an account is meant to be there. Preferences
observed over the course of building it — these are not guesses, they are things
that were said or that were changed after feedback:

- **Minimal, and proven before extended.** "Keep the features minimal and test
  as I go." A feature that is not yet earning its place gets removed, not kept
  behind a flag.
- **Quiet over loud.** Three separate visual directions were rejected for being
  too much: a pastel-per-tile palette ("why are we using such weird colors"), a
  heavy display weight ("looks cartoonish"), and a saturated teal ("more muted
  and less saturated"). When in doubt, subtract.
- **Do not make the user do arithmetic the app can do.** The manual portion and
  broth-left toggles were removed with exactly this reasoning: "the AI can
  figure it out based on the description."
- **An invited tester is not a user who chose this.** They were told "try my
  app" and nothing else, so the sign-in and signup screens say what Helia is
  and what it asks daily. Arriving at "Locked" and a PIN box told them nothing.
- **Ship and look at it.** Work is reviewed in the browser on a phone-sized
  viewport, not in the diff. Screenshots land better than descriptions.
- **Canned words have to sound like a person.** A tester asked for "Nice work
  today 👏" to go — "no one really says that" — and for the quick notes to
  answer which way the friend's weight went. Both were done on 2026-08-10.

## Stack

| Piece | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16, App Router, Turbopack | `proxy.ts` replaces `middleware.ts`; `cookies()`/`params` are async |
| Runtime | React 19 | Server Components by default; `<ViewTransition>` available |
| Database | Supabase Postgres via Prisma 7 | Driver adapters (`@prisma/adapter-pg`), `prisma.config.ts` |
| Generated client | `src/generated/prisma` | **TypeScript, not JS** — cannot be `import`ed from a plain `.mjs` script |
| Auth | Username + password, scrypt, HMAC-signed cookie | No accounts service for an app this size. Accounts predating this still sign in with a PIN until `/setup` |
| AI | Google Gemini (`@google/genai`, `gemini-2.5-flash`) | Meal calorie/macro estimation, behind one interface |
| Charts | Recharts | One `ComposedChart`; see [Verifying work](#verifying-work) before replacing it |
| Styling | Tailwind v4, `@theme inline` | Custom properties, **not** the shadcn `hsl(var(--x))` convention |
| Type | Manrope | Capped at 700; Nunito read as cartoonish once heavy |
| Auth screen | ShaderGradient (three/r3f) | Dynamically imported, `ssr: false` — daily pages never load it |
| Push | `web-push` + VAPID + `public/sw.js` | |
| Hosting | Vercel **Hobby**, deployed by CLI | Not Git-connected: `git push` does **not** deploy |

### Connection strings

- `DATABASE_URL` — transaction pooler, port **6543**, `?pgbouncer=true`. Runtime.
- `DIRECT_URL` — session pooler, port **5432**. Migrations only; the transaction
  pooler cannot run DDL.
- The direct endpoint (`db.<ref>.supabase.co`) is **IPv6-only** on the free tier
  and will fail with `getaddrinfo ENOTFOUND`. Use the pooler hostnames.
- A password containing `@` must be percent-encoded as `%40`.

## Where things live

```
src/app/(app)/          everything behind the PIN
  layout.tsx            header + <Nav>; owns auth redirect and the tab badge count
  template.tsx          <ViewTransition> crossfade between tabs
  loading.tsx           skeleton — also what makes these routes prefetchable
  page.tsx              Weight
  calendar|meals|friends|settings/
src/app/actions/        server actions, one module per area
src/app/api/cron/       CRON_SECRET-guarded; exempt in proxy.ts
src/app/setup/          the one-time username/password upgrade, outside (app)
src/lib/                pure logic — dates, units, nutrition, calendar, friends
src/lib/credentials.ts  username and password rules — no server-only, so forms
                        can import them
src/lib/ai/             estimator + the shared Gemini JSON call
src/lib/session.ts      crypto-only helpers, safe to import from proxy.ts
src/proxy.ts            optimistic auth gate + static-asset exemptions
prisma/migrations/      incremental, never reset — production data lives here
scripts/reset-password.mjs  the only credential recovery path
scripts/announce.mjs    push + email blast; dry run unless --send
```

## Data model

Days are `"YYYY-MM-DD"` strings, never timestamps. Weights are always stored in
**pounds**. Every row hangs off a `User`, and every query filters on `userId`.

- **User** — name/handle/`username`, `setupComplete`, `pinHash`/`pinSalt`, goal
  and target figures, `units`,
  `timezone`, `notifyWeighIn`/`notifyFriends`/`reminderHour`, `lastRemindedOn`,
  `milestoneLbs` (largest celebration already shown), `shareWeight`
- **WeightEntry** — one per `(userId, date)`; re-submitting corrects it
- **Meal** → **MealItem** — items carry `basis` (the estimator's working),
  `source`, and `precision` (`exact` | `estimated`)
- **DayLog** — per-day `activeBurnKcal`
- **Friendship** — one row with a `status`, not two mirrored rows; carries
  `requesterSharesMeals`/`addresseeSharesMeals`, since food sharing is
  per-friend and directional
- **Encouragement** — `readAt` drives the 12-hour expiry
- **PushSubscription** — unique by `endpoint`

## Load-bearing decisions

Each of these cost something to learn. Changing one means re-learning it.

### Time and units

**Days are strings, not timestamps.** A morning weigh-in belongs to a calendar
day in the user's timezone; a UTC instant makes entries jump days across DST and
travel.

**The timezone is per account, not per server.** `APP_TIMEZONE` survives only
as a fallback — it was wrong the moment a second person joined from another
zone.

**A weigh-in shows the time it was logged — but only when it was logged on its
own day.** The day key says nothing about the hour, and `createdAt` is when the
*row* appeared, not when anybody stood on a scale. For a calendar backfill or an
Apple Health import those are different things: the rows are written at the
moment of the import, so rendering that clock reading against a three-week-old
day would state a morning that never happened. `loggedTime()` in `(app)/page.tsx`
compares `dayKeyIn(createdAt, tz)` against the entry's date and returns null when
they disagree — no time at all beats a wrong one. It reads `createdAt` rather
than `updatedAt` because correcting a typo at 7:05 does not move the weigh-in.

**The time is on the sub-line of a log row, not beside the date.** "Mon, Aug 10 ·
11:44 AM" wraps at 390px and doubles the height of every row in the list. It
shares that line with the note, which was already rendered there.

**It is synced on every page load, not at sign-in.** Sign-in-only sounded
sufficient and was not: sessions last 90 days, so an account created before the
column existed sat on its `America/New_York` default indefinitely, and a person
who moves does not sign in again to tell us. That is not cosmetic — it files
weigh-ins under the wrong day and fires the morning reminder at the wrong hour.
`TimezoneSync` compares the browser's zone to the stored one on load and writes
only when they differ.

**Weights are stored in pounds, always.** `units` only decides rendering. That
is why the lb/kg switch cannot leave the chart and the figures disagreeing:
there is one value and one conversion.

### The chart

**The y-axis scales to the weights, never to the goal.** Forcing a distant goal
into the domain squashed the trace into the top third and hid the day-to-day
movement that is the reason to look. The goal line draws only when it can share
the frame; otherwise it is stated as text.

**The 7-day mean walks calendar days, not logged ones.** A gap in logging must
not compress the window and exaggerate a swing.

**Axis width is derived from the widest label.** A fixed `46px` was fine for
`180` and silently cropped the leading digit off `180.4` once narrow ranges
started getting a decimal.

### Celebration

**A milestone is shown once, then remembered.** `User.milestoneLbs` holds the
largest one already congratulated. Without it the same "10 lb down" greets you
every morning, which turns a moment into wallpaper. Monotonic, so regaining and
re-losing the same five pounds does not replay it.

**Not a modal.** The reason for opening the Weight tab is the number; a dialog
in front of it celebrates *at* the user rather than with them. It is a card in
the flow with one slow sweep of the accent, and a dismiss.

**"On target" needs food in it.** A day under target with nothing logged is an
empty day, not an achievement, so the calorie note requires at least one meal.

**Reassurance does not need food in it.** The opposite rule applies to the
water-retention banner, and gating it on a flagged meal was a bug: the physiology
does not depend on the log. A pound of fat is thousands of calories, so an
overnight jump is water and digestion whether or not anything was written down —
and a bad morning after an unlogged evening is the one *most* in need of the
note. A flagged meal now only decides whether the banner names a culprit.

### Meals

**Targets are entered by hand, never derived.** Mifflin-St Jeor can be off by
hundreds of calories for an individual, and a wrong target would quietly skew
the budget and every progress bar. Blank targets hide those features rather than
guessing.

**A logged meal is a saved meal.** There is no separate saved-meals table: a
meal already holds its description and its priced-out items, so logging it
again is a copy. `repeatMealAction` deliberately does not re-run the estimator
— the items were already paid for, and re-estimating the same description would
spend a request to get an answer we have and might get a slightly different
one, making the same breakfast drift day to day. The list is deduplicated by
name, most recent wins, because the useful question is "things I eat".

**The button said "Save meal" and meant "log it today".** That reads as "keep
this for later", which is what people expected it to do. It says "Log it" now,
and the reuse list is what "saved" turned out to mean.

**Itemise what the person can change, not what the dish is called.** If a
description says what went into something, each component gets its own line —
someone who used less granola needs a granola line to edit. A named restaurant
dish or a packaged bar stays whole; splitting a Big Mac into bun, patty and
sauce is noise nobody can act on. **The model collapses to the dish name unless
told this explicitly.**

**An estimate you cannot argue with is just a number you have to trust.** Every
item carries the estimator's working and is editable. Correcting one scales its
macros by the same ratio and flips it to `exact` — once a person has adjusted
it, it is their number.

**A logged day on the calendar shows its reading, not a dot.** Asked for by a
tester, and it makes the month a coarse chart you can read at a glance. The date
shrinks to a faint label when there is a number to show — the number is the
reason to look. Today is marked with a ring rather than the old bottom dot,
which the reading would have sat on top of.

**Apple Health parsing happens in the browser.** The zip is ~10MB but
`export.xml` inflates past 200MB, far beyond a serverless request body. Only the
extracted readings cross the network.

### Friends and notifications

**A friendship is one row with a `status`.** Both requester and addressee
indexes exist because both directions get queried.

**Sharing is the subject's decision, not the viewer's.** Your flags govern what
others see of *you*, never what you are willing to look at.

**Weight is one switch; food is one per friend.** This reverses an earlier call
here, on the owner's instruction (2026-08-10). The original reasoning was that a
per-friend matrix is bookkeeping a seven-person app does not need and that "who
exactly can see my food" is not a question anyone wants to answer repeatedly.
That was half right: nobody wants to answer it about their *weight*, which is
the same number whoever is looking, so `User.shareWeight` stays account-wide.
Food turned out to be exactly the thing people do want to answer per person — a
close friend and someone added last week are not the same audience for it.

`Friendship.requesterSharesMeals` / `addresseeSharesMeals` hold it. **Two
columns, because one row covers both directions** and A sharing with B says
nothing about B sharing with A. Which column a write lands in depends on which
end of the row you are, so `setMealSharingAction` fires two scoped
`updateMany`s and lets their combined count be the existence check — that is
also what stops a forged id from flipping somebody else's flag.

The migration backfilled each friendship from the account flag it replaced, so
it could only carry an existing choice across, never widen one. In the event
every account had it off, so nothing was riding on that.

**Enforced in `friendSummaries()`, never in the component.** A value that
reaches the client has been shared whether or not anything renders it. The
gating happens where the row is read, and food is not even fetched for people
who share none of it.

**Each meal flag covers the day's total *and* the per-meal breakdown.** They were
two flags briefly. A calorie total you cannot attribute to anything is not much
use, and the pair only made the incoherent combination "you may see 1,900 kcal
but not that it was pizza" expressible.

**Weight defaults on; food defaults off.** Weight was already visible to
accepted friends, so defaulting it off would silently withdraw something. Food
was never visible, so defaulting it on would publish food logs on the user's
behalf. Any future sharing flag follows the same rule, and a migration that
merges flags takes the OR so it can only preserve a choice, never widen it.

**The friend card opens to a week chart, and it is a `<details>`.** The header
row is the `<summary>`; nothing in it is interactive, which is what makes that
legal. No open/closed state, no handler, and keyboard and screen-reader
behaviour for free.

**That sparkline is inline SVG, not Recharts.** The Weight tab already pays for
Recharts; the Friends tab does not, and one seven-point line is not worth
putting the chart runtime on a second route. It is also less code than
configuring a `<LineChart>` would have been. Its y-range is the *week's* spread,
deliberately unlike the main chart's rule — this one answers "how has their week
gone", where the main one answers "where am I against my goal", so a quiet week
should still show shape rather than flatten.

**The quick notes follow the friend's last move.** Three canned sentences sat
above the note box regardless of what had happened to the person reading them,
and the same words are congratulation on one morning and salt in the wound on
the next. A loss offers congratulation, a gain offers encouragement ("Life has
its ups and downs", "Keep going"), and a friend whose weight you cannot see — or
who has no earlier reading to compare against — gets the sentences that are true
either way. The box stays free text in every case; this only decides what is on
hand.

This does not contradict the rule below. Nothing renders the direction or
scores it — `quickNotes()` reads `changeLbs` and never shows it.

**"Nice work today 👏" is gone because nobody talks like that.** A tester said
so directly. Canned encouragement fails in the direction of sounding canned, so
the replacements are shorter and plainer.

**A friend's gain is not scored.** The delta renders in `--down` for a loss and
inherits the muted text otherwise. Rust `--up` and an ↑ told someone off for
their morning on the one screen built for encouragement — your own Weight tab
still colours both directions, because that is your data and the feedback is the
point.

**Streak and "logged today" are always visible.** They say a person turned up,
not what they weigh or ate, and with everything else off a friend card would
be a name with nothing to encourage.

**`requestFriendAction` returns the same message whether or not the name
exists**, so the form cannot be used to discover who has an account.

**Removing a friend asks first, in a native `<dialog>`.** It is destructive,
irreversible without a fresh invite, and sat one tap below the note box.
`showModal()` puts it in the top layer — above every stacking context, so it
cannot end up under the glass panels or the fixed tab bar the way a hand-rolled
overlay would — and brings focus trapping, Escape-to-close and background
inertness for nothing. Cancel is `<form method="dialog">`, which closes without
submitting. This does not contradict "the celebration is not a modal": that one
interrupts you to say well done, this one stops you deleting something.

`.confirm` and `.confirm::backdrop` live in `@layer components`, like every
component rule here — and the backdrop has to be named explicitly, because it
is a top-layer pseudo-element that no descendant selector reaches.

**A note is deleted 12 hours after it is *read*, not after it is sent.** An
unread note waits indefinitely, so nothing can vanish before it has been seen.
The page filters expired ones so the moment is exact; the cron deletes them so
text the reader was told had gone is not still in the table. The card shows a
live "fades in 11h" — a message that silently disappears reads as a bug.

**Notification kinds are separate from the hour.** `notifyWeighIn` decides
*whether*, `reminderHour` decides *when*. Collapsing them into a nullable hour
meant turning reminders off also forgot the chosen time.

**The first device to subscribe switches both kinds on.** Granting permission is
the yes; a settings panel where everything is still off asks it twice. Only the
first device, so a second cannot undo choices already made.

**Reminders need an hourly sweep, not a daily one.** "8am" is a different
instant for every account, so one run a day can only ever serve one timezone.
**Vercel Hobby caps crons at one run per day and rejects the deploy outright for
anything faster** — so the hourly trigger is `.github/workflows/reminders.yml`
and the `vercel.json` cron is a daily backstop.

**Every scheduler that reaches that route is at-least-once, and two can
overlap**, so `User.lastRemindedOn` makes it idempotent per day. Calling it
repeatedly is safe by design; that is what lets a free scheduler drive it.

**A `badge` is an alpha mask, not an icon.** Android keeps the shape and throws
the colour away, so pointing `badge` at the full-colour `icon-192` put a grey
blob in the status bar. It is `badge-96.png` — a white silhouette on
transparent, generated alongside the rest.

**The notification title carries who, not what kind.** "Friend request" spent
the one line read on a locked phone saying nothing; it is "Aima wants to be
friends" now, with the category demoted to the body.

**The morning reminder names the streak.** The same sentence every day is how a
reminder becomes wallpaper. The sweep already had to ask whether today was
logged, so it reads the recent days instead of one row and gets the streak from
the same query.

**`notifyFriendActivity` never throws into its caller.** A push service being
slow is not a reason for the friend request itself to fail.

### Identity and credentials

**The display name and the login key were already separate columns**, which is
the only reason moving to usernames cost so little. `name` is what friends see;
`handle` was what you typed. Adding `username` changed the second without
touching the first, so nobody's card changed when their login did.

**Nothing converts an account in advance — the account converts itself.** The
2026-08-10 migration adds `username` and `setupComplete` and rewrites *no
credentials*: every account keeps the PIN it had. An account with
`setupComplete = false` signs in exactly as before, and is then sent to `/setup`
once to choose a username and a password. The old secret stays valid right up to
the moment its owner replaces it, which is what makes this incapable of locking
anybody out — including someone who never comes back. The alternative, rewriting
handles in the migration and mailing people their new names, has a failure mode
where somebody simply cannot get in, and there is no email on file to fix it
with.

**The gate is in `(app)/layout.tsx`, not in the login action.** Sessions last 90
days, so an account that has not signed in since before `/setup` existed is
already inside the app and would never pass a login-time check. The layout is
the one place every signed-in page goes through. `/setup` lives outside the
`(app)` group for the same reason — inside it, it would redirect to itself.

**Sign-in accepts a username or a legacy handle, and that is temporary.** The
fallback exists only while accounts predating usernames survive. **It is also
why `usernameProblem` is not the whole check**: `usernameTaken()` looks at
`handle` as well, or Matthew could take the username `jerry` while Jerry's
legacy handle is also `jerry`, and one typed word would name two accounts. Only
single-word handles can collide — a username may not contain a space — which is
exactly the set that query catches. **Once every account has a username, drop
the handle fallback and this check gets simpler.**

**Password rules are length and a blocklist, not composition.** NIST SP 800-63B
stopped recommending mixed-case-and-a-symbol: those rules reliably produce
`Password1!` and buy very little. `src/lib/credentials.ts` asks for 8
characters, rejects a short list of the most common passwords, and rejects a
password containing the username. Nothing is refused for lacking a symbol. The
common-password list is 24 entries inline and carries a `ponytail:` note
pointing at the haveibeenpwned range API for when this app takes people who did
not get an invite.

**The reserved-username list is a phishing control, not tidiness.** The social
layer here is people sending each other short notes; an account called `helia`
or `support` is a way to ask another tester for their password.

**Deleting an account is a real delete, and it asks for the password.** App
Store guideline 5.1.1(v) requires an in-app way to delete an account, but this
is the right shape for a health log anyway: it is the most personal data here,
and "ask the owner to run a script" is not a way to withdraw it. Nothing is
soft-deleted — a deletion that leaves the rows in the table is not what is
being asked for. The password is re-entered because the realistic threat is a
phone left unlocked on a table, not a forged POST.

**One `prisma.user.delete` is the whole thing**, because every relation to
`User` is `onDelete: Cascade` — weigh-ins, day logs, meals and their items,
friendships in both directions, notes sent *and* received, push subscriptions.
Adding a table that hangs off `User` without a cascade would silently break
deletion; the check is that `verify-delete` counts zero in each of them.
`endSession()` runs *after* the delete, so a failed delete cannot sign someone
out of an account that still exists.

**The password rules live in one module, and that is not decoration.** For one
commit `changePinAction` kept a local `/^\d{4,10}$/` after signup had moved to
passwords, so the Settings screen would have refused a real password and
insisted on digits — quietly downgrading anyone who used it back to a
four-digit PIN. Every path that sets a credential now goes through
`passwordProblem`.

**`pinHash`/`pinSalt` now hold a password.** The names are historical. Renaming
a column here means dropping one, which takes production down until a manual
deploy lands (see below) — not worth it for a name. The schema comment says so
at the column.

### Announcements

**It is a script, not a page.** `node scripts/announce.mjs "Title" "Body"` goes
out a handful of times a year from the same terminal that runs the deploy. An
admin page would mean a send-to-everyone button on the public internet with its
own owner check to get wrong, for something used less often than `vercel
deploy`.

**Dry run is the default.** `--send` is required to deliver. This is the only
command in the repo that reaches people *outside* the database, and it cannot be
recalled — so it prints the recipient list and stops.

**Gmail SMTP, because there is no domain.** Resend and every peer will only send
to arbitrary recipients once a sending domain is DNS-verified, and the project
is on a `vercel.app` subdomain nobody here controls — so Resend could have
emailed the account owner and nobody else. A Gmail app password sends to anyone,
free, today, at a daily cap thousands of times what seven people need. **Revisit
this if the app ever leaves the invited-friends stage**: Gmail's cap and
reputation are not a mailing list.

**No email column means no email.** Presence *is* the subscription — clearing
the box in Settings is the unsubscribe. A second `notifyAnnouncements` flag
beside it could only ever contradict it. Every announcement says why it arrived
and how to stop, in both the text and HTML parts.

**Addresses are self-entered, and that is the consent record.** Nothing in the
app writes an address into somebody else's account. The two on file (2026-08-10)
were seeded by hand for testing on the owner's instruction, which is a departure
from that rule and worth knowing when reading the table.

### Security

**Accounts are isolated at the query level.** Every read filters on `userId`,
every delete is a scoped `deleteMany`. A forged POST cannot reach another
account's data.

**`/api/cron/*` is exempt in `proxy.ts`** — it authenticates with `CRON_SECRET`,
and a redirect to `/login` would turn a failed cron into a silent 307.
`/sw.js`, `/manifest.webmanifest`, `/icon-*`, `/apple-touch-icon*` are exempt
too: the OS fetches them during install, outside any session.

**No password recovery by design.** `scripts/reset-password.mjs` is the escape
hatch. It re-hashes with the same scrypt parameters as `src/lib/auth.ts`, and
carries a copy of the minimum length from `src/lib/credentials.ts`; all three
must stay in step or a reset password will not verify, or will be one the form
would have refused.

---

## Working on this database safely

> **`DATABASE_URL` is production.** There is no local database and no
> point-in-time recovery on the Supabase free tier.

**Scope every scripted write to a test account.** An `UPDATE "Encouragement"
SET "readAt" = now() - interval '13 hours'`, written to age one test note, aged
every row in the table — and the next cron pass deleted four real messages
between the two live accounts. Three were recovered only because a `SELECT` had
been run moments earlier; the fourth was lost. Every write from a script gets a
`where` naming the test handle or id.

**Clean up test accounts.** Signup is open, so test accounts land in the same
table as real ones. Delete by handle when done; cascades handle the rest.

**Naive timestamps are read differently by Prisma and by `pg`.**
`createdAt`/`readAt` are `timestamp without time zone` holding UTC instants.
Prisma writes and reads them as UTC; the raw `pg` client parses them as *local*
time, so a `SELECT` through a script renders them shifted by the machine's
offset. Use `to_char(col, 'YYYY-MM-DD HH24:MI:SS')` when the exact stored value
matters, and **never round-trip a displayed value back in** — that is how a
restore went in seven hours late.

**Migrations are incremental and never reset.** Real data lives in this
database. Write a new migration; do not `migrate reset`.

**A column drop takes production down until the deploy lands.** Deploys here are
manual, so `migrate deploy` and `vercel deploy --prod` are two separate acts and
the gap between them is real downtime. `currentUser()` does a bare
`findUnique`, which makes Prisma select *every* column its schema knows — so a
dropped column breaks every signed-in page load on the old build, not just the
feature that used it. This happened on 2026-08-10 with `User.shareMeals`. Deploy
the code that stops reading the column first, then drop it; or accept the gap
knowingly and keep it short.

That same column is the worked example of doing it right the second time.
`20260810210000_drop_orphan_share_meals` ran only once production was serving
code that had never heard of it, and all five signed-in tabs were then loaded
against the live site to confirm — the check that matters is a *signed-in* page,
because that is the one `currentUser()` is on the path of.

**Regenerate and restart after a schema change.** `npx prisma generate` writes
to `src/generated/prisma`, and a running dev server keeps the old client in
memory. Turbopack HMR has also been seen serving a stale route module after an
edit — if a change appears not to have taken, restart before debugging further.

---

## Gotchas

Grouped by where they bite.

### Next.js / React

- **`"use server"` files may export only async functions.** Constants and
  parsers must live in a separate module.
- **Client components cannot import anything that pulls in `server-only`.**
  Shared vocabulary lives in a module the AI code does not own.
- **`proxy.ts` must not import Prisma.** Crypto-only helpers were split into
  `src/lib/session.ts` for this.
- **Pages will prerender static and bake in a redirect.** Anything reading auth
  needs `export const dynamic = "force-dynamic"`.
- **A dynamic route with no `loading.tsx` is not prefetched at all.** This is
  most of why tab switching felt slow.
- **`usePathname` only changes once the route is ready**, so an active-tab
  indicator driven by it is always a beat behind. Use an optimistic value.
- **`currentUser()` is wrapped in React `cache()`** — the layout and the page
  both ask, and without it that is two identical queries per navigation.
- **React resets a `<form action={serverAction}>` after the action returns —
  on failure as well as success.** Uncontrolled inputs revert to their
  `defaultValue`, which is usually empty, so a rejected form clears every field
  including the ones that were right. On signup that meant one mistyped
  username also wiped the display name, and the retry then complained *"Use
  2–30 letters or numbers for your name"* — an error pointing at a field the
  form had just emptied itself. The fix is to echo the submitted values back in
  the action's return state and feed them to `defaultValue`, keyed so the input
  remounts with the new value before the reset lands on it. Passwords are
  deliberately left out of that echo. **This is invisible to a test that
  reloads the page between attempts**, which is why it survived to production:
  every local check navigated fresh, and only a real retry found it.
- **A submit button's `name`/`value` is serialised natively.** Setting React
  state in `onClick` to record which button was pressed *races the submission*
  and can send the previous value.
- **A client input mirroring a server-rendered number must follow it.**
  `WeighInForm` seeded state from a prop and kept it, so switching to kg left a
  pounds figure under a "kg" label.

### CSS

- **The name is the login, so its normalisation is load-bearing.** `toHandle`
  folds NFKC, trims, collapses inner whitespace runs and lowercases. Trimming
  and lowercasing alone let `Dupe One` and `Dupe  One` become two accounts that
  looked identical in every list — and a friend request typed with single
  spaces could never find the doubled one. Changing this function re-keys every
  lookup: check that no existing handle drifts before touching it.
- **A uniqueness check before an insert is not a guarantee.** Two people
  submitting the same name at once both passed it, and the loser got an
  unhandled Prisma `P2002` rendered as "An error occurred in the Server
  Components render". Catch the constraint violation and return the same
  friendly message the pre-check would have.
- **Unlayered CSS beats every Tailwind utility, whatever the specificity.**
  This is the single most expensive trap in this codebase and it has bitten
  three times. `@import "tailwindcss"` emits utilities into `@layer utilities`,
  and an unlayered rule wins over *any* layer — so a plain `.glass { position:
  relative }` defeated `fixed` on the tab bar and `sticky` on the header, and
  `.eyebrow { display: block }` defeated `flex` on the nav labels. **Lowering
  specificity does not help**: `:where(.glass)` at specificity zero still won,
  because layer order is checked before specificity. The fix is to put the
  component rule inside `@layer components`, which the import orders *before*
  `utilities`. Every `!` prefix scattered through the components
  (`!rounded-none`, `!text-ink`, `!py-2`…) is a workaround for this same thing;
  they can be deleted as their rules move into the layer.
- **A class describing how something looks must not set where it sits.** Even
  layered correctly, `position` on `.glass` is a smell — the material and the
  layout are different concerns.
- **An absolutely positioned `::after` escapes to the viewport if its element
  is `static`.** The tab bar was `md:static` on desktop, so the glass
  refraction layer — `position: absolute; inset: -36px` — resolved against the
  initial containing block instead of the bar, and washed the entire page out.
  It only appeared once the unlayered `position: relative` stopped masking it.
  Any element wearing `.glass`, `.card` or `.tile` must stay positioned.
- **A dead duplicate can keep contributing.** An entire superseded `.glass`
  frost implementation sat above the lens one for weeks; the later block won
  most properties so nothing looked wrong, and it was only found while chasing
  the position bug. Delete a superseded block when you supersede it.
- **Fixed chrome at both ends means "scrolled into view" is not "visible".**
  `scroll-padding-top`/`-bottom` on `html` account for the sticky header and
  the tab bar; without them, focusing an input near the bottom parks it under
  the bar, where a tap lands on a tab instead of the control.
- **`viewport-fit=cover` is required** for `env(safe-area-inset-*)` to be
  non-zero on iPhone. Without it the bottom bar sits under the home indicator.
- **`backdrop-filter: url(#filter)` does not work in Chrome.** SVG filters are
  honoured by `filter` only; the whole declaration computes to `none`.
- **`*` does not match `::view-transition-*`.** They are top-layer
  pseudo-elements, descendants of nothing, so the global reduced-motion override
  does not reach them. The same hole opens under any JS-driven animation.
- **A `<form>` wrapper becomes the flex item, not the button inside it.** Use
  `display: contents` — this is why Lock sat two pixels below the account name.

### Gemini

- **Structured output has a complexity budget.** Too rich a schema is rejected
  outright with *"the specified schema produces a constraint that has too many
  states for serving"* — no partial result, no hint which part is at fault. A
  `maxItems` on a nested array is the worst offender and each nullable field
  doubles the state count again. **Keep response schemas flat and fully
  required; cap array length in code.** This was the root cause of estimation
  silently never working.
- **Backticks inside a backtick-delimited prompt** break the template literal.
  Use double quotes when naming a field in prompt text.

### Push notifications

- **iPhone only delivers web push to a Home Screen app**, never a Safari tab.
  `PushManager` is simply absent there with no way to feature-detect *why*, so
  Settings checks for iOS plus non-standalone display and says to install.
- **Chrome refuses the Push API in incognito**, so a Puppeteer
  `createBrowserContext()` cannot test subscribing. Use the default context with
  a `userDataDir`.
- **`pushManager.subscribe()` rejects for reasons the page cannot anticipate.**
  Wrap it — an unhandled rejection took the whole settings panel down with no
  message.

### Dependencies

- **`@shadergradient/react` declares no dependencies or peers** but imports
  `three`, `@react-three/fiber`, `camera-controls` and `three-stdlib` at
  runtime. Grepping `src/` for imports will wrongly report those as dead.
- **`PrismaBetterSqlite3`**, not `PrismaBetterSQLite3` — relevant only if SQLite
  ever comes back.

---

## Design system

Defined in `src/app/globals.css`. Light is the designed-for case; dark exists
behind `[data-theme="dark"]` and is opt-in, so an OS-dark phone still gets the
intended light look.

**There are no `dark:` classes anywhere and no `@custom-variant dark`.** In
Tailwind v4 a bare `dark:` compiles to `prefers-color-scheme`, so any pasted-in
component carrying `dark:` classes will flip dark on someone's phone while the
rest of the app stays light.

### Colour

| Token | Light | Role |
| --- | --- | --- |
| `--ground` | `#f7f9f9` | page |
| `--surface` / `--surface-sunk` | `#ffffff` / `#eef1f2` | cards, wells |
| `--ink` / `--ink-muted` / `--ink-faint` | `#181d20` / `#5a656b` / `#98a2a7` | text |
| `--trace` | `#2e776b` | the weight line — the one accent |
| `--goal` | `#9a3ba0` | goal horizon, dashed and labelled |
| `--down` / `--up` | `#3a6d4a` / `#97503c` | toward / away from goal |

**Colour is reserved for data.** An earlier pass gave each tile its own pastel
and read as noise. The only saturated things on screen mean something.

**And `--trace` in particular means *weight*.** The week strip used to fill
logged days with it, which said a day you turned up is the same kind of thing as
the number you weighed. Attendance is neutral ink; the trace is for the trace.

**The neutrals are neutral.** They used to carry a green cast at every step,
which put a second green on screen arguing with the trace and read as olive.

**The trace is deliberately under the `dataviz` validator's categorical chroma
floor** (0.075 against a floor of 0.1). That floor keeps many series apart by
hue; there is one series here and the goal line is dashed and directly labelled.
Muting it also took contrast from 3.97:1 to 5.29:1. `--goal` stays saturated on
purpose — it is what holds ΔE 8.5 separation from the trace for a deutan reader.

### Type and controls

- **`.eyebrow` is 600, not 700.** Nearly every label, tab and section heading
  wears it; at 700 the interface shouted in unison. Bold is left for data.
- **Buttons are `.btn` + `.btn-primary` / `.btn-quiet` / `.btn-soft`; small
  pills are `.chip`.** Ten inline copies of the same string used to spell this
  out, every one uppercase and tracked wide — against soft cards that reads as
  shouting. Sentence case, defined once.
- **A disabled `.btn-primary` recedes to the sunk surface** rather than dimming
  to 40%: a full-width dark button at 40% is a grey slab, and a grey slab reads
  as broken rather than "nothing to submit yet".

### Glass

**Glass is a lens, not a frost.** A blur alone reads as frosted plastic. The
refraction comes from an oversized `::after` carrying a copy of the page wash,
warped by an SVG `feTurbulence` + `feDisplacementMap` and clipped by the panel.
Both the body wash and the copy are `background-attachment: fixed`, which is
what makes the copy line up with the real backdrop — **the trick does not
survive removing that.** The wash on `body` is load-bearing: on a flat
near-white page there is nothing to refract.

### Icons

The mark is **one descending stroke** in `--trace` on `--ground`. The PNGs are
the source of truth — there is no vector original.

- An S-curve was tried first; at home-screen size two inflections read as a
  squiggle. One descent survives the scale.
- A **sun above the trace** was tried on 2026-08-10 and rejected by the owner
  as ugly, and the original was restored byte-for-byte. It is in the history at
  `a512526` if the idea ever comes back. Worth knowing if it does: a plain disc
  above a line reads as a head over a pair of shoulders at every size, and rays
  were the only thing that fixed it.
- `apple-touch-icon.png` is 180×180, **opaque and un-rounded**. iOS composites
  transparency onto black and applies its own mask, so pre-rounded corners
  double-round.
- The mark stays inside 23–77% of the canvas to survive Android's maskable crop.

**`icon-badge-96.png` is generated — `node scripts/make-icons.mjs`. Re-run it
after changing the icon.** A notification badge is an alpha mask: Android keeps
the shape and discards the colour, so pointing `badge` at the full-colour icon
put a grey blob in the status bar. The silhouette is *measured off*
`icon-512.png` rather than drawn again, so the two cannot drift; alpha comes
from how dark each pixel is, which keeps the antialiased edges instead of
thresholding them into jaggies.

**Its `icon-` prefix is load-bearing.** `proxy.ts` exempts `icon-*` from the
auth gate, and the service worker fetches the badge while showing a
notification — outside any session. Shipped as `badge-96.png` it was redirected
to `/login` with a 307 and would never have loaded. Anything the OS or the
service worker fetches has to match an exemption; naming it into the existing
`icon-` rule is cheaper than adding another one.

---

## Motion

**Deliberately no animation library.** Motion is ~42kB gzipped on `motion/react`
(`motion/react-mini` is 3.2kB); anime.js is ~13kB for `animate()` alone. A 40kB
library in the `(app)` layout lands on every tab, on a phone, at 7am. Everything
wanted here was already paid for:

- **Tab crossfades** — React `<ViewTransition>` via `experimental.viewTransition`
  and `(app)/template.tsx`. A template remounts per navigation where a layout
  does not, which is what gives React two states to fade between.
- **The lit tab marker** — one absolutely positioned element translated by
  index, which is why tabs are equal width at every size: nothing has to be
  measured. Five peer tabs have no forward or back, so a directional slide would
  claim a hierarchy that is not there.
- **Row entrances** — the existing `settle` keyframe with a capped
  `animationDelay`. That is what `stagger()` would have cost 17kB for.
- **The chart's trend line** — Recharts' own `isAnimationActive`. The daily area
  stays static; two lines animating at once reads as a fidget.
- **The goal ring** — `stroke-dashoffset` winding back from a full
  circumference to zero, so the arc draws itself from twelve o'clock rather
  than fading in. The arc length is passed as a custom property, which is what
  lets a keyframe animate a value only the server knows.
- **Press feedback** — `.btn:active { transform: scale(0.98) }`. With
  `-webkit-tap-highlight-color` suppressed globally there was no acknowledgement
  of a tap at all.

If something genuinely needs interruptible springs or gesture-tracked drag —
the two things CSS cannot do — reach for `motion/react-mini`'s `useAnimate`,
not `motion/react`.

---

## Verifying work

**Claims about this app are checked in a browser, not asserted.** The pattern
that works:

- `puppeteer-core` driving the system Chrome from the scratchpad directory
  (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `--no-sandbox
  --enable-unsafe-swiftshader`), at a 390×844 viewport.
- Test against `next start` on a spare port for realistic timing; `next dev` is
  much slower and misleading for anything performance-related.
- Two isolated browser contexts for anything involving two accounts.
- Direct SQL through `pg` to confirm what actually landed in the database.
- `node scripts/validate_palette.js` from the `dataviz` skill for any palette
  change — the colour part is computable, so compute it.

**Test-selector traps that have wasted time before:**

- CSS `text-transform: uppercase` changes `innerText`, so `=== "kg"` fails where
  `.toLowerCase()` succeeds.
- `form button[type="submit"]` matches the header Lock form too. Scope it.
- `::-p-text(Save)` also matches "Save meal".
- `document.querySelector("svg")` finds the glass filter's `<svg>`, not the
  chart. Scope to the chart's section.
- Clicking immediately after a redirect can beat hydration; the click is
  swallowed. Wait for the control to *enable* rather than sleeping — a button
  disabled until React sees a value will silently eat the click otherwise, and
  the save just never happens.
- Puppeteer positions its own clicks, so a control under the fixed tab bar gets
  the tab instead. `scrollIntoView({ block: "center" })` first. A click that
  quietly navigates to another tab looks exactly like a broken save.
- **Restart `next start` after every build.** Serving a stale manifest against
  freshly hashed chunks produces 500s on assets and CSS that looks like a
  regression in the feature you just wrote.
- A transition sampled after its duration looks like a jump. Sample inside it.

---

## Third-party research already done

Researched in depth; **do not re-research without a reason.**

| Source | Verdict |
| --- | --- |
| Motion (motion.dev), anime.js | Neither. See [Motion](#motion). |
| kokonutui | **No.** 31 of 40 free components need Motion; hardcodes `text-zinc-900 dark:text-white` with no token layer, so adapting is a rewrite not a find-and-replace; its `dark:` classes would break this app's light-only intent. Its `liquid-glass-card` is cruder than what is here. |
| bklit | Not the code — one chart pulls ~3,400 lines and 8 deps, on a pinned visx alpha. **Two free ideas:** its chart token vocabulary (`--chart-grid`, `--chart-label`, `--chart-line-primary`) and its projection-line concept ("at your current rate you reach goal around Nov 14"), drawable in Recharts as a second `<Line>`. |
| Recharts | **Keep it.** Nothing evaluated beat it for one line chart. |
| Mobbin | Hard 403 to any automated fetch. Needs a human logged in. |
| Awwwards | Accessible but near-useless here — agency showreels judged partly on motion spectacle. |
| OpenJarvis | Irrelevant. A local on-device AI agent framework, nothing to do with UI. |
| Kombai | An AI design-to-code extension, not a component source. |

**Useful patterns found in real health apps** (MacroFactor, WHOOP, Happy Scale,
Duolingo, Apple Fitness), not yet implemented:

- MacroFactor renders raw weight pale and the *smoothed trend* as the hero,
  because a trend number does not flinch on a bad morning. Helia does the
  opposite: the ring and "Since last" both show raw values while the 7-day mean
  goes only to the chart.
- Duolingo's streak freeze and 3-day repair window; its single bar across a
  perfect week rather than seven decorated days.
- Happy Scale's intermediate milestones, so the ring completes and resets
  instead of barely moving for months.
- Apple Fitness attaches a reply to a specific event and lets you hide your
  progress from a given friend.

---

## Tried and rejected

- **liquid-glass-js** — builds DOM imperatively and samples the page with
  `html2canvas`. Cannot wrap React children; rasterising a figure-dense page on
  a phone would be slow.
- **liquid-logo** — a demo app, not a package.
- **SQLite on a volume** — worked, but tied hosting to a persistent disk.
- **Deriving the calorie target from height/weight** — see Load-bearing
  decisions.
- **Manual portion / broth-left / read-off-a-label toggles** — asked the user to
  do arithmetic the estimator infers from their own description. Removed along
  with their columns (`20260804010000_drop_manual_adjustments`).
- **The typed backfill box** — replaced by the calendar. Typing weigh-ins meant
  learning a date format; tapping a day means the date is the thing you touch.
- **A "what can I eat?" suggestion engine** — built, then removed as the least
  proven feature and the most machinery. In the commit history if wanted back.

---

## Open items

**Needs the owner to act:**

- **The username/password migration is applied but not deployed.**
  `20260810200000_usernames_and_passwords` ran against production on
  2026-08-10; all seven accounts are sitting at `setupComplete = false` with a
  null username. This is deliberately invisible to the live Aug-6 build, which
  knows none of those columns — but the moment the new code deploys, **every
  tester lands on `/setup` at their next visit** and has to pick a username and
  a password. Their existing PIN still gets them in. Tell them before deploying,
  not after.
- **Retire the legacy handle login once they are all through.** `loginAction`
  falls back to `handle` lookup, and `usernameTaken()` has to check `handle` as
  well to keep that unambiguous. Both simplify away when
  `SELECT count(*) FROM "User" WHERE username IS NULL` reaches zero.
- **Deploy.** As of 2026-08-10 production is still serving the Aug-6 build.
  `npx vercel deploy --prod` failed with *"Not authorized"* even though the same
  token reads fine (`whoami`, `project ls`, `project inspect` all work) and the
  project id in `.vercel/project.json` matches the real project under
  `vthecookie-6604's projects`. Try `npx vercel login` first. Everything from
  2026-08-10 is committed and pushed but **not live**.
- **One lost message.** "Nice work today 👏", sent 5:39am ET Aug 6, direction
  unknown. Will be restored once the owner says who sent it.

**Known and deliberate:**

- **Signup is open on purpose.** Every account is invited — the testers are
  testers, not strangers who wandered in, and new ones appear mid-session. Do not "fix" this by
  setting `ALLOW_SIGNUP=false` without asking; it is a choice, not an
  oversight. The flag exists for when testing ends.
- Supabase is in **us-west-1** while the owner is US East — ~70ms of avoidable
  latency per request. Cheap to fix while the database is small.
- Vercel is **not Git-connected**; deploys are `npx vercel deploy --prod`.
  Pushing to GitHub does not deploy — but it *is* what feeds the reminder
  workflow, so the two now have to stay in step. The sweep first ran on
  2026-08-06 after 15 commits were pushed and `APP_URL` / `CRON_SECRET` were
  set; before that `.github/workflows/` did not exist on GitHub at all and the
  only thing firing was the daily Vercel backstop.
- The steps-driven dynamic calorie bar is **deferred, not dropped**.

*(The three verified bugs listed here — the gated water-retention banner, the
rust arrow on a friend's gain, and the week strip spending `--trace` — were
fixed on 2026-08-10. The reasoning moved into Load-bearing decisions and the
Design system.)*

---

## Keeping this document alive

Add to it when you learn something the next session would otherwise rediscover
the hard way. Specifically:

1. **A decision that cost something to reach** → *Load-bearing decisions*, with
   the reason, not just the rule. A rule without its reason gets reverted.
2. **A dead end** → *Tried and rejected*, so nobody spends the afternoon again.
3. **A surprise from a library, browser or platform** → *Gotchas*.
4. **A mistake with consequences** → wherever it will be read *before* the same
   move is made. The database section exists because of a real incident.
5. **Something the owner said they want or do not want** → *Who it is for*.

**Check that an edit landed.** Three of today's notes were written by a script
whose anchor text had already been changed earlier in the same session, so the
replacement silently did nothing and the lesson was lost until a grep went
looking for it. Assert the anchor exists, or read the section back.

Prune as well as add. A stale line is worse than a missing one — the portion and
broth adjustments were described as current in this file for two days after
their columns were dropped. When behaviour changes, fix the description in the
same commit.
