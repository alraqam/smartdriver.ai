-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "clientId" TEXT;

-- CreateIndex
-- Scoped to the user: two devices minting the same client id must not collide
-- across accounts. NULL clientId (every online session) is exempt, because
-- Postgres treats NULLs as distinct in a unique index.
CREATE UNIQUE INDEX "Session_userId_clientId_key" ON "Session"("userId", "clientId");
