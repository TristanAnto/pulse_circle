-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CircleInvitation" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "inviterId" TEXT,
    "inviteeEmail" TEXT NOT NULL,
    "inviteeId" TEXT,
    "role" "MemberRole" NOT NULL DEFAULT 'NEIGHBOR',
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "CircleInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CircleInvitation_circleId_idx" ON "CircleInvitation"("circleId");

-- CreateIndex
CREATE INDEX "CircleInvitation_inviterId_idx" ON "CircleInvitation"("inviterId");

-- CreateIndex
CREATE INDEX "CircleInvitation_inviteeEmail_idx" ON "CircleInvitation"("inviteeEmail");

-- CreateIndex
CREATE INDEX "CircleInvitation_expiresAt_idx" ON "CircleInvitation"("expiresAt");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "CircleInvitation_tokenHash_key" ON "CircleInvitation"("tokenHash");

-- CreateIndex (partial unique for PENDING invitations)
CREATE UNIQUE INDEX "CircleInvitation_circleId_inviteeEmail_pending_key" ON "CircleInvitation"("circleId", "inviteeEmail") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "CircleInvitation" ADD CONSTRAINT "CircleInvitation_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleInvitation" ADD CONSTRAINT "CircleInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleInvitation" ADD CONSTRAINT "CircleInvitation_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
