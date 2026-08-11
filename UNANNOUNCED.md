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

*As of 2026-08-11. All deployed and live.*

- **Photograph your meal and Helia will read it.** On the Meals tab, tap *+
  Photo of the meal* — take one or pick one from your library — and press *Read
  the photo*. It comes back with each thing on the plate as its own line, the
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

## Already announced

### 2026-08-10 — "Helia update: usernames, passwords, and a delete button"

Sent to Jerry and to the owner. Not to the wider group: four testers had no
email on file, and two of them no push either.

- Sign in with a username instead of your name; old PIN still works until you
  pick a username and password once
- Delete your account, and everything in it, from Settings
- Every weigh-in shows the time you logged it
- The quick notes on a friend's card follow how their week has gone
