-- CreateTable
CREATE TABLE "stop_override" (
    "stopId" TEXT NOT NULL,
    "name" TEXT,
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stop_override_pkey" PRIMARY KEY ("stopId")
);

-- CreateTable
CREATE TABLE "route_override" (
    "routeId" TEXT NOT NULL,
    "shortName" TEXT,
    "longName" TEXT,
    "color" TEXT,
    "textColor" TEXT,
    "operatorCode" "OperatorCode",
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_override_pkey" PRIMARY KEY ("routeId")
);

-- AddForeignKey
ALTER TABLE "stop_override" ADD CONSTRAINT "stop_override_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_override" ADD CONSTRAINT "route_override_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

