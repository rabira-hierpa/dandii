"use client";

import { useEffect, useState } from "react";
import type { FareHistoryEntry, FareSnapshot } from "@/types/fares";

/**
 * A route's fare history.
 *
 * `FareChangeLog` has been written on every fare change since the fare
 * registry shipped, with nothing in the console reading it — so a fare could
 * change and the only way to learn who changed it was a SQL prompt. Mounted
 * only while the disclosure is open, which is why the fetch is on mount: the
 * fares page lists 25 routes and eagerly loading all their histories would
 * cost 25 queries to render nothing anybody asked for.
 */

const SOURCE_LABELS: Record<FareHistoryEntry["source"], string> = {
  PROPOSAL_APPROVAL: "from a rider proposal",
  CONSOLE_EDIT: "edited in the console",
  RESEED: "restored by a reseed",
};

/** "no fare" / "12.00 ETB" / "3 tiers" — whichever the snapshot actually is. */
function describe(snapshot: FareSnapshot): string {
  if (snapshot.kind === null) return "no fare";
  if (snapshot.kind === "TIERED") {
    return `${snapshot.tierCount} tier${snapshot.tierCount === 1 ? "" : "s"}`;
  }
  return snapshot.flatEtb ? `${snapshot.flatEtb} ETB` : "no amount";
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FareHistory({ routeId }: { routeId: string }) {
  const [entries, setEntries] = useState<FareHistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/console/fares/${routeId}/history`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: FareHistoryEntry[]) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        // Say so rather than render an empty list — "no history" and "we
        // could not load the history" are different facts.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  if (failed) {
    return (
      <p className="px-1 py-2 text-[12px] text-[#991B1B]">
        Could not load this route&apos;s fare history.
      </p>
    );
  }
  if (entries === null) {
    return (
      <p className="px-1 py-2 text-[12px] text-[#5C6B5E]">Loading history…</p>
    );
  }
  if (entries.length === 0) {
    return (
      <p className="px-1 py-2 text-[12px] text-[#5C6B5E]">
        This fare has not changed since it was first recorded.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-1.5 px-1 py-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] text-[#3D4A3F]"
        >
          <span className="font-semibold text-[#1C2321]">
            {describe(entry.before)} → {describe(entry.after)}
          </span>
          <span className="text-[#5C6B5E]">
            {SOURCE_LABELS[entry.source]} by {entry.changedByName}
          </span>
          <time
            dateTime={entry.createdAt}
            className="ml-auto shrink-0 text-[11px] text-[#7A8A7C]"
          >
            {formatWhen(entry.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
