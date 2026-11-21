-- AlterTable
ALTER TABLE "CircleNexconnChannel" ADD COLUMN     "syncLockExpiresAt" TIMESTAMP(3),
ADD COLUMN     "syncLockOwner" TEXT;

-- CreateIndex
CREATE INDEX "CircleNexconnChannel_syncLockExpiresAt_idx" ON "CircleNexconnChannel"("syncLockExpiresAt");
