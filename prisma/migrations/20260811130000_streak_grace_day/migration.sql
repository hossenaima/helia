-- A day's grace for typing in a weigh-in.
--
-- The first cut of this counted a reading only if it was logged on the day it
-- was for, which records somebody who weighed themselves and got round to
-- typing it the next morning as having missed the day. One day is the whole
-- grace: wide enough to cover forgetting, too narrow to fill in a week.
-- See `sourceForDate` in src/lib/calendar.ts.
--
-- Existing rows written the day after the one they are for move to 'live'.
-- Rows written later stay 'backfill', and nothing that already counts changes.

UPDATE "WeightEntry" w
   SET "source" = 'live'
  FROM "User" u
 WHERE u.id = w."userId"
   AND w."source" = 'backfill'
   AND to_char(w."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE u.timezone, 'YYYY-MM-DD')
       = (w.date::date + 1)::text;
