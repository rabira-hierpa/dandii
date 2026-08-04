-- CreateEnum
CREATE TYPE "StopGraphBuildStatus" AS ENUM ('READY', 'FAILED');

-- CreateTable
CREATE TABLE "stop_graph_build" (
    "id" TEXT NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calendarStart" TEXT NOT NULL,
    "calendarEnd" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "edgeCount" INTEGER NOT NULL DEFAULT 0,
    "status" "StopGraphBuildStatus" NOT NULL DEFAULT 'READY',
    "error" TEXT,

    CONSTRAINT "stop_graph_build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stop_graph_node" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "degree" INTEGER NOT NULL,
    "betweenness" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "stop_graph_node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stop_graph_edge" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "fromStopId" TEXT NOT NULL,
    "toStopId" TEXT NOT NULL,
    "travelTimeSec" DOUBLE PRECISION NOT NULL,
    "frequency" INTEGER NOT NULL,

    CONSTRAINT "stop_graph_edge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stop_graph_node_buildId_betweenness_idx" ON "stop_graph_node"("buildId", "betweenness");

-- CreateIndex
CREATE UNIQUE INDEX "stop_graph_node_buildId_stopId_key" ON "stop_graph_node"("buildId", "stopId");

-- CreateIndex
CREATE INDEX "stop_graph_edge_buildId_idx" ON "stop_graph_edge"("buildId");

-- CreateIndex
CREATE INDEX "stop_graph_edge_fromStopId_idx" ON "stop_graph_edge"("fromStopId");

-- CreateIndex
CREATE INDEX "stop_graph_edge_toStopId_idx" ON "stop_graph_edge"("toStopId");

-- CreateIndex
CREATE UNIQUE INDEX "stop_graph_edge_buildId_fromStopId_toStopId_key" ON "stop_graph_edge"("buildId", "fromStopId", "toStopId");

-- AddForeignKey
ALTER TABLE "stop_graph_node" ADD CONSTRAINT "stop_graph_node_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "stop_graph_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stop_graph_edge" ADD CONSTRAINT "stop_graph_edge_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "stop_graph_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

