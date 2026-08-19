"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClosure, endClosure } from "@/actions/closures";
import { DateTimePicker } from "@/components/application/date-picker/date-time-picker";
import { ClosureSummary } from "@/components/console/closure-summary";
import { describeClosure, type ClosureKind } from "@/lib/closures";
import { ga } from "@/lib/gtag";
import {
  CLOSURE_REASON_LABELS,
  CLOSURE_REASONS,
  MAINTAINER_REASONS,
  type ClosureReasonValue,
} from "@/lib/operators";
import { PartialRangeFields } from "@/components/console/partial-range-fields";
import { useRouteEditorStore } from "@/stores/route-editor-store";
import type { RouteStop } from "@/types/console";

interface ServiceRoute {
  id: string;
  shortName: string;
  closure: {
    id: string;
    reason: ClosureReasonValue;
    note: string | null;
    endsAt: string;
    kind: ClosureKind;
    fromStopId: string | null;
    toStopId: string | null;
  } | null;
}

interface RouteServiceTabProps {
  readonly route: ServiceRoute;
  readonly isMaintainer: boolean;
  /** Refetch the map geometry — a closure changes what is drawn. */
  readonly onChanged: () => void;
}

const selectClass =
  "cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[13px] font-normal text-[#1C2321]";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]";

function startOfMinute(date: Date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

/**
 * Close or reopen a route, in whole or in part.
 *
 * Lives in its own tab because closures are the one thing here that isn't a
 * GTFS field: everything else edits the feed, this changes what riders are told
 * is running right now.
 */
export function RouteServiceTab({
  route,
  isMaintainer,
  onChanged,
}: RouteServiceTabProps) {
  const router = useRouter();
  const setFeedback = useRouteEditorStore((s) => s.setFeedback);
  const [isPending, startTransition] = useTransition();

  const [reason, setReason] = useState<ClosureReasonValue>(
    isMaintainer ? "MAINTENANCE" : "PUBLIC_HOLIDAY",
  );
  const [note, setNote] = useState("");
  const [startsAt, setStartsAt] = useState(() => startOfMinute(new Date()));
  const [endsAt, setEndsAt] = useState(() =>
    startOfMinute(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [dateError, setDateError] = useState<string | null>(null);
  // Floor for "no past dates", refreshed on each interaction so a panel left
  // open for hours doesn't keep validating against a stale minimum.
  const [nowFloor, setNowFloor] = useState(() => startOfMinute(new Date()));
  const [scope, setScope] = useState<"whole" | "partial">("whole");
  const [kind, setKind] = useState<"SEVERED" | "SKIPPED">("SEVERED");
  const [fromStopId, setFromStopId] = useState("");
  const [toStopId, setToStopId] = useState("");
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);

  // Stop list for the partial-range pickers.
  useEffect(() => {
    if (route.closure) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStopsLoading(true);
    });
    void fetch(`/api/routes/${route.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stops?: RouteStop[] } | null) => {
        if (cancelled) return;
        setRouteStops(data?.stops ?? []);
      })
      .catch(() => {
        if (!cancelled) setRouteStops([]);
      })
      .finally(() => {
        if (!cancelled) setStopsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route.id, route.closure]);

  const previewSentence = useMemo(() => {
    if (scope !== "partial" || !fromStopId || !toStopId || routeStops.length === 0) {
      return null;
    }
    return describeClosure({ kind, fromStopId, toStopId }, routeStops);
  }, [scope, kind, fromStopId, toStopId, routeStops]);

  const partialReady =
    scope === "whole" ||
    (Boolean(fromStopId) && Boolean(toStopId) && fromStopId !== toStopId);

  const availableReasons = isMaintainer ? MAINTAINER_REASONS : CLOSURE_REASONS;

  const onStartsAtChange = (next: Date) => {
    const floor = startOfMinute(new Date());
    const clamped = next < floor ? floor : next;
    setNowFloor(floor);
    setStartsAt(clamped);
    setDateError(null);
    if (endsAt <= clamped) {
      setEndsAt(new Date(clamped.getTime() + 60 * 60 * 1000));
    }
  };

  const onEndsAtChange = (next: Date) => {
    const floor = startOfMinute(new Date());
    setNowFloor(floor);
    const minEnd = startsAt > floor ? startsAt : floor;
    setEndsAt(next <= minEnd ? new Date(minEnd.getTime() + 60 * 60 * 1000) : next);
    setDateError(null);
  };

  /** Dates must still be sane at submit — the picker is not the only guard. */
  const datesValid = () => {
    const floor = startOfMinute(new Date());
    setNowFloor(floor);
    const grace = floor.getTime() - 60_000;
    if (startsAt.getTime() < grace) {
      setDateError("Start cannot be in the past");
      return false;
    }
    if (endsAt.getTime() < grace) {
      setDateError("End cannot be in the past");
      return false;
    }
    if (endsAt <= startsAt) {
      setDateError("End must be after start");
      return false;
    }
    setDateError(null);
    return true;
  };

  const submitClosure = () => {
    if (!partialReady || !datesValid()) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await createClosure({
          routeId: route.id,
          reason,
          note: note || undefined,
          startsAt,
          endsAt,
          kind: scope === "whole" ? "WHOLE_ROUTE" : kind,
          fromStopId: scope === "partial" ? fromStopId : null,
          toStopId: scope === "partial" ? toStopId : null,
        });
        if (result.ok) {
          ga.consoleCloseRoute(route.id, reason);
          setFeedback({
            kind: "ok",
            message: `${route.shortName} ${scope === "partial" ? "partially closed" : "closed"} · ${CLOSURE_REASON_LABELS[reason]}`,
          });
          setNote("");
          setScope("whole");
          onChanged();
          router.refresh();
        } else {
          setFeedback({ kind: "error", message: result.error });
        }
      } catch {
        setFeedback({ kind: "error", message: "Not allowed to create closures" });
      }
    });
  };

  const submitReopen = () => {
    if (!route.closure) return;
    const closureId = route.closure.id;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await endClosure(closureId);
        if (result.ok) {
          ga.consoleReopenRoute(route.id);
          setFeedback({ kind: "ok", message: `${route.shortName} reopened` });
          onChanged();
          router.refresh();
        } else {
          setFeedback({ kind: "error", message: result.error });
        }
      } catch {
        setFeedback({ kind: "error", message: "Not allowed to end closures" });
      }
    });
  };

  if (route.closure) {
    const whole = route.closure.kind === "WHOLE_ROUTE";
    return (
      <div className="flex flex-col gap-3">
        <div
          className="rounded-lg px-3 py-2 text-[12.5px]"
          style={{
            background: whole ? "#FEF2F2" : "#FFF7ED",
            color: whole ? "#991B1B" : "#9A3412",
          }}
        >
          <div className="font-semibold">
            {whole ? "Closed" : "Partially closed"}
          </div>
          <ClosureSummary closure={route.closure} routeId={route.id} />
          <div className="mt-1">
            {CLOSURE_REASON_LABELS[route.closure.reason]}
            {route.closure.note && ` — ${route.closure.note}`}
          </div>
          <div className="mt-0.5 text-[11.5px] opacity-75">
            until {new Date(route.closure.endsAt).toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          onClick={submitReopen}
          disabled={isPending}
          className="cursor-pointer self-start rounded-lg border border-[#86EFAC] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#15803D] hover:bg-[#F0FDF4] disabled:opacity-50"
        >
          {isPending ? "Reopening…" : "Reopen route"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-semibold text-[#5C6B5E]">Scope</legend>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#1C2321]">
          <input
            type="radio"
            name="scope"
            checked={scope === "whole"}
            onChange={() => setScope("whole")}
          />
          Whole route
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#1C2321]">
          <input
            type="radio"
            name="scope"
            checked={scope === "partial"}
            onChange={() => setScope("partial")}
          />
          Part of the route
        </label>
      </fieldset>

      {scope === "partial" && (
        <PartialRangeFields
          stopsLoading={stopsLoading}
          routeStops={routeStops}
          fromStopId={fromStopId}
          toStopId={toStopId}
          kind={kind}
          previewSentence={previewSentence}
          onFrom={setFromStopId}
          onTo={setToStopId}
          onKind={setKind}
        />
      )}

      <label className={labelClass}>
        Reason
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as ClosureReasonValue)}
          className={selectClass}
        >
          {availableReasons.map((value) => (
            <option key={value} value={value}>
              {CLOSURE_REASON_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Note (optional)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Adwa Victory Day"
          className="rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[13px] font-normal text-[#1C2321]"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <DateTimePicker
          label="From"
          value={startsAt}
          minValue={nowFloor}
          onChange={onStartsAtChange}
          isInvalid={Boolean(dateError?.toLowerCase().includes("start"))}
        />
        <DateTimePicker
          label="Until"
          value={endsAt}
          minValue={startsAt > nowFloor ? startsAt : nowFloor}
          onChange={onEndsAtChange}
          isInvalid={Boolean(
            dateError && !dateError.toLowerCase().includes("start"),
          )}
        />
      </div>
      {dateError && (
        <p className="text-[12px] font-medium text-[#B91C1C]">{dateError}</p>
      )}

      <button
        onClick={submitClosure}
        disabled={isPending || !partialReady}
        className="cursor-pointer self-start rounded-lg border border-[#FCA5A5] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
      >
        {isPending
          ? "Closing…"
          : scope === "partial"
            ? "Close this section"
            : "Close route"}
      </button>
    </div>
  );
}
