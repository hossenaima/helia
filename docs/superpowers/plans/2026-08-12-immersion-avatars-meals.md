# Zoom Lock, Chat Immersion, Avatars, Meal Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four owner-approved features: pinch-zoom disabled, a truly full-screen chat with a bottom-fixed composer, circle-cropped profile pictures stored on the User row, and rename/add-item editing for logged meals.

**Architecture:** All four ride existing structures. Zoom is one viewport field. Chat immersion is a pathname check in `Nav` plus repositioning the existing composer. Avatars are one nullable column, one validated server action, one hand-rolled crop component, and an `Avatar` display atom. Meal editing is two scoped server actions and an expansion of the existing meal-card edit panel.

**Tech Stack:** Next.js 16 App Router, Prisma 7 on Supabase Postgres (PRODUCTION), Tailwind v4 house tokens, canvas/pointer APIs — **no new dependencies**.

## Global Constraints

- **`DATABASE_URL` is production. No local database.** `npm run build` runs `prisma migrate deploy && next build` — creating a migration file and building APPLIES it. The avatar migration is deliberately additive, so this is safe; create no other migration.
- Deploy IS authorized this time — but only in Task 6, after verification passes.
- Every commit must build (`npm run build`); restart any running `next start` after a build.
- `"use server"` files export only async functions. Client components must not import `server-only` modules. Component CSS in `@layer components`; colour reserved for data; `.eyebrow` stays 600.
- A typed number is `exact`; `--trace` means weight and nothing else.
- User-visible changes get `UNANNOUNCED.md` lines in the shipping commit (Task 6).
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_017wUsR4haeBPnoxjSf3B6RR`

---

### Task 1: Zoom lock

**Files:**
- Modify: `src/app/layout.tsx:31-36` (the `viewport` export)

**Interfaces:** none produced; standalone.

- [ ] **Step 1:** Extend the existing export:

```ts
export const viewport: Viewport = {
  themeColor: "#f7f9f9",
  // Without this, `env(safe-area-inset-*)` resolves to 0 on iPhone and the
  // bottom bar sits under the home indicator.
  viewportFit: "cover",
  // Pinch-zoom off, owner's call (2026-08-12): this is an invited six-person
  // app that should feel installed, and stray zooms broke that. The
  // accessibility cost was weighed. Both properties, because iOS honours
  // maximum-scale more reliably than user-scalable.
  maximumScale: 1,
  userScalable: false,
};
```

- [ ] **Step 2:** `npm run build` — expect success.
- [ ] **Step 3:** Commit: `feat: lock pinch-zoom for the installed-app feel`.

---

### Task 2: Chat immersion — hidden tab bar, bottom-fixed composer, Clear in header

**Files:**
- Modify: `src/components/nav.tsx` (early return on conversation routes)
- Modify: `src/components/chat.tsx` (composer becomes fixed; Clear button/dialog extracted to a named export used by the page header)
- Modify: `src/app/(app)/friends/[id]/page.tsx` (header row gains `ClearChat`)

**Interfaces:**
- Produces: `ClearChat({ friendId, friendName }: { friendId: string; friendName: string })` — client component exported from `src/components/chat.tsx`, rendered by the chat page's header.

- [ ] **Step 1: `nav.tsx`.** After the existing hooks (all hooks must still run — the early return goes AFTER `useOptimistic`), add:

```tsx
  // A conversation is full-screen: the composer owns the bottom edge and the
  // back link is the exit, like every messenger. Only /friends/<id> — the
  // Friends list itself keeps its tabs.
  if (/^\/friends\/.+/.test(pathname)) return null;
```

- [ ] **Step 2: `chat.tsx`.** Three changes:
  1. The composer `<form>` swaps `sticky bottom-[calc(6.75rem+env(safe-area-inset-bottom))] mt-5` for a fixed, glass-treated bottom bar. The form becomes:

```tsx
      <form
        action={sendAction}
        className="glass fixed inset-x-0 bottom-0 z-20 !rounded-none px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto max-w-2xl">
          {/* hidden friendId input, chips row, input+send row — unchanged, moved inside this wrapper */}
        </div>
      </form>
```

  (The chips `<div>` and the input row keep their existing classes; the `card` class on the input row is dropped — the glass bar is the surface now: use `mt-2 flex gap-2` on that row.)
  2. The messages `<ul>` gets bottom clearance so the newest message clears the fixed bar: change `className="mt-5 space-y-2"` to `className="mt-5 space-y-2 pb-36"`.
  3. The Clear button + dialog move out of `Chat` into a new named export in the same file (state and handlers move with them; `Chat` loses `clearRef` and the bottom button):

```tsx
export function ClearChat({
  friendId,
  friendName,
}: {
  friendId: string;
  friendName: string;
}) {
  const clearRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => clearRef.current?.showModal()}
        className="eyebrow shrink-0 transition-colors hover:!text-up"
      >
        Clear
      </button>

      <dialog ref={clearRef} className="confirm" aria-labelledby="clear-chat">
        <p id="clear-chat" className="font-bold">
          Clear this chat?
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Everything so far disappears from your view only — {friendName} keeps
          their copy. New messages still arrive here.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <form method="dialog" className="contents">
            <button type="submit" className="btn btn-quiet !py-2">
              Cancel
            </button>
          </form>
          <form
            action={async () => {
              await clearChatAction(friendId);
              clearRef.current?.close();
            }}
            className="contents"
          >
            <button type="submit" className="btn btn-primary !rounded-full !py-2">
              Clear
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 3: `page.tsx`.** Replace the invisible balancing spacer in the header row with `<ClearChat friendId={friend.id} friendName={friend.name} />` (import it alongside `Chat`). The header row stays `flex items-baseline justify-between gap-3`.
- [ ] **Step 4:** `npm run build` — expect success.
- [ ] **Step 5:** Commit: `feat: full-screen chat — composer owns the bottom edge, tabs step aside`.

---

### Task 3: Avatar column, action, and data plumbing

**Files:**
- Modify: `prisma/schema.prisma` (User model)
- Create: `prisma/migrations/20260812210000_avatar/migration.sql`
- Modify: `src/app/actions/settings.ts` (add `setAvatarAction`; read the file first and follow its existing result-type conventions)
- Modify: `src/lib/friends.ts` (`FRIEND_FIELDS`, `FriendSummary`, mapping)
- Modify: `src/app/(app)/friends/[id]/page.tsx` (select `avatar` for the friend; pass to the header — rendering happens in Task 4)

**Interfaces:**
- Produces: `User.avatar: string | null`; `setAvatarAction(dataUrl: string | null): Promise<{ ok: boolean; error?: string }>`; `FriendSummary.avatar: string | null`.

- [ ] **Step 1: schema.** In `model User`, next to the identity fields, add:

```prisma
  /// Profile picture: a small square JPEG as a data URL (~15KB, 256px,
  /// circle-cropped in the browser). On the row rather than in a bucket —
  /// account deletion wipes it for free and there is no URL to sign or
  /// revoke. Validated strictly on write; it is re-rendered as an <img src>.
  avatar String?
```

- [ ] **Step 2: migration** `prisma/migrations/20260812210000_avatar/migration.sql`:

```sql
-- Additive: the live build never selects columns it does not know.
ALTER TABLE "User" ADD COLUMN "avatar" TEXT;
```

- [ ] **Step 3: action** in `src/app/actions/settings.ts` (match the file's existing return-shape conventions; if it has a shared result type, use it):

```ts
/** The one write path for a profile picture. Strict about what it accepts,
 *  because the value is re-rendered as an <img src> for other people:
 *  JPEG data URL only, hard length cap, or null to remove. */
export async function setAvatarAction(
  dataUrl: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();

  if (dataUrl !== null) {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
      return { ok: false, error: "That does not look like a photo." };
    }
    if (dataUrl.length > 100_000) {
      return { ok: false, error: "That photo is too large." };
    }
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { avatar: dataUrl },
  });

  revalidatePath("/settings");
  revalidatePath("/friends");
  return { ok: true };
}
```

- [ ] **Step 4: plumbing.** `FRIEND_FIELDS` gains `avatar: true`; `FriendSummary` gains `avatar: string | null` (doc comment: `/** Their profile picture, if they set one. */`); the return mapping adds `avatar: other.avatar`. In the chat page, both `requester`/`addressee` selects gain `avatar: true`.
- [ ] **Step 5:** `npx prisma generate` (the build does NOT regenerate the client), then `npm run build` (applies the migration — additive, safe), then `npx prisma migrate status` → up to date.
- [ ] **Step 6:** Commit: `feat: avatar column, validated write path, friend plumbing`.

---

### Task 4: Avatar UI — display atom, crop editor, placements

**Files:**
- Create: `src/components/avatar.tsx`
- Create: `src/components/avatar-editor.tsx`
- Modify: `src/app/(app)/settings/page.tsx` (new "Profile picture" section, placed just above the Account section; pass `user.avatar` and `user.name`)
- Modify: `src/components/friends-panel.tsx` (Avatar in the card's `<summary>` beside the name — an `<img>` is non-interactive, so it is legal there)
- Modify: `src/app/(app)/friends/[id]/page.tsx` (Avatar beside the name in the chat header)

**Interfaces:**
- Consumes: `setAvatarAction` (Task 3), `FriendSummary.avatar` (Task 3).
- Produces: `Avatar({ src, name, size }: { src: string | null; name: string; size: number })` — server-safe display atom; `AvatarEditor({ current, name }: { current: string | null; name: string })` — client, Settings-only.

- [ ] **Step 1: `avatar.tsx`** (no `"use client"` — it is render-only):

```tsx
/** A face or a letter. The fallback is the first letter of the name in a
 *  muted circle — quiet, and it keeps every list the same shape whether or
 *  not anyone uploaded a photo. */
export function Avatar({
  src,
  name,
  size,
}: {
  src: string | null;
  name: string;
  size: number;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data URL; next/image buys nothing
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-sunk font-bold text-ink-muted"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
```

- [ ] **Step 2: `avatar-editor.tsx`.** Client component, the whole crop flow. Requirements (implement precisely; ~150 lines):
  - A "Profile picture" card showing the current `Avatar` (size 56) + copy, a file input (`accept="image/*"`, **no `capture`** — the phone must offer both camera and library), and a **Remove** button (calls `setAvatarAction(null)`, only rendered when `current` is set).
  - Choosing a file opens the crop stage in place of the preview: a square stage (`aspect-square w-full max-w-64 overflow-hidden rounded-full bg-surface-sunk relative touch-none select-none mx-auto`) containing the image decoded via `createImageBitmap(file, { imageOrientation: "from-image" })` drawn into a `<canvas>` that fills the stage. State: `zoom` (1–3, range slider below the stage) and `offset {x,y}` (pointer drag: `onPointerDown` sets capture via `e.currentTarget.setPointerCapture(e.pointerId)`, move deltas update offset, up releases). Clamp offset so the image always covers the circle: the drawn image's scaled size is `cover-fit × zoom`; `|offset| ≤ (scaledSize − stageSize) / 2` per axis.
  - Draw loop: on any state change, redraw the stage canvas — `ctx.drawImage(bitmap, stageW/2 − drawW/2 + x, stageH/2 − drawH/2 + y, drawW, drawH)` where `drawW/drawH` are the cover-fit dimensions times zoom. The stage being `rounded-full overflow-hidden` IS the circular mask — what you see is what you get.
  - **Save**: render the same transform into an offscreen 256×256 canvas (scale factor `256 / stageSize`), `toDataURL("image/jpeg", 0.8)`, `await setAvatarAction(dataUrl)`; on `ok`, exit crop mode (`router.refresh()` or rely on revalidate). Surface `error` in a `role="status"` line. **Cancel** discards and closes the bitmap (`bitmap.close()`).
  - Buttons use `.btn btn-primary` / `.btn-quiet`; the slider is a plain `<input type="range" min="1" max="3" step="0.01">` with an `aria-label="Zoom"`.
- [ ] **Step 3: placements.**
  - Settings page, above the Account section:

```tsx
      <section className="mt-10">
        <h2 className="eyebrow">Profile picture</h2>
        <AvatarEditor current={user.avatar} name={user.name} />
      </section>
```

  - Friend card `<summary>`: `<Avatar src={friend.avatar} name={friend.name} size={32} />` as the first child, and the name keeps `min-w-0 flex-1 truncate font-bold`. The summary row's `items-baseline` becomes `items-center` (a circle cannot sit on a text baseline).
  - Chat header: `<Avatar src={friend.avatar} name={friend.name} size={28} />` beside the name — wrap name+avatar in a `flex items-center justify-center gap-2 min-w-0 flex-1` container so the row still centres.
- [ ] **Step 4:** `npm run build` — expect success.
- [ ] **Step 5:** Commit: `feat: profile pictures — crop in the browser, a letter when there is none`.

---

### Task 5: Meal rename + add item

**Files:**
- Modify: `src/app/actions/meals.ts` (two new actions; read the file first — mirror the revalidation set and ownership-check style of `updateMealItemsAction`/`deleteMealAction`)
- Modify: `src/components/meal-card.tsx`

**Interfaces:**
- Produces: `renameMealAction({ mealId, name }: { mealId: string; name: string }): Promise<MealActionResult-like>`; `addMealItemAction({ mealId, name, calories }: { mealId: string; name: string; calories: number }): Promise<same>`.

- [ ] **Step 1: actions.** Following the file's existing conventions:

```ts
/** A rename is a label change and nothing else: the items, their calories
 *  and the ± band stay untouched, and the reuse list follows the new name.
 *  `note` is deliberately NOT touched — it is the verbatim text the
 *  estimate was based on, and rewriting history helps nobody. */
export async function renameMealAction(input: {
  mealId: string;
  name: string;
}) {
  const me = await requireUser();
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false as const, error: "Give it a name." };

  const { count } = await prisma.meal.updateMany({
    where: { id: input.mealId, userId: me.id },
    data: { name },
  });
  if (count === 0) return { ok: false as const, error: "No such meal." };

  revalidatePath("/meals");
  return { ok: true as const };
}

/** A typed addition to a logged meal: name + calories, exact because it was
 *  typed (the house rule), macros blank like every hand-typed item. */
export async function addMealItemAction(input: {
  mealId: string;
  name: string;
  calories: number;
}) {
  const me = await requireUser();
  const name = input.name.trim().slice(0, 80);
  const calories = Math.round(input.calories);
  if (!name) return { ok: false as const, error: "What was it?" };
  if (!Number.isFinite(calories) || calories < 0 || calories > 5000) {
    return { ok: false as const, error: "Calories look off." };
  }

  // Ownership first: the create is not scoped by userId, the check is.
  const meal = await prisma.meal.findFirst({
    where: { id: input.mealId, userId: me.id },
    select: { id: true },
  });
  if (!meal) return { ok: false as const, error: "No such meal." };

  await prisma.mealItem.create({
    data: {
      mealId: meal.id,
      name,
      calories,
      source: "manual",
      precision: "exact",
    },
  });

  revalidatePath("/meals");
  return { ok: true as const };
}
```

  (If `deleteMealAction`/`updateMealItemsAction` also revalidate `/` or `/calendar`, mirror their exact set in both actions.)
- [ ] **Step 2: meal-card.** Three UI changes, matching the card's existing editing idiom (`useTransition`, draft state, `bg-surface-sunk` inputs):
  1. **The expanded panel opens for every meal.** Change the gate `{open && showItems && (` to `{open && (` — `showItems` now gates only the items `<ul>` and its intro copy inside the panel; the Edit button and everything below render regardless, so a hand-typed meal can be renamed and extended.
  2. **Rename lives in editing mode.** At the top of the editing branch, before the scale chips, a name input seeded from `meal.name` (`nameDraft` state); `save()` calls `renameMealAction({ mealId, name: nameDraft })` when `nameDraft.trim() !== meal.name`, alongside the existing `updateMealItemsAction` call.
  3. **"Add an item" row** at the bottom of the editing branch, above the New-total line: two inputs (`addName` text, `addCalories` numeric, same styling as the calorie inputs) and the drafted addition is submitted in `save()` via `addMealItemAction` when `addName.trim()` is non-empty. After a successful save, clear `addName`/`addCalories`. The draft total line includes the pending addition: `draftTotal + (Number(addCalories) || 0)`.
- [ ] **Step 3:** `npm run build` — expect success.
- [ ] **Step 4:** Commit: `feat: rename a logged meal and add what the estimate missed`.

---

### Task 6: Verification, docs, deploy

**Files:**
- Create: scratchpad `verify-four.mjs` (puppeteer-core, NOT committed)
- Modify: `UNANNOUNCED.md`, `NOTES.md`
- Deploy: production, then post-deploy smoke

Read NOTES.md "Verifying work" and "Working on this database safely" first. puppeteer-core lives in `node_modules` but not `package.json` — if missing, `npm install --save-dev puppeteer-core` and REVERT `package.json`/`package-lock.json` before committing.

- [ ] **Step 1: local verification.** `npm run build`, `npx next start -p 3111`, then a script with two test accounts (`ui test one`/`ui test two`, signup → friend → both directions), asserting:
  1. `document.querySelector('meta[name="viewport"]').content` contains `maximum-scale=1` and `user-scalable=no`.
  2. `nav[aria-label="Sections"]` present on `/friends`, **absent** on `/friends/<id>`.
  3. The composer form's `getBoundingClientRect().bottom` equals `window.innerHeight` (±1) in the chat, and the last message's rect bottom is above the composer's top after auto-scroll.
  4. Avatar flow: on `ui test one`'s Settings, upload `public/icon-192.png` via the file input (`input.uploadFile`), drag the stage 20px, move the zoom slider, Save; assert Settings then shows an `<img>` avatar. As `ui test two`, assert the friend card and the chat header both render an `<img>` (not the letter fallback) for `ui test one`. SQL (read-only, scoped): the avatar column for the test id starts with `data:image/jpeg;base64,` and is under 100,000 chars.
  5. Meals: as `ui test one`, log a manual meal "toast 300" via the meals form; open its card, Edit, rename to "breakfast toast", add item "butter" 100; assert the card shows "breakfast toast" and 400 kcal total.
  6. Delete both accounts via Settings; SQL-confirm zero rows (User, Message, Friendship) for their ids.
- [ ] **Step 2: fix what fails**, rebuild + restart between builds, re-run until green.
- [ ] **Step 3: docs.**
  - `UNANNOUNCED.md`, under a new *As of 2026-08-12 (evening). Deployed and live.* header:

```markdown
- **Chats feel like chats now.** Inside a conversation the message box sits
  at the bottom of the screen where your thumb is, the tab bar steps out of
  the way, and Clear moved up top. The whole screen is the conversation.
- **Profile pictures.** Settings → Profile picture: pick a photo, drag and
  zoom it inside the circle, save. Your friends see it on your card and in
  your chats. No photo, no problem — your initial stands in. Remove it any
  time; deleting your account deletes it too.
- **Fix a logged meal.** Open a meal, hit Edit: you can now rename it and
  add anything the estimate missed — "butter, 100" — typed numbers count as
  exact. Renaming never touches the calories you already corrected.
- **The app no longer pinch-zooms.** It behaves like an installed app
  rather than a web page.
```

  - `NOTES.md`: state-of-play sentence; under Load-bearing decisions add a short **Immersion & avatars** subsection recording: zoom lock is the owner's accessibility call, stated; the tab bar hides only inside a conversation and why (`Nav` pathname test, the composer owns the bottom edge); avatars live on the User row as strictly-validated JPEG data URLs (the reasoning, and the ~15KB size); the crop is drag+slider, no pinch, no dependency; meal rename is label-only with `note` preserved as the estimate's record; added items are `manual`/`exact`. Grep-confirm anchors landed.
- [ ] **Step 4: commit** docs + code together if any fixes were needed: `feat: immersion, avatars, meal editing — docs`.
- [ ] **Step 5: merge & deploy** (authorized): merge the working branch to `main` (ff), `npx vercel deploy --prod --yes`, then the post-deploy smoke: signup a throwaway on the production URL, check all five tabs 200 + chat screen hides the nav + viewport meta, delete the account via Settings. Update UNANNOUNCED wording if needed (it already says Deployed and live), commit, `git push origin main`.

---

### NOT in this plan

- The `Encouragement` DROP (still pending from the chat release — a later release).
- The announcement email (owner triggers it).
