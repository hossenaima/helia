<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Read NOTES.md first

[`NOTES.md`](./NOTES.md) is the handoff document for this repo: the reasoning
behind the code, the decisions that cost something to reach, and the mistakes
already made. Read it before changing anything non-trivial, and add to it when
you learn something the next session would otherwise rediscover the hard way.

Three things from it that are easy to get wrong and expensive to get wrong:

- **`DATABASE_URL` is production.** No local database, no point-in-time
  recovery. Every write from a script needs a `where` naming a test account —
  an unscoped `UPDATE` has already destroyed real user data once.
- **Verify in a browser, don't assert.** Drive Chrome with `puppeteer-core`
  against `next start`, and check the database directly. See *Verifying work*.
- **Deploys are manual.** `npx vercel deploy --prod` — the project is not
  Git-connected, so pushing does nothing.
- **A user-facing change gets a line in [`UNANNOUNCED.md`](./UNANNOUNCED.md)**,
  in the same commit that ships it. That file is what the next announcement
  email is written from; a change that never gets a line is a change the
  testers find by accident.
