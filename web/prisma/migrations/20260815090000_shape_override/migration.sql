-- CreateTable
CREATE TABLE "shape_override" (
    "routeId" TEXT NOT NULL,
    "directionId" INTEGER NOT NULL,
    "waypoints" JSONB NOT NULL,
    "geojson" JSONB NOT NULL,
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shape_override_pkey" PRIMARY KEY ("routeId","directionId")
);

-- AddForeignKey
ALTER TABLE "shape_override" ADD CONSTRAINT "shape_override_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

