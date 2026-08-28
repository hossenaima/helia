# Daily tracking mode, progressive rainbow ring, phases removed

**Date:** 2026-08-28
**Status:** Approved by owner in conversation; awaiting implementation plan.

## What this is

Three connected simplifications to the Weight tab, replacing the phases
release of 2026-08-25 before it was ever announced:

1. The goal ring becomes a **progressively filling rainbow** instead of a
   color-warming stroke with per-quarter hues.
2. **Reverse dieting and maintenance are removed entirely** — code, UI, and
   the ramp step in the hourly sweep.
3. A new **daily tracking mode** (no goal, no up/down verdicts), entered
   automatically at goal or manually via a toggle on the Weight tab.

Celebrations change shape too: quarter milestones become a **dismissable
pop-up with confetti** instead of an in-flow card with a color-warmed
headline.

## 1. Data and modes

- New column: `User.trackingOnly Boolean @default(false)`.
  - Chosen over deriving the mode from a blank `goalWeightLbs`: auto-switching
    at goal must not erase the goal number, and the rainbow trophy needs the
    "goal reached" memory that `milestonePct === 100` already provides.
- **Auto at goal:** acknowledging the 100% celebration sets
  `trackingOnly = true`.
- **Toggle on the Weight tab** writes the same boolean, both directions.
- **Setting a new goal weight** in Settings sets `trackingOnly = false` and
  resets `milestonePct` (the reset already exists and only fires on a real
  change — re-saving an unchanged form must not replay anything).
- `goalWeightLbs`, `calorieTarget` are never modified by any of this.

## 2. The ring

- The color-warming stroke (`--trace` → `--reward`) goes.
- The ring is the existing conic-gradient rainbow (already built for the goal
  state: a conic-gradient div masked to the ring band, because a conic
  gradient cannot be an SVG stroke), now revealed progressively: an
  additional conic mask shows only the progress fraction of the circle,
  from twelve o'clock.
- At 100% the full rainbow ring stays permanently — the trophy — including
  in daily tracking mode.
- A user who enables tracking mode **before** ever reaching a goal has no
  ring: no goal, nothing to fill.
- This continues the deliberate bend of "colour is reserved for data" that
  the rainbow already made; the CSS comment at `--reward` should be updated
  to describe the new mechanism.

## 3. Daily tracking mode — what shows, what hides

While `trackingOnly` is on, the Weight tab keeps: today's weigh-in form, the
log, the streak, the chart, the calendar, freezes.

Hidden:

- The ring (unless the full-rainbow trophy was earned — `milestonePct === 100`).
- "X to go" and the goal-date projection.
- The goal line on the chart (and its text fallback).
- `--down` / `--up` coloring on the user's own deltas — changes render in
  muted ink, a number without a verdict.

Untouched: meals, friends, digest, reminders, streak rules. Friend cards
already never score direction, so nothing changes there.

## 4. Phases removed

Deleted outright:

- Settings → Phase section.
- The "Start reverse dieting" button on the goal celebration.
- `src/lib/phase.ts` and `scripts/check-phase.mts`.
- The ramp-advance step inside the hourly reminders sweep
  (`api/cron/reminders`). The sweep's reminder and digest work is untouched.
- The ±1 lb neutral band around `phaseAnchorLbs` (daily tracking mode is the
  simpler answer to the same need).

`calorieTarget` keeps whatever value it has — the ramp just stops writing it.

**Data, per the two-release rule:** this release only stops *reading* the
phase columns (`phase`, `phaseAnchorLbs`, and the ramp fields — enumerate
the exact set from `prisma/schema.prisma` at implementation). They join
`Encouragement` and `milestoneLbs` on the awaiting-DROP list in NOTES.md,
dropped in a later release once this deploy is confirmed live. Before
deploying, check production for any account actually mid-reverse-phase
(NOTES says the owner never started; verify nobody else did).

The only migration in this release **adds one column** (`trackingOnly`) and
drops nothing — safe against the old build.

## 5. Celebrations

- Quarter confetti stays at 25/50/75/100 — same trigger, same monotonic
  `milestonePct` memory, same reset-on-new-goal.
- The in-flow celebration card and its color-warmed headline are replaced by
  a **dismissable pop-up**: a native `<dialog>` via `showModal()` — the same
  machinery as the friend-removal confirm, which buys top-layer stacking,
  Escape-to-close, focus handling, and a backdrop for free. `.confirm`-style
  rules live in `@layer components`, with the `::backdrop` named explicitly.
- Confetti (the existing hand-rolled canvas, skipped under reduced motion)
  fires with the pop-up.
- Content: a short congrats naming the quarter — "Halfway there" scale, no
  paragraph — and a single dismiss. Dismissing advances `milestonePct`.
- The 100% pop-up congratulates on the goal, notes the switch to daily
  tracking, and the full rainbow ring is what remains after dismissal.
- **This reverses the recorded "not a modal" decision** for celebrations —
  the owner's explicit call (2026-08-28). NOTES.md must record the reversal
  so the old reasoning doesn't quietly resurrect it. The friend-removal
  dialog's reasoning ("stops you deleting something") is unaffected.

## 6. UNANNOUNCED.md

In the same commit that ships the change:

- Delete the "Reverse dieting, then maintenance" entry — never announced,
  and the feature no longer exists.
- Rewrite "Bigger celebrations, and a rainbow" to describe the filling
  rainbow ring and the pop-up celebrations.
- Add a line for the daily tracking toggle (and the auto-switch at goal).

## 7. Verification

Per the repo's rules — browser, not assertion:

- `puppeteer-core` driving system Chrome against `next start`, 390×844.
- Ring fill rendered at several progress values (0, ~40%, ~90%, 100%).
- The auto-switch at goal on a test account: celebrate, dismiss, confirm
  `trackingOnly` flipped and the tab re-rendered in tracking mode.
- The toggle both ways; plain mode hides ring/projection/goal line/red-green.
- Quarter confetti still fires, as a pop-up, and dismiss advances
  `milestonePct`.
- Direct SQL through `pg` to confirm column values — every scripted write
  scoped to a test account by `where`, per the database-safety rules.
- Reduced motion still skips confetti.

## Out of scope

- Dropping the phase columns, `milestoneLbs`, or `Encouragement` (a later
  release, after this deploy is confirmed live).
- Any change to meals, calorie targets, digest content, friends, streaks.
- The steps-driven calorie bar (still deferred).
