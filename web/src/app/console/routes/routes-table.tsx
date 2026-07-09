"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Edit03, Plus } from "@untitledui/icons";
import { bulkAssignRoutes, createRoute, deleteRoutes, updateRoute } from "@/actions/routes";
import { RouteChip } from "@/components/console/route-chip";
import type { OperatorCode } from "@/lib/operators";
import { useConsoleFilters } from "@/stores/console-filters-store";
import { cx } from "@/utils/cx";
import { AssignSelect } from "./assign-select";

export interface RouteRow {
  id: string;
  shortName: string;
  longName: string;
  type: number;
  lengthKm: number | null;
  fareLabel: string | null;
  operatorId: string | null;
  operatorCode: OperatorCode | null;
  closed: boolean;
}

interface RoutesTableProps {
  rows: RouteRow[];
  operators: { id: string; name: string }[];
  canAssign: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const routeFormSchema = z.object({
  shortName: z.string().trim().min(1, "Route id is required"),
  longName: z.string().trim().min(1, "Corridor is required"),
  type: z.enum(["bus", "lrt"]),
  lengthKm: z.number().min(0).nullable(),
  operatorId: z.string().nullable(),
});

type RouteFormValues = z.infer<typeof routeFormSchema>;

function typeLabel(routeType: number, operatorCode: OperatorCode | null) {
  if (routeType === 0) return "LRT";
  if (operatorCode === "MINIBUS") return "Minibus";
  return "Fixed bus";
}

const fieldClass =
  "w-full rounded-lg border border-[#D6DCD0] bg-white px-3 py-2 text-[13.5px] text-[#1C2321] focus:outline-2 focus:outline-[#15803D33]";
const labelClass =
  "flex flex-col gap-1 text-[11.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase";

/** Add/edit modal covering every editable route field. */
function RouteModal({
  route,
  operators,
  canDelete,
  onClose,
}: {
  route: RouteRow | null; // null = create
  operators: { id: string; name: string }[];
  canDelete: boolean;
  onClose: (changed: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const setLastChange = useConsoleFilters((s) => s.setLastChange);

  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: route
      ? {
          shortName: route.shortName,
          longName: route.longName,
          type: route.type === 0 ? "lrt" : "bus",
          lengthKm: route.lengthKm,
          operatorId: route.operatorId,
        }
      : { shortName: "", longName: "", type: "bus", lengthKm: null, operatorId: null },
  });

  const submit = form.handleSubmit(
    (values) => {
      setServerError(null);
      startTransition(async () => {
      try {
        const payload = {
          shortName: values.shortName,
          longName: values.longName,
          type: values.type === "lrt" ? (0 as const) : (3 as const),
          lengthKm: values.lengthKm,
          operatorId: values.operatorId || null,
        };
        const result = route
          ? await updateRoute({ routeId: route.id, ...payload })
          : await createRoute(payload);
        if (!result.ok) {
          setServerError(result.error);
          return;
        }
        setLastChange(
          route ? `${values.shortName} updated` : `${values.shortName} created`,
        );
        onClose(true);
      } catch {
        setServerError("Not allowed to edit routes");
      }
    });
    },
    (errors) => {
      setServerError(
        `Validation failed: ${Object.keys(errors).join(", ")}`,
      );
    },
  );

  const remove = () => {
    if (!route) return;
    if (!window.confirm(`Delete route ${route.shortName}? This also removes its trips, fares, and closures.`)) return;
    setServerError(null);
    startTransition(async () => {
      try {
        await deleteRoutes({ routeIds: [route.id] });
        setLastChange(`${route.shortName} deleted`);
        onClose(true);
      } catch {
        setServerError("Not allowed to delete routes");
      }
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={() => onClose(false)} />
      <div className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-110 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 text-[15px] font-bold text-[#1C2321]">
          {route ? `Edit route ${route.shortName}` : "Add route"}
        </div>
        {/* noValidate: zod owns validation; native step/min checks would
            silently block submit (e.g. lengthKm 3.1069 vs step=0.1). */}
        <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Route id
              <input {...form.register("shortName")} className={fieldClass} placeholder="e.g. AB130" />
            </label>
            <label className={labelClass}>
              Type
              <select {...form.register("type")} className={cx(fieldClass, "cursor-pointer")}>
                <option value="bus">Bus / minibus</option>
                <option value="lrt">Light rail</option>
              </select>
            </label>
          </div>
          <label className={labelClass}>
            Corridor
            <input
              {...form.register("longName")}
              className={fieldClass}
              placeholder="e.g. Megenagna ↔ Tor Hailoch"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Length (km)
              <input
                type="number"
                min={0}
                step="any"
                {...form.register("lengthKm", {
                  setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
                })}
                className={fieldClass}
              />
            </label>
            <label className={labelClass}>
              Operator
              <select
                {...form.register("operatorId", {
                  setValueAs: (v) => (v === "" ? null : v),
                })}
                className={cx(fieldClass, "cursor-pointer")}
              >
                <option value="">Unassigned</option>
                {operators.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {Object.keys(form.formState.errors).length > 0 && (
            <div className="text-[12.5px] text-[#B91C1C]">
              {Object.entries(form.formState.errors)
                .map(([field, error]) => `${field}: ${error?.message ?? "invalid"}`)
                .join(" · ")}
            </div>
          )}
          {serverError && (
            <div className="text-[12.5px] text-[#B91C1C]">{serverError}</div>
          )}

          <div className="mt-1 flex items-center gap-2">
            {route && canDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={isPending}
                className="cursor-pointer rounded-lg border border-[#FCA5A5] px-3.5 py-2 text-[12.5px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
              >
                Delete
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => onClose(false)}
                className="cursor-pointer rounded-lg border border-[#D6DCD0] px-3.5 py-2 text-[12.5px] font-semibold text-[#3D4A3F] hover:bg-[#F4F5F2]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="cursor-pointer rounded-lg bg-[#152018] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#24352A] disabled:opacity-50"
              >
                {isPending ? "Saving…" : route ? "Save changes" : "Create route"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

export function RoutesTable({
  rows,
  operators,
  canAssign,
  canEdit,
  canDelete,
}: RoutesTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<RouteRow | "new" | null>(null);
  const [bulkOperator, setBulkOperator] = useState("");
  const [isPending, startTransition] = useTransition();
  const setLastChange = useConsoleFilters((s) => s.setLastChange);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulkAssign = () => {
    if (!bulkOperator || selected.size === 0) return;
    startTransition(async () => {
      try {
        const result = await bulkAssignRoutes({
          routeIds: [...selected],
          operatorId: bulkOperator,
        });
        if (result.ok) {
          setLastChange(`${result.count} routes assigned to ${result.operatorName}`);
          setSelected(new Set());
          router.refresh();
        } else {
          setLastChange(`Bulk assign failed: ${result.error}`);
        }
      } catch {
        setLastChange("Not allowed to assign routes");
      }
    });
  };

  const runBulkDelete = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} route(s)? This also removes their trips, fares, and closures.`)) return;
    startTransition(async () => {
      try {
        const result = await deleteRoutes({ routeIds: [...selected] });
        setLastChange(`${result.count} routes deleted`);
        setSelected(new Set());
        router.refresh();
      } catch {
        setLastChange("Not allowed to delete routes");
      }
    });
  };

  const checkbox = (checked: boolean, onChange: () => void, label: string) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="size-4 cursor-pointer accent-[#15803D]"
    />
  );

  const gridCols =
    "grid-cols-[28px_100px_1.7fr_86px_64px_150px_190px_44px]";

  return (
    <>
      {/* Toolbar: add + bulk actions */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canEdit && (
          <button
            onClick={() => setModal("new")}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#152018] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#24352A]"
          >
            <Plus className="size-4" /> Add route
          </button>
        )}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#D6DCD0] bg-white px-3 py-2">
            <span className="text-[12.5px] font-semibold text-[#1C2321]">
              {selected.size} selected
            </span>
            {canAssign && (
              <>
                <select
                  value={bulkOperator}
                  onChange={(e) => setBulkOperator(e.target.value)}
                  aria-label="Bulk assign operator"
                  className="cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-1.5 text-[12.5px] text-[#1C2321]"
                >
                  <option value="">Assign to…</option>
                  {operators.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={runBulkAssign}
                  disabled={!bulkOperator || isPending}
                  className="cursor-pointer rounded-lg bg-[#15803D] px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
                >
                  Apply
                </button>
              </>
            )}
            {canDelete && (
              <button
                onClick={runBulkDelete}
                disabled={isPending}
                className="cursor-pointer rounded-lg border border-[#FCA5A5] px-3 py-1.5 text-[12.5px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-40"
              >
                Delete
              </button>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="cursor-pointer px-1 text-[12.5px] font-medium text-[#5C6B5E] hover:text-[#1C2321]"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Mobile: card list */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {rows.map((route) => (
          <div
            key={route.id}
            className={cx(
              "flex flex-col gap-2.5 rounded-xl border bg-white p-3.5",
              selected.has(route.id) ? "border-[#86B98F]" : "border-[#E2E6DE]",
            )}
          >
            <div className="flex items-center gap-2">
              {checkbox(selected.has(route.id), () => toggleOne(route.id), `Select ${route.shortName}`)}
              <RouteChip shortName={route.shortName} operatorCode={route.operatorCode} />
              {route.closed && (
                <span className="rounded-full bg-[#FEE2E2] px-1.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap text-[#991B1B]">
                  CLOSED
                </span>
              )}
              <span className="ml-auto text-[11.5px] text-[#7E9182]">
                {typeLabel(route.type, route.operatorCode)}
                {route.lengthKm != null ? ` · ${route.lengthKm.toFixed(1)} km` : ""}
              </span>
              {canEdit && (
                <button
                  onClick={() => setModal(route)}
                  aria-label={`Edit ${route.shortName}`}
                  className="cursor-pointer rounded-lg p-1.5 text-[#5C6B5E] hover:bg-[#F4F5F2]"
                >
                  <Edit03 className="size-4" />
                </button>
              )}
            </div>
            <div className="text-[13.5px] leading-snug font-medium text-[#1C2321]">
              {route.longName}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] whitespace-nowrap text-[#5C6B5E]">
                {route.fareLabel ?? "No fare set"}
              </span>
              <AssignSelect
                routeId={route.id}
                shortName={route.shortName}
                operatorId={route.operatorId}
                operators={operators}
                disabled={!canAssign}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-[#E2E6DE] bg-white p-8 text-center text-[13.5px] text-[#5C6B5E]">
            No routes match your search.
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="overflow-x-auto rounded-xl border border-[#E2E6DE] bg-white max-md:hidden">
        <div
          className={cx(
            "grid min-w-235 items-center gap-3 border-b border-[#E2E6DE] bg-[#F8FAF6] px-5 py-2.5 text-[11.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase",
            gridCols,
          )}
        >
          <span>{checkbox(allSelected, toggleAll, "Select all routes")}</span>
          <span>Route</span>
          <span>Corridor</span>
          <span>Type</span>
          <span>Km</span>
          <span>Fare</span>
          <span>Operating agency</span>
          <span />
        </div>
        {rows.map((route) => (
          <div
            key={route.id}
            className={cx(
              "grid min-w-235 items-center gap-3 border-b border-[#EEF1EA] px-5 py-2.5 text-[13.5px] last:border-b-0",
              gridCols,
              selected.has(route.id) && "bg-[#F3F8F1]",
            )}
          >
            <span>
              {checkbox(selected.has(route.id), () => toggleOne(route.id), `Select ${route.shortName}`)}
            </span>
            <span className="justify-self-start">
              <RouteChip shortName={route.shortName} operatorCode={route.operatorCode} />
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate font-medium text-[#1C2321]">
                {route.longName}
              </span>
              {route.closed && (
                <span className="rounded-full bg-[#FEE2E2] px-1.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap text-[#991B1B]">
                  CLOSED
                </span>
              )}
            </span>
            <span className="text-[12.5px] text-[#5C6B5E]">
              {typeLabel(route.type, route.operatorCode)}
            </span>
            <span className="text-[#5C6B5E] tabular-nums">
              {route.lengthKm != null ? route.lengthKm.toFixed(1) : "—"}
            </span>
            <span className="text-[12.5px] text-[#5C6B5E]">
              {route.fareLabel ?? "—"}
            </span>
            <AssignSelect
              routeId={route.id}
              shortName={route.shortName}
              operatorId={route.operatorId}
              operators={operators}
              disabled={!canAssign}
            />
            <span>
              {canEdit && (
                <button
                  onClick={() => setModal(route)}
                  aria-label={`Edit ${route.shortName}`}
                  className="cursor-pointer rounded-lg p-1.5 text-[#5C6B5E] hover:bg-[#F4F5F2] hover:text-[#1C2321]"
                >
                  <Edit03 className="size-4" />
                </button>
              )}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-8 text-center text-[13.5px] text-[#5C6B5E]">
            No routes match your search.
          </div>
        )}
      </div>

      {modal && (
        <RouteModal
          route={modal === "new" ? null : modal}
          operators={operators}
          canDelete={canDelete}
          onClose={(changed) => {
            setModal(null);
            if (changed) router.refresh();
          }}
        />
      )}
    </>
  );
}
