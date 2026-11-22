-- CreateTable
CREATE TABLE "ConversationReadState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationReadState_userId_circleId_key" ON "ConversationReadState"("userId", "circleId");

-- CreateIndex
CREATE INDEX "ConversationReadState_userId_idx" ON "ConversationReadState"("userId");

-- CreateIndex
CREATE INDEX "ConversationReadState_circleId_idx" ON "ConversationReadState"("circleId");

-- AddForeignKey
ALTER TABLE "ConversationReadState" ADD CONSTRAINT "ConversationReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationReadState" ADD CONSTRAINT "ConversationReadState_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
