# Not yet told to users

Everything shipped since the last announcement email, so nothing quietly
arrives without anyone knowing it did.

**How to use this.** Add a line the moment a user-facing change ships — not
when it is planned, and not later from memory. When an announcement goes out,
move those lines into *Already announced* with the date and clear the top
section. A change nobody can see from the app is not a line here: greeting
people by name in an email, a refactor, or a fix to a bug no user ever hit
belong in `NOTES.md`, not in front of a tester.

Send with:

```
node scripts/announce.mjs "short title" "A few things changed:

- first
- second" --preview=$HOME/preview.html     # look at it
node scripts/announce.mjs "…" "…" --only=vthecookie@gmail.com --send   # to yourself
node scripts/announce.mjs "…" "…" --send                                # to everyone
```

---

## Waiting to be announced

- **A day report you can share.** Meals tab → *Day report* (top of the Log
  list): one page with the day&rsquo;s weigh-in and when you logged it, your
  calorie total against your target, macros, and every meal with its items and
  the estimator&rsquo;s working. Arrows step back through past days. The
  *Share* button at the top hands it to Messages or your clipboard as plain
  text — made for
  pasting into an AI (&ldquo;analyze my day&rdquo;) instead of screenshotting —
  and the share sheet&rsquo;s PDF option turns the page itself into a file you
  can keep.
- **See when you&rsquo;ll reach your goal.** On the Weight tab, under
  &ldquo;X to go&rdquo;, Helia now reads your recent trend and says roughly when
  you&rsquo;ll get there at the pace you&rsquo;ve been going —
  &ldquo;At about 0.7 lb/wk, on track for ~Oct 3.&rdquo; It waits until there are
  a couple of weeks of weigh-ins to mean it, smooths out the daily noise before
  judging the pace, and if the trend isn&rsquo;t heading toward your goal lately
  it says so plainly instead of inventing a date.
- **A gentle heads-up on very low targets.** A calorie target under ~1,200 a
  day, or a goal weight that&rsquo;s underweight for your height, now shows a
  quiet note suggesting a word with a professional first. It never blocks you —
  the number still saves; it just no longer passes without comment.
- **Plain about what a number is.** Meal estimates now say they&rsquo;re
  estimates, not measurements — adjust anything that looks off — and the daily
  targets note that they&rsquo;re general wellness targets, not medical advice.
- **The &ldquo;before you panic&rdquo; note now shows its working.** After an
  overnight jump it does the maths with your own numbers — &ldquo;you logged
  about 1,800 kcal yesterday; a pound of fat is roughly 3,500, so this is
  water, not fat&rdquo; — and it now spots a carb-heavy meal as a cause too, not
  just salt and fiber (a big plate of pasta or rice makes the body hold on to
  water). Nothing logged the day before? It still reassures on the
  physiology alone.

## Already announced

### 2026-08-12 — "Helia update: photo meals, chats, and profile pictures"

Sent to everyone reachable: email to Jerry and the owner (the only two
addresses on file), push to the owner, Jerry, fatboy and Matthew (6
devices). **Saleh and Nyan Lin Htet got nothing** — no email, no push —
and will find the features by opening the app.

Condensed to the five big features on the owner's instruction; zoom lock,
chat layout polish, the delete-× removal, the password-rule fix and
typed-calorie scaling were folded in or left out as rudimentary.

- Photograph your meal: photo → editable itemised estimate; words beat the
  picture; typed totals win; photo never stored
- Notes became chats: 90-day history, notifications, one-sided clear
- Profile pictures: crop in Settings, shown on friend cards, initial as
  fallback
- Edit a logged meal: rename, edit description, add missed rows (typed =
  exact)
- Streak corrections: only logged days count, one day of grace, freezes;
  "some streaks read lower — that is the correction, not a bug"
- Closing line: tabs faster with a soft fade

<details>
<summary>The retired per-date shipping lists, kept for the record</summary>

*As of 2026-08-12. Deployed and live.*

- **Switching tabs is 2–3× faster, and smoother.** The app's server moved
  next to its database, which cut the wait when opening a tab from roughly a
  third of a second to near-instant — and pages now fade gently into each
  other instead of flashing. (If you have Reduce Motion on, the app respects
  it and skips the animation.)

- **Edit a logged meal — name, description, and what got missed.** Open a
  meal's working and tap Edit: the name and the description you typed are
  both editable now, so a photo-read or hand-typed entry can be fixed
  without redoing it (changing the words never changes the calories — the
  items stand as they are). Below the items, tap *+ Add a row* for each
  thing the estimate left out — as many rows as you need, each just a name
  and its calories, counted as exact like any number you type by hand. The
  Edit button now shows for every meal, including the hand-typed ones that
  used to have nothing to expand into.
- **Notes are now chats.** Your notes to a friend land in a conversation —
  open it from their card on the Friends tab. You can scroll back through a
  message history instead of watching notes vanish after 12 hours; messages
  are kept for 90 days. Clear a chat any time from inside it — that clears
  your view only, and your friend keeps theirs. You still get a notification
  when a message arrives, and the little quick-note buttons still work — they
  just live in the chat now.
- **Chats feel like chats now.** Inside a conversation the message box sits
  at the bottom of the screen where your thumb is, the tab bar steps out of
  the way, and Clear moved up top. The whole screen is the conversation.
- **Profile pictures.** Settings → Profile picture: pick a photo, drag and
  zoom it inside the circle, save. Your friends see it on your card on the
  Friends tab. No photo, no problem — your initial stands in. Remove it any
  time; deleting your account deletes it too.
- **The app no longer pinch-zooms.** It behaves like an installed app
  rather than a web page.

*As of 2026-08-11. All deployed and live.*

- **Photograph your meal and Helia will read it.** On the Meals tab, tap **Take or choose a
  photo** — the button under "What you ate" — and press *Read the photo*. It comes back with each thing on the plate as its own line, the
  portion it judged, and how it judged it: "plate reads as ~27 cm; two sausages
  about 12 cm long, so 60 g each". Every line is editable, because a photo
  cannot show a portion exactly and the point is that you can see where a number
  came from and argue with it. Three things worth knowing: **your words beat the
  picture** — add "I left half of it" and it prices what you ate, not what was
  served; **a calorie total you type still wins**, with the photo estimate split
  to add up to it; and **the photo is not stored** — it is sent to the model to
  be identified and Helia keeps only the result.
- **Nothing to delete by accident.** The little × at the end of every row of the
  weight log is gone. A tester deleted a weigh-in with it by mistake, and the
  only way back is another trip to the scale. To remove or fix a day, tap it on
  the calendar and clear the box.
- **Freeze your streak while you are away.** Calendar → *Going away? Freeze your
  streak*, pick the days, and a missing weigh-in on a trip will not break your
  run. Frozen days hold your streak where it is rather than adding to it, and
  they have to be picked before you go — a freeze cannot cover a day already
  past. No morning reminder while you are frozen either.
- **Streaks count days you actually logged — with a day's grace.** Log this
  morning's weigh-in any time today or tomorrow and it counts. Fill in a day
  older than that and it is saved and charted as always, but it no longer adds
  to your streak: typing numbers into missed days was raising the count, and a
  streak you can type in is not a streak. Weigh-ins brought in from Apple Health
  still count. The calendar now tells you when a day you have tapped is past the
  cut-off. **Some streaks will read lower than they did**, which is the
  correction, not a bug.

*As of 2026-08-10. All deployed and live.*

- **Your email, and what it is used for.** Settings now has an Announcements
  section. Add an address to hear about new features; clear the box and they
  stop. Nothing about your weigh-ins or meals is ever in an announcement.
- **A weekly digest, if you want one.** Off by default, and a separate switch
  from the address above — agreeing to hear about features is not agreeing to
  weekly statistics about your own body. Turn it on and Monday morning brings
  your week: days logged, your 7-day trend, high and low, a bar per day of what
  you ate, and any notes friends sent you.
- **Passwords can have letters in them.** The Settings screen for changing your
  password was still enforcing the old 4–10 digit PIN rule, so it would have
  refused a real password and pushed you back to digits. Fixed.
- **Type the calories you already know.** If a packet or a menu tells you the
  total, type it in and press estimate: the breakdown still splits your meal
  into components you can edit, but the parts are scaled to add up to your
  number rather than to a guess. A number you typed is treated as exact, so it
  no longer shows a ± range.

</details>

### 2026-08-10 — "Helia update: usernames, passwords, and a delete button"

Sent to Jerry and to the owner. Not to the wider group: four testers had no
email on file, and two of them no push either.

- Sign in with a username instead of your name; old PIN still works until you
  pick a username and password once
- Delete your account, and everything in it, from Settings
- Every weigh-in shows the time you logged it
- The quick notes on a friend's card follow how their week has gone
