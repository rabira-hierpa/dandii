-- CreateEnum
CREATE TYPE "EntityOrigin" AS ENUM ('FEED', 'OPERATOR');

-- AlterTable
ALTER TABLE "route" ADD COLUMN     "origin" "EntityOrigin" NOT NULL DEFAULT 'FEED';

-- AlterTable
ALTER TABLE "route_override" ADD COLUMN     "continuousDropOff" INTEGER,
ADD COLUMN     "continuousPickup" INTEGER,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "desc" TEXT,
ADD COLUMN     "type" INTEGER,
ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "stop" ADD COLUMN     "origin" "EntityOrigin" NOT NULL DEFAULT 'FEED';

-- AlterTable
ALTER TABLE "stop_override" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trip" ADD COLUMN     "directionId" INTEGER;

-- CreateTable
CREATE TABLE "shape" (
    "id" TEXT NOT NULL,
    "geojson" JSONB NOT NULL,
    "geojsonSimplified" JSONB NOT NULL,
    "lengthMeters" DOUBLE PRECISION,

    CONSTRAINT "shape_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_shapeId_idx" ON "trip"("shapeId");

-- Existing trips carry shape_ids from the feed, but "shape" is created empty by
-- this migration, so the foreign key below would fail on every one of them.
-- Nothing outside the seed reads trip."shapeId" (route geometry hangs off
-- "route", not "trip"), so clearing it is invisible to the app; the reseed that
-- has to run for this change repopulates it along with the shape rows.
UPDATE "trip" SET "shapeId" = NULL;

-- AddForeignKey
ALTER TABLE "trip" ADD CONSTRAINT "trip_shapeId_fkey" FOREIGN KEY ("shapeId") REFERENCES "shape"("id") ON DELETE SET NULL ON UPDATE CASCADE;

