"use server";

import { revalidatePath } from "next/cache";
import { generateFeedVersion } from "@/lib/gtfs-export";
import { requirePermission } from "@/lib/session";

/**
 * Maintainer action: build the next versioned GTFS export (fares overlay) and
 * record a FeedVersion row. Gated on feed:generate (all console-write roles).
 */
export async function generateFeed() {
  const session = await requirePermission({ feed: ["generate"] });
  try {
    const result = await generateFeedVersion(session.user.id);
    revalidatePath("/console/feeds");
    return { ok: true as const, ...result };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Feed generation failed",
    };
  }
}
