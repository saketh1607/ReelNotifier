CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "TrackingStatus" AS ENUM ('pending', 'monitoring', 'part_found', 'completed', 'failed');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "instagramUserId" TEXT NOT NULL,
    "username" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncomingMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "messageText" TEXT,
    "attachmentData" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "userId" TEXT,
    CONSTRAINT "IncomingMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReelTracking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalReelUrl" TEXT NOT NULL,
    "creatorUsername" TEXT,
    "creatorId" TEXT,
    "originalCaption" TEXT,
    "originalTimestamp" TIMESTAMP(3),
    "status" "TrackingStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReelTracking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DetectedReel" (
    "id" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "reelUrl" TEXT NOT NULL,
    "caption" TEXT,
    "publishedAt" TIMESTAMP(3),
    "confidenceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DetectedReel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_instagramUserId_key" ON "User"("instagramUserId");
CREATE UNIQUE INDEX "IncomingMessage_messageId_key" ON "IncomingMessage"("messageId");
CREATE INDEX "IncomingMessage_senderId_receivedAt_idx" ON "IncomingMessage"("senderId", "receivedAt");
CREATE INDEX "IncomingMessage_processedAt_idx" ON "IncomingMessage"("processedAt");
CREATE INDEX "ReelTracking_userId_createdAt_idx" ON "ReelTracking"("userId", "createdAt");
CREATE INDEX "ReelTracking_status_createdAt_idx" ON "ReelTracking"("status", "createdAt");
CREATE INDEX "DetectedReel_trackingId_createdAt_idx" ON "DetectedReel"("trackingId", "createdAt");

ALTER TABLE "IncomingMessage" ADD CONSTRAINT "IncomingMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReelTracking" ADD CONSTRAINT "ReelTracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DetectedReel" ADD CONSTRAINT "DetectedReel_trackingId_fkey" FOREIGN KEY ("trackingId") REFERENCES "ReelTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
