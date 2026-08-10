-- Food sharing moves from one account-wide switch to one per friendship.
-- Weight stays account-wide: the number is the same number whoever is looking.
-- Food is not — "who exactly sees what I ate" is a question people do want to
-- answer per person, which is the opposite of what was assumed when the single
-- flag was written.
--
-- Two columns because one Friendship row covers both directions: A sharing with
-- B says nothing about B sharing with A.
ALTER TABLE "Friendship" ADD COLUMN "requesterSharesMeals" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Friendship" ADD COLUMN "addresseeSharesMeals" BOOLEAN NOT NULL DEFAULT false;

-- Preserve every existing choice exactly. Someone who was sharing food with
-- everyone keeps sharing it with each friend they currently have; someone who
-- was not keeps sharing with nobody. This can only carry a choice across, never
-- widen one — new friendships still default to false.
UPDATE "Friendship" f
   SET "requesterSharesMeals" = u."shareMeals"
  FROM "User" u
 WHERE u.id = f."requesterId";

UPDATE "Friendship" f
   SET "addresseeSharesMeals" = u."shareMeals"
  FROM "User" u
 WHERE u.id = f."addresseeId";

ALTER TABLE "User" DROP COLUMN "shareMeals";
