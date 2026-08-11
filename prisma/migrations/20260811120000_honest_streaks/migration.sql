-- Streaks that cannot be typed in, and a declared way to pause one.
--
-- Additive on both counts, so the build in production keeps working while this
-- sits applied ahead of the deploy.
--
-- `source` records where a reading came from. Everything defaults to 'live';
-- the two statements below correct the existing rows that were not.

ALTER TABLE "WeightEntry" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'live';

-- A row created on a different day from the one it is *for* was written after
-- the fact. That is the calendar backfill, and it is what has to stop counting.
-- Compared in the account's own timezone, because that is the day boundary the
-- entry was filed under.
UPDATE "WeightEntry" w
   SET "source" = 'backfill'
  FROM "User" u
 WHERE u.id = w."userId"
   AND to_char(w."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE u.timezone, 'YYYY-MM-DD') <> w.date;

-- ...except one real Apple Health import, which is a backfill by construction
-- and is not a fabrication: 51 rows written in a two-second burst on
-- 2026-08-03. Named by its exact window rather than inferred by a rule, because
-- a heuristic that guesses "burst = import" is one nobody can check later. Any
-- import after this deploy labels itself.
UPDATE "WeightEntry"
   SET "source" = 'health'
 WHERE "createdAt" >= TIMESTAMP '2026-08-03 07:29:04'
   AND "createdAt" <= TIMESTAMP '2026-08-03 07:29:07';

CREATE TABLE "StreakFreeze" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreakFreeze_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StreakFreeze_userId_startDate_idx" ON "StreakFreeze"("userId", "startDate");

-- Cascade, like every other table hanging off User: account deletion is one
-- `prisma.user.delete`, and a relation without this would silently break it.
ALTER TABLE "StreakFreeze" ADD CONSTRAINT "StreakFreeze_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
