"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markSubmissionsViewed } from "@/actions/saved-routes";

/**
 * Clears the "unseen decided submissions" badge when the user actually views
 * their submissions here (D2). Runs once on mount; refreshes so the avatar
 * badge on the map is gone when they return. Only mounted when there is
 * something unseen, so the no-op case never hits the server.
 */
export function MarkSubmissionsViewed() {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void markSubmissionsViewed().then(() => router.refresh());
  }, [router]);
  return null;
}
