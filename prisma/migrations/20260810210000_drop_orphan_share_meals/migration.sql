-- Drop User.shareMeals, the account-wide food-sharing flag that per-friend
-- sharing replaced.
--
-- This is the second attempt. `20260810120000_per_friend_meal_sharing` already
-- dropped it once, while the Aug-6 build was still serving — and `currentUser()`
-- does a bare `findUnique`, which makes Prisma select every column *its* schema
-- knows. So the drop broke every signed-in page load until a deploy landed, and
-- the column was added back by hand to end the outage.
--
-- Safe now for the one reason it was not safe then: production is serving code
-- that does not know this column exists. The rule is the same as it was —
-- deploy the code that stops reading a column, then drop it.
--
-- Nothing is lost. Every row held `false`, which is what it held before the
-- per-friend flags on Friendship took over.

ALTER TABLE "User" DROP COLUMN IF EXISTS "shareMeals";
