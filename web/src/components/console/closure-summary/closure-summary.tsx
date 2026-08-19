"use client";

import { useEffect, useState } from "react";
import { describeClosure, type ClosureKind } from "@/lib/closures";

interface ClosureSummaryProps {
  readonly closure: {
    kind: ClosureKind;
    fromStopId: string | null;
    toStopId: string | null;
  };
  readonly routeId: string;
}

/**
 * The same sentence riders are shown for an active closure.
 *
 * Operators see the rider wording rather than a summary of their own inputs, so
 * a badly-chosen range reads wrong here before anyone is stranded by it.
 *
 * A partial closure needs the route's stop names to phrase, so it fetches them;
 * a whole-route closure needs nothing and renders immediately.
 */
export function ClosureSummary({ closure, routeId }: ClosureSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (closure.kind === "WHOLE_ROUTE") return;
    let cancelled = false;
    void fetch(`/api/routes/${routeId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stops?: { id: string; name: string }[] } | null) => {
        if (cancelled || !data?.stops) return;
        setSummary(describeClosure(closure, data.stops));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [closure, routeId]);

  const text =
    closure.kind === "WHOLE_ROUTE" ? describeClosure(closure, []) : summary;
  if (!text) return null;
  return <div className="mt-1">{text}</div>;
}
