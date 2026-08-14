-- CreateTable
CREATE TABLE "route_stop_order_override" (
    "routeId" TEXT NOT NULL,
    "directionId" INTEGER NOT NULL,
    "stopIds" TEXT[],
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_stop_order_override_pkey" PRIMARY KEY ("routeId","directionId")
);

-- AddForeignKey
ALTER TABLE "route_stop_order_override" ADD CONSTRAINT "route_stop_order_override_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

