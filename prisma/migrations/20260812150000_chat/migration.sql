-- Additive only: the live build has never heard of any of this.
ALTER TABLE "Friendship"
  ADD COLUMN "requesterClearedAt" TIMESTAMP(3),
  ADD COLUMN "addresseeClearedAt" TIMESTAMP(3);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "friendshipId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Message_friendshipId_createdAt_idx"
  ON "Message"("friendshipId", "createdAt");

ALTER TABLE "Message" ADD CONSTRAINT "Message_friendshipId_fkey"
  FOREIGN KEY ("friendshipId") REFERENCES "Friendship"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry existing notes across with their ids and timestamps. Notes are only
-- ever between accepted friends; one whose friendship has since been removed
-- has no conversation to land in and is skipped by the join.
INSERT INTO "Message" ("id", "friendshipId", "senderId", "body", "readAt", "createdAt")
SELECT e."id", f."id", e."fromId", e."body", e."readAt", e."createdAt"
FROM "Encouragement" e
JOIN "Friendship" f
  ON (f."requesterId" = e."fromId" AND f."addresseeId" = e."toId")
  OR (f."requesterId" = e."toId"   AND f."addresseeId" = e."fromId");
