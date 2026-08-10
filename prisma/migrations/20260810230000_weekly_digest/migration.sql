-- The Monday digest: an opt-in weekly summary, and the guard that keeps an
-- at-least-once sweep from sending it twice.
--
-- Additive, so the build in production keeps working while this sits applied
-- ahead of the deploy.
--
-- `notifyDigest` defaults false and is NOT backfilled from `email`. Agreeing to
-- hear about new features is not agreeing to receive weekly statistics about
-- your own body, and a backfill would treat the first as consent for the
-- second. Everyone opts in from Settings.

ALTER TABLE "User" ADD COLUMN "notifyDigest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lastDigestOn" TEXT;
