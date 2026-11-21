-- CreateEnum
CREATE TYPE "RemovalRecordStatus" AS ENUM ('PENDING', 'REMOVED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "NexconnRemovalRecord" (
    "id" TEXT NOT NULL,
    "circleId" TEXT,
    "targetUserId" TEXT,
    "requestingUserId" TEXT,
    "nexconnUserId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "status" "RemovalRecordStatus" NOT NULL DEFAULT 'PENDING',
    "claimedBy" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "retrySourceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "nexconnError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NexconnRemovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NexconnRemovalRecord_idempotencyKey_key" ON "NexconnRemovalRecord"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "NexconnRemovalRecord_retrySourceId_key" ON "NexconnRemovalRecord"("retrySourceId");

-- CreateIndex
CREATE INDEX "NexconnRemovalRecord_circleId_idx" ON "NexconnRemovalRecord"("circleId");

-- CreateIndex
CREATE INDEX "NexconnRemovalRecord_status_idx" ON "NexconnRemovalRecord"("status");

-- CreateIndex
CREATE INDEX "NexconnRemovalRecord_claimExpiresAt_idx" ON "NexconnRemovalRecord"("claimExpiresAt");

-- AddForeignKey
ALTER TABLE "NexconnRemovalRecord" ADD CONSTRAINT "NexconnRemovalRecord_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NexconnRemovalRecord" ADD CONSTRAINT "NexconnRemovalRecord_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NexconnRemovalRecord" ADD CONSTRAINT "NexconnRemovalRecord_requestingUserId_fkey" FOREIGN KEY ("requestingUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NexconnRemovalRecord" ADD CONSTRAINT "NexconnRemovalRecord_retrySourceId_fkey" FOREIGN KEY ("retrySourceId") REFERENCES "NexconnRemovalRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
