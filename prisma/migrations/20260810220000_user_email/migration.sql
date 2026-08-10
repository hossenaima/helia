-- An address for announcements, entered by the account holder in Settings.
--
-- Additive, so the build currently in production — which knows nothing of this
-- column — keeps working while it sits applied ahead of the deploy.
--
-- Nullable with no default and no backfill: nobody has consented to email yet,
-- and a column that starts empty is the only honest way to say so.

ALTER TABLE "User" ADD COLUMN "email" TEXT;
