# Chat — design

Replaces the one-shot Encouragement notes with a per-friend conversation.
Decided with the owner on 2026-08-12.

## Decisions

- **1:1 only.** No group chats, ever, per the owner. The `Friendship` row *is*
  the conversation.
- **Clear is one-sided.** "Clear chat" hides everything so far from your view
  only; the friend keeps theirs. Unfriending is the only thing that destroys a
  conversation for both sides. There is no per-message delete.
- **Retention: 90 days.** Auto-pruned by the existing hourly cron. "A month of
  scrollback" stays true even for a five-week-old message.
- **Chat is a full screen per friend**, `/friends/[id]`, opened from the friend
  card. Not an in-card expansion.
- **Existing notes migrate in** with their original timestamps.
- **No deploy until the owner has verified locally.** The additive migration
  may run against production (invisible to the live build); the
  `Encouragement` drop happens only after the new build is live.

## Data model

```prisma
model Message {
  id           String     @id @default(cuid())
  friendshipId String
  friendship   Friendship @relation(fields: [friendshipId], references: [id], onDelete: Cascade)
  senderId     String     // one end of the friendship; the reader is the other
  body         String     // capped at 500 chars in the action
  readAt       DateTime?
  createdAt    DateTime   @default(now())

  @@index([friendshipId, createdAt])
}
```

`Friendship` gains `requesterClearedAt DateTime?` / `addresseeClearedAt
DateTime?` — the meal-sharing two-sided-column pattern. Your view of a chat is
`createdAt > yourClearedAt`. `senderId` is a plain string, not a User FK:
account deletion already cascades through `Friendship`, and the sender's name
is always one of the two friendship ends.

`Message` joins the `verify-delete` zero-count check.

## Server actions (`src/app/actions/chat.ts`)

- `sendMessageAction` — verify accepted friendship (as `sendEncouragementAction`
  does), create the message, push, revalidate. Trim, 1–500 chars.
- `markChatReadAction` — `readAt = now()` on this friendship's messages not
  sent by me; scoped so only a member can mark.
- `clearChatAction` — two scoped `updateMany`s writing `now()` into whichever
  cleared column is mine (the `setMealSharingAction` pattern; forged IDs match
  no row).

`sendEncouragementAction` and `markEncouragementsReadAction` are deleted.
`quickNotes(changeLbs)` moves to the chat composer.

## Screens

- **`/friends/[id]`** (friend's user id): server component resolves the
  friendship or redirects to `/friends`; loads the last 200 visible messages
  ascending; bubbles mine-right/theirs-left with times on a sub-line; `--trace`
  stays reserved for weight. Composer pinned at the bottom: input + quick
  chips + send. `loading.tsx` so the tap prefetches. On open, a client effect
  calls `markChatReadAction`; while visible, `router.refresh()` every ~12 s.
  Header: name, back, and Clear chat behind a native `<dialog>` confirm.
- **Friends page**: the `Encouragements` stack dies. Friend card header shows
  the last message's one-line preview + unread count and links to the chat.
  The card's note box moves into the chat screen — one place to type, where
  you can see what you are replying to.
- **Tab badge**: layout swaps `encouragement.count` for unread messages to me
  (member = me, `senderId != me`, `readAt null`, past my `clearedAt`), still
  added to pending requests.

## Notifications

Same `notifyFriendActivity`: title `"{name} says"`, body the text,
`url: /friends/{senderId}`. Tagged `chat-{friendshipId}` so a burst collapses
to the newest banner — deliberate reversal of the notes' untagged choice,
right for a chat, wrong for one-shot notes.

## Retention, cron, digest

Hourly cron swaps the note purge for
`message.deleteMany({ createdAt: { lt: now − 90d } })`. The digest's "notes
friends sent you" section reads last week's received messages instead (same
5-item cap). `NOTE_TTL_HOURS`, `noteCutoff`, and the countdown UI go.

## Migration and deploy order (the `shareMeals` lesson)

1. **Migration 1 (additive):** create `Message`, add cleared columns, copy
   every current `Encouragement` row in (`fromId` → `senderId`, joined to its
   friendship either direction, keeping `createdAt`/`readAt`; orphans skipped).
   Safe to run while the old build is live.
2. **Deploy** — only when the owner says so.
3. **Migration 2, only after the deploy is confirmed live:** drop
   `Encouragement`. Earlier would break the live build's layout badge and
   digest on every signed-in load.

`UNANNOUNCED.md` gets its line in the shipping commit.

## Verification

Two puppeteer contexts, two test accounts, against `next start` at 390×844:
send both ways; bubbles on correct sides; unread badge counts and clears on
open; clear-chat hides only the clearer's view (checked from both contexts and
by SQL — rows must still exist); push fires with the collapsing tag; migrated
notes appear in the right chat with original timestamps. Test accounts are
cleaned up afterwards; every scripted write is scoped to them.
