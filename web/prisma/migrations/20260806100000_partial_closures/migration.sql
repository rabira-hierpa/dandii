-- CreateEnum
CREATE TYPE "ClosureKind" AS ENUM ('WHOLE_ROUTE', 'SEVERED', 'SKIPPED');

-- AlterTable
ALTER TABLE "route_closure" ADD COLUMN     "fromStopId" TEXT,
ADD COLUMN     "kind" "ClosureKind" NOT NULL DEFAULT 'WHOLE_ROUTE',
ADD COLUMN     "toStopId" TEXT;

