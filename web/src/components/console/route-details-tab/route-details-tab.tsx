"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRoute, duplicateRoute, updateRouteFields } from "@/actions/route-edit";
import { OPERATOR_CODES, OPERATOR_META, type OperatorCode } from "@/lib/operators";
import { useRouteEditorStore } from "@/stores/route-editor-store";
import {
  CONTINUOUS_OPTIONS,
  ROUTE_TYPES,
  type RouteEditorDetail,
} from "@/types/console";
import { cx } from "@/utils/cx";

interface RouteDetailsTabProps {
  readonly detail: RouteEditorDetail;
  readonly onChanged: () => void;
}

/** Swatches operators reach for most; any hex is still accepted by the input. */
const COLOR_PRESETS = [
  "D97706", "F59E0B", "15803D", "22C55E", "1D4ED8", "3B82F6",
  "9333EA", "C026D3", "0F766E", "14B8A6", "B91C1C", "EF4444",
  "1C2321", "64748B", "78350F", "365314",
];

const inputClass =
  "rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[13px] font-normal text-[#1C2321] placeholder:text-[#9AA69C]";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]";

export function RouteDetailsTab({ detail, onChanged }: RouteDetailsTabProps) {
  const router = useRouter();
  const setFeedback = useRouteEditorStore((s) => s.setFeedback);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Draft values for the form only. They exist for the duration of one edit and
  // nothing else reads them, so they stay local rather than going in the store.
  const o = detail.override;
  const [shortName, setShortName] = useState(detail.shortName);
  const [longName, setLongName] = useState(detail.longName);
  const [desc, setDesc] = useState(o?.desc ?? "");
  const [url, setUrl] = useState(o?.url ?? "");
  const [type, setType] = useState(detail.type);
  const [color, setColor] = useState(detail.color ?? "");
  const [textColor, setTextColor] = useState(detail.textColor ?? "");
  const [operatorCode, setOperatorCode] = useState<OperatorCode | "">(
    detail.operatorCode ?? "",
  );
  const [pickup, setPickup] = useState<number | null>(
    o?.continuousPickup ?? null,
  );
  const [dropOff, setDropOff] = useState<number | null>(
    o?.continuousDropOff ?? null,
  );

  const save = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateRouteFields({
        routeId: detail.id,
        shortName,
        longName,
        desc: desc.trim() === "" ? null : desc.trim(),
        url: url.trim() === "" ? null : url.trim(),
        type,
        color: color.trim() === "" ? null : color.trim().replace(/^#/, ""),
        textColor:
          textColor.trim() === "" ? null : textColor.trim().replace(/^#/, ""),
        operatorCode: operatorCode === "" ? null : operatorCode,
        continuousPickup: pickup,
        continuousDropOff: dropOff,
      });
      if (result.ok) {
        setFeedback({ kind: "ok", message: `${shortName} saved` });
        onChanged();
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  };

  const onDuplicate = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await duplicateRoute({ routeId: detail.id });
      if (result.ok) {
        setFeedback({
          kind: "ok",
          message: "Copied. Metadata only — no stops or trips were copied.",
        });
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  };

  const onDelete = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await deleteRoute({ routeId: detail.id });
      if (result.ok) {
        setFeedback({ kind: "ok", message: `${detail.shortName} deleted` });
        setConfirmingDelete(false);
        onChanged();
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      {detail.operatorCreated && (
        <p className="rounded-lg bg-[#EFF6FF] px-3 py-2 text-[12px] text-[#1E40AF]">
          Created in the console. It survives a feed reload and ships in the next
          published version.
        </p>
      )}

      <label className={labelClass}>
        Short name *
        <input
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Long name
        <input
          value={longName}
          onChange={(e) => setLongName(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Description
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Brief route description"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        URL
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Route type
        <select
          value={type}
          onChange={(e) => setType(Number(e.target.value))}
          className={cx(inputClass, "cursor-pointer")}
        >
          {ROUTE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Operator
        <select
          value={operatorCode}
          onChange={(e) => setOperatorCode(e.target.value as OperatorCode | "")}
          className={cx(inputClass, "cursor-pointer")}
        >
          <option value="">Unassigned</option>
          {OPERATOR_CODES.map((code) => (
            <option key={code} value={code}>
              {OPERATOR_META[code].name}
            </option>
          ))}
        </select>
        <span className="text-[11px] font-normal text-[#7E9182]">
          Drives agency filtering and result ranking for riders.
        </span>
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-semibold text-[#5C6B5E]">
          Route colour
        </legend>
        <div className="flex items-center gap-2">
          <span
            className="size-9 shrink-0 rounded-lg border border-[#D6DCD0]"
            style={{ background: color ? `#${color}` : "#F4F5F2" }}
          />
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="D97706"
            className={cx(inputClass, "flex-1")}
          />
        </div>
        <div className="mt-0.5 grid grid-cols-8 gap-1.5">
          {COLOR_PRESETS.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={`Use colour #${hex}`}
              onClick={() => setColor(hex)}
              className={cx(
                "size-6 cursor-pointer rounded-md border",
                color.toUpperCase() === hex
                  ? "border-[#1C2321] ring-2 ring-[#1C2321]/20"
                  : "border-black/10",
              )}
              style={{ background: `#${hex}` }}
            />
          ))}
        </div>
      </fieldset>

      <label className={labelClass}>
        Text colour
        <input
          value={textColor}
          onChange={(e) => setTextColor(e.target.value)}
          placeholder="FFFFFF"
          className={inputClass}
        />
      </label>

      {detail.directions.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-semibold text-[#5C6B5E]">
            Direction labels
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {detail.directions.map((d) => (
              <div key={d.directionId} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[#7E9182]">
                  Direction {d.directionId}
                </span>
                <div className="rounded-lg border border-[#E8EBE6] bg-[#F8FAF6] px-2.5 py-2 text-[13px] text-[#3D4A3F]">
                  {d.headsign ?? "—"}
                </div>
              </div>
            ))}
          </div>
          <span className="text-[11px] text-[#7E9182]">
            From each direction&rsquo;s trip headsign. Editable with the trip
            editor.
          </span>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-semibold text-[#5C6B5E]">
          Flag-stop service
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-[#7E9182]">
            Pickup
            <select
              value={pickup ?? ""}
              onChange={(e) =>
                setPickup(e.target.value === "" ? null : Number(e.target.value))
              }
              className={cx(inputClass, "cursor-pointer")}
            >
              {CONTINUOUS_OPTIONS.map((opt) => (
                <option key={String(opt.value)} value={opt.value ?? ""}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-[#7E9182]">
            Drop-off
            <select
              value={dropOff ?? ""}
              onChange={(e) =>
                setDropOff(e.target.value === "" ? null : Number(e.target.value))
              }
              className={cx(inputClass, "cursor-pointer")}
            >
              {CONTINUOUS_OPTIONS.map((opt) => (
                <option key={String(opt.value)} value={opt.value ?? ""}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span className="text-[11px] text-[#7E9182]">
          Lets riders board anywhere along the route, not only at listed stops —
          which is how most minibus service actually runs.
        </span>
      </fieldset>

      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-[#EEF1EA] pt-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="cursor-pointer rounded-lg bg-[#1C2321] px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#2C3531] disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={isPending}
          className="cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#3D4A3F] hover:bg-[#F8FAF6] disabled:opacity-50"
        >
          Duplicate
        </button>
        {confirmingDelete ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="cursor-pointer rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#B91C1C] hover:bg-[#FEE2E2] disabled:opacity-50"
            >
              {isPending ? "Deleting…" : "Really delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="cursor-pointer text-[12.5px] font-medium text-[#5C6B5E] hover:underline"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={isPending}
            className="cursor-pointer rounded-lg border border-[#FCA5A5] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
