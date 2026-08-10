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
