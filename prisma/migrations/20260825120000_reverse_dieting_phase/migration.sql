-- Additive only: the live build never selects columns it does not know.
-- milestoneLbs stays for now, orphaned; its DROP waits for a later release.
ALTER TABLE "User" ADD COLUMN "milestonePct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "phase" TEXT;
ALTER TABLE "User" ADD COLUMN "rampEndKcal" INTEGER;
ALTER TABLE "User" ADD COLUMN "rampStepKcal" INTEGER;
ALTER TABLE "User" ADD COLUMN "rampIntervalDays" INTEGER;
ALTER TABLE "User" ADD COLUMN "rampLastStepOn" TEXT;
ALTER TABLE "User" ADD COLUMN "phaseAnchorLbs" DOUBLE PRECISION;
