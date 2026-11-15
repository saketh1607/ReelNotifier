CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'sending', 'sent', 'failed');

CREATE TABLE "Reel" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "shortcode" TEXT,
    "mediaId" TEXT,
    "canonicalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReelTracking" ADD COLUMN "reelId" TEXT;

WITH parsed AS (
  SELECT "id", "originalReelUrl", regexp_match("originalReelUrl", '^https?://(www[.])?instagram[.]com/(reel|reels|p)/([A-Za-z0-9_-]+)') AS parts
  FROM "ReelTracking"
), identities AS (
  SELECT "id", "originalReelUrl", CASE WHEN parts IS NULL THEN 'legacy:' || "id" ELSE 'shortcode:' || parts[3] END AS identity,
         CASE WHEN parts IS NULL THEN NULL ELSE parts[3] END AS shortcode,
         CASE WHEN parts IS NULL THEN "originalReelUrl" ELSE 'https://www.instagram.com/reel/' || parts[3] || '/' END AS canonical_url
  FROM parsed
)
INSERT INTO "Reel" ("id", "identity", "shortcode", "canonicalUrl", "createdAt", "updatedAt")
SELECT 'reel_' || md5(identity), identity, shortcode, canonical_url, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT ON (identity) identity, shortcode, canonical_url FROM identities ORDER BY identity) AS distinct_reels;

WITH parsed AS (
  SELECT "id", regexp_match("originalReelUrl", '^https?://(www[.])?instagram[.]com/(reel|reels|p)/([A-Za-z0-9_-]+)') AS parts
  FROM "ReelTracking"
)
UPDATE "ReelTracking" AS tracking
SET "reelId" = reel."id"
FROM parsed
JOIN "Reel" AS reel ON reel."identity" = CASE WHEN parsed.parts IS NULL THEN 'legacy:' || parsed."id" ELSE 'shortcode:' || parsed.parts[3] END
WHERE tracking."id" = parsed."id";

WITH ranked AS (
  SELECT "id", FIRST_VALUE("id") OVER (PARTITION BY "userId", "reelId" ORDER BY "createdAt", "id") AS keeper_id,
         ROW_NUMBER() OVER (PARTITION BY "userId", "reelId" ORDER BY "createdAt", "id") AS row_num
  FROM "ReelTracking"
)
UPDATE "DetectedReel" AS detected
SET "trackingId" = ranked.keeper_id
FROM ranked
WHERE ranked.row_num > 1 AND detected."trackingId" = ranked."id";

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId", "reelId" ORDER BY "createdAt", "id") AS row_num
  FROM "ReelTracking"
)
DELETE FROM "ReelTracking" AS tracking
USING ranked
WHERE ranked.row_num > 1 AND tracking."id" = ranked."id";

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "trackingId", "reelUrl" ORDER BY "createdAt", "id") AS row_num
  FROM "DetectedReel"
)
DELETE FROM "DetectedReel" AS detected
USING ranked
WHERE ranked.row_num > 1 AND detected."id" = ranked."id";

ALTER TABLE "ReelTracking" ALTER COLUMN "reelId" SET NOT NULL;
ALTER TABLE "ReelTracking" ALTER COLUMN "originalReelUrl" DROP NOT NULL;
CREATE UNIQUE INDEX "Reel_identity_key" ON "Reel"("identity");
CREATE UNIQUE INDEX "Reel_shortcode_key" ON "Reel"("shortcode");
CREATE UNIQUE INDEX "Reel_mediaId_key" ON "Reel"("mediaId");
CREATE UNIQUE INDEX "ReelTracking_userId_reelId_key" ON "ReelTracking"("userId", "reelId");
CREATE UNIQUE INDEX "DetectedReel_trackingId_reelUrl_key" ON "DetectedReel"("trackingId", "reelUrl");
ALTER TABLE "ReelTracking" ADD CONSTRAINT "ReelTracking_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "detectedReelId" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");
CREATE INDEX "OutboxEvent_dispatchedAt_lockedAt_createdAt_idx" ON "OutboxEvent"("dispatchedAt", "lockedAt", "createdAt");
CREATE UNIQUE INDEX "NotificationDelivery_detectedReelId_trackingId_key" ON "NotificationDelivery"("detectedReelId", "trackingId");
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_detectedReelId_fkey" FOREIGN KEY ("detectedReelId") REFERENCES "DetectedReel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_trackingId_fkey" FOREIGN KEY ("trackingId") REFERENCES "ReelTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
