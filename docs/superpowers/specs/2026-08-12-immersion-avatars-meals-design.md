# Zoom lock, chat immersion, avatars, meal editing — design

Four features decided with the owner on 2026-08-12, approved for build AND
deploy in one pass.

## 1. Zoom lock

`userScalable: false, maximumScale: 1` on the root layout's `viewport`
export. **Accessibility tradeoff acknowledged and accepted by the owner**:
pinch-zoom is an assistive affordance, but this is a six-person invited app
that should feel like a native app. Both properties set — iOS respects
`maximum-scale` more reliably than `user-scalable`.

## 2. Chat immersion

- The tab bar hides on `/friends/<id>` (a conversation) and only there —
  `Nav` already reads the pathname; it returns null when the path matches.
  The Friends list keeps its tabs; back-link is the exit, like every
  messenger.
- The composer (quick chips + input + Send) becomes `fixed` at the very
  bottom, glass-treated like the tab bar it replaces, with safe-area
  padding. Messages scroll behind it with enough bottom clearance that the
  newest message is never hidden.
- **Clear chat moves to the chat header row** (back · avatar+name · Clear) —
  its old spot below the composer no longer exists. Same confirm dialog.

## 3. Profile pictures

- **Stored on the User row**, not a bucket: `User.avatar String?` holding a
  `data:image/jpeg;base64,` URL — square 256px, quality 0.8, ~15KB. Additive
  migration. Account deletion wipes it for free; no signed URLs, no new
  privacy surface. Same reasoning that kept meal photos unstored, inverted:
  here the crop IS the product and it is tiny.
- **Crop in the browser, no new dependency**: drag to position (pointer
  events), slider to zoom (1–3×), circular mask preview; Save renders
  through a 256×256 canvas with `imageOrientation: "from-image"` (the EXIF
  lesson) and posts the data URL. Slider-not-pinch keeps it ~150 lines.
- **Trust boundary**: `setAvatarAction` accepts null (remove) or a string
  that must match `^data:image/jpeg;base64,[A-Za-z0-9+/=]+$` and be
  ≤ 100,000 chars. It is re-rendered as an `<img src>`, so the prefix check
  is strict — no SVG, no arbitrary mime.
- **Shown**: friend cards, the chat header, Settings preview. Fallback is
  the first letter of the name in a muted circle. Not in chat bubbles, not
  the app header.

## 4. Meal editing

- **Rename is a label change only.** `renameMealAction(mealId, name)`
  updates `Meal.name`; items, calories, bands untouched; the reuse list
  (deduped by name) follows. `Meal.note` — the verbatim text the estimate
  was based on — is deliberately preserved as the historical record.
- **Add a component**: name + calories typed by hand →
  `addMealItemAction`, `source: "manual"`, `precision: "exact"` (a typed
  number is exact wherever it is typed), macros blank like every hand-typed
  item. Day totals and the digest recompute automatically because they sum
  items.
- The card's expanded panel opens for every meal now (it used to render
  only when there were listable items), so hand-typed meals can be renamed
  and extended too.

## Verification & rollout

Puppeteer against `next start`: viewport meta contains the zoom lock; tab
bar present on `/friends`, absent inside a conversation; composer's box
flush with the viewport bottom; avatar upload → crop → save → visible to
the OTHER account's friend card and chat header; rename + add-item
reflected in card and day total. Test accounts deleted via Settings.

Then: UNANNOUNCED.md lines, NOTES.md decisions, deploy to production
(avatar migration is additive — safe under the live build), post-deploy
smoke, push main. All authorized by the owner up front.
