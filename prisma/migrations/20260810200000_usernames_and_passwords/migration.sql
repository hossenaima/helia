-- Usernames and passwords, without locking anybody out.
--
-- Purely additive on purpose. Nothing is dropped and no existing value is
-- rewritten, so the build currently in production — which knows none of these
-- columns — keeps working while this sits applied ahead of it.
--
-- No credential changes here either. Every account keeps the PIN it has; the
-- old secret stays valid right up to the moment its owner replaces it at
-- /setup. That is the whole reason this cannot lock anyone out.

ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Defaults true so every future signup — which chooses both up front — is
-- complete on arrival.
ALTER TABLE "User" ADD COLUMN "setupComplete" BOOLEAN NOT NULL DEFAULT true;

-- ...and then false for exactly the rows that exist right now, which are the
-- ones that predate usernames and password rules. Order matters: the default
-- above has already filled these in, and this is what un-fills them.
UPDATE "User" SET "setupComplete" = false;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
