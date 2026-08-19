-- CreateTable
CREATE TABLE "trip_override" (
    "tripId" TEXT NOT NULL,
    "blockId" TEXT,
    "headsign" TEXT,
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_override_pkey" PRIMARY KEY ("tripId")
);

-- AddForeignKey
ALTER TABLE "trip_override" ADD CONSTRAINT "trip_override_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

