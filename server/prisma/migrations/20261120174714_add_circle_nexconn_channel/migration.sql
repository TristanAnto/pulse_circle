-- CreateEnum
CREATE TYPE "CircleChannelStatus" AS ENUM ('PENDING', 'CREATED', 'FAILED');

-- CreateTable
CREATE TABLE "CircleNexconnChannel" (
    "circleId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "creationStatus" "CircleChannelStatus" NOT NULL DEFAULT 'PENDING',
    "nexconnError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CircleNexconnChannel_pkey" PRIMARY KEY ("circleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CircleNexconnChannel_groupId_key" ON "CircleNexconnChannel"("groupId");

-- CreateIndex
CREATE INDEX "CircleNexconnChannel_creationStatus_idx" ON "CircleNexconnChannel"("creationStatus");

-- CreateIndex
CREATE INDEX "CircleNexconnChannel_createdAt_idx" ON "CircleNexconnChannel"("createdAt");

-- AddForeignKey
ALTER TABLE "CircleNexconnChannel" ADD CONSTRAINT "CircleNexconnChannel_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
