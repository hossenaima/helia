-- Daily tracking mode: no goal UI, no up/down verdicts — just the log.
-- Entered automatically when the goal celebration is acknowledged, or by the
-- toggle on the Weight tab. Additive only: the phase/ramp columns this mode
-- replaces are dropped in a later release, per the two-release rule.
ALTER TABLE "User" ADD COLUMN "trackingOnly" BOOLEAN NOT NULL DEFAULT false;

-- An account already in a post-cut phase (reverse or maintain) chose life
-- after the goal; phases are being removed and daily tracking is their
-- successor, so the choice is carried across — never widened: accounts with
-- no phase stay in goal mode exactly as they were.
UPDATE "User" SET "trackingOnly" = true WHERE "phase" IS NOT NULL;
