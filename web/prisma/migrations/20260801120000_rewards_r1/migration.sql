-- CreateEnum
CREATE TYPE "PointsReason" AS ENUM ('SUBMIT', 'APPROVED', 'REJECT_CLAWBACK', 'SUPERSEDED_CREDIT', 'BADGE_BONUS', 'BACKFILL');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "points_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "PointsReason" NOT NULL,
    "proposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badge" (
    "userId" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badge_pkey" PRIMARY KEY ("userId","badge")
);

-- CreateIndex
CREATE INDEX "points_ledger_userId_createdAt_idx" ON "points_ledger"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "points_ledger_proposalId_reason_key" ON "points_ledger"("proposalId", "reason");

-- CreateIndex
CREATE INDEX "user_badge_userId_idx" ON "user_badge"("userId");

-- AddForeignKey
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badge" ADD CONSTRAINT "user_badge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

