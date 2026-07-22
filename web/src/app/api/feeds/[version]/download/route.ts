import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { requireExportAccess } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

/**
 * Stream a generated GTFS zip. 404 when the version is unknown; 410 (Gone) when
 * the row exists but its zip file was pruned from the volume — the design keeps
 * only the newest N zips, so older versions are expected to disappear.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ version: string }> },
) {
  const denied = await requireExportAccess();
  if (denied) return denied;

  const { version } = await params;
  const versionNum = Number(version);
  if (!Number.isInteger(versionNum)) {
    return Response.json({ error: "Invalid version" }, { status: 400 });
  }

  const feed = await prisma.feedVersion.findUnique({
    where: { version: versionNum },
    select: { filePath: true, version: true },
  });
  if (!feed) {
    return Response.json({ error: "Version not found" }, { status: 404 });
  }

  let size: number;
  try {
    ({ size } = await stat(feed.filePath));
  } catch {
    return Response.json(
      { error: "This version's file is no longer available (pruned)." },
      { status: 410 },
    );
  }

  const stream = Readable.toWeb(
    createReadStream(feed.filePath),
  ) as ReadableStream<Uint8Array>;

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="dandii-gtfs-v${feed.version}.zip"`,
    },
  });
}
