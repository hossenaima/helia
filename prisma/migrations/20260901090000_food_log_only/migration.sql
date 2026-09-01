-- Numbers-off meal logging: the Meals tab becomes a plain journal — name and
-- words, no estimator, no calories computed, numbers-bearing surfaces hidden.
-- Additive only; nobody is opted in.
ALTER TABLE "User" ADD COLUMN "foodLogOnly" BOOLEAN NOT NULL DEFAULT false;
