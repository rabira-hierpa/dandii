"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Plus, Trash01 } from "@untitledui/icons";
import { fareSchema, type FareInput } from "@/actions/fare-schema";
import { updateFare } from "@/actions/fares";
import { RouteChip } from "@/components/console/route-chip";
import type { OperatorCode } from "@/lib/operators";
import { cx } from "@/utils/cx";

export interface FareRowData {
  routeId: string;
  shortName: string;
  longName: string;
  operatorCode: OperatorCode | null;
  operatorName: string;
  typeLabel: string;
  kind: "FLAT" | "TIERED";
  flatAmountEtb: number | null;
  tiers: {
    label: string;
    fromKm: number;
    toKm: number | null;
    amountEtb: number;
  }[];
}

const DEFAULT_TIERS = [
  { label: "0–4 km", fromKm: 0, toKm: 4, amountEtb: 10 },
  { label: "4–8 km", fromKm: 4, toKm: 8, amountEtb: 15 },
  { label: "8+ km", fromKm: 8, toKm: null, amountEtb: 20 },
];

const numberInput =
  "w-20 rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-1.5 text-[13.5px] font-semibold text-[#1C2321] tabular-nums focus:outline-2 focus:outline-[#15803D33]";

export function FareRow({
  data,
  readOnly,
}: {
  data: FareRowData;
  readOnly: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FareInput>({
    resolver: zodResolver(fareSchema),
    defaultValues:
      data.kind === "FLAT"
        ? {
            routeId: data.routeId,
            kind: "FLAT",
            flatAmountEtb: data.flatAmountEtb ?? 0,
          }
        : {
            routeId: data.routeId,
            kind: "TIERED",
            tiers: data.tiers.length > 0 ? data.tiers : DEFAULT_TIERS,
          },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    // Cast: "tiers" only exists on the TIERED branch of the union.
    name: "tiers" as never,
  });

  const switchKind = (next: "FLAT" | "TIERED") => {
    if (readOnly || next === kind) return;
    if (next === "FLAT") {
      form.setValue("kind", "FLAT");
      form.setValue(
        "flatAmountEtb",
        data.flatAmountEtb ?? data.tiers[0]?.amountEtb ?? 10,
        { shouldDirty: true },
      );
    } else {
      form.setValue("kind", "TIERED");
      form.setValue(
        "tiers",
        data.tiers.length > 0 ? data.tiers : DEFAULT_TIERS,
        { shouldDirty: true },
      );
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      try {
        await updateFare(values);
        setSaved(true);
        form.reset(values);
        setTimeout(() => setSaved(false), 2500);
      } catch {
        setServerError("Not allowed to update fares");
      }
    });
  });

  const tierErrors =
    kind === "TIERED"
      ? (form.formState.errors as { tiers?: { message?: string } }).tiers
          ?.message
      : undefined;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-wrap items-center gap-5 rounded-xl border border-[#E2E6DE] bg-white px-5 py-4"
    >
      <div className="flex min-w-60 flex-1 items-center gap-3">
        <RouteChip shortName={data.shortName} operatorCode={data.operatorCode} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[#1C2321]">
            {data.longName}
          </div>
          <div className="text-xs text-[#5C6B5E]">
            {data.operatorName} · {data.typeLabel}
          </div>
        </div>
      </div>

      <div className="flex overflow-hidden rounded-lg border border-[#D6DCD0]">
        {(["FLAT", "TIERED"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => switchKind(option)}
            disabled={readOnly}
            className={cx(
              "cursor-pointer px-4 py-2 text-[12.5px] font-semibold first:border-r first:border-[#D6DCD0] disabled:cursor-not-allowed",
              kind === option
                ? "bg-[#152018] text-white"
                : "bg-white text-[#3D4A3F] hover:bg-[#F4F5F2]",
            )}
          >
            {option === "FLAT" ? "Flat" : "Tiered"}
          </button>
        ))}
      </div>

      {kind === "FLAT" ? (
        <div className="flex items-center gap-2">
          <Controller
            control={form.control}
            name="flatAmountEtb"
            render={({ field }) => (
              <input
                type="number"
                min={0}
                step={1}
                value={field.value ?? 0}
                onChange={(e) => field.onChange(Number(e.target.value))}
                disabled={readOnly}
                className={cx(numberInput, "w-22")}
                aria-label={`Flat fare for ${data.shortName}`}
              />
            )}
          />
          <span className="text-[13px] font-semibold text-[#5C6B5E]">
            ETB / trip
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          {fields.map((tierField, index) => (
            <div key={tierField.id} className="flex flex-col gap-1">
              <Controller
                control={form.control}
                name={`tiers.${index}.label`}
                render={({ field }) => (
                  <input
                    value={field.value}
                    onChange={field.onChange}
                    disabled={readOnly}
                    className="w-24 rounded border-none bg-transparent p-0 text-[11px] font-semibold tracking-wide text-[#5C6B5E] uppercase focus:outline-1 focus:outline-[#15803D33]"
                    aria-label={`Tier ${index + 1} label`}
                  />
                )}
              />
              <div className="flex items-center gap-1.5">
                <Controller
                  control={form.control}
                  name={`tiers.${index}.amountEtb`}
                  render={({ field }) => (
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={field.value ?? 0}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      disabled={readOnly}
                      className={numberInput}
                      aria-label={`Tier ${index + 1} amount`}
                    />
                  )}
                />
                <span className="text-xs text-[#5C6B5E]">ETB</span>
                {!readOnly && fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="cursor-pointer text-[#9AA69C] hover:text-[#B91C1C]"
                    aria-label={`Remove tier ${index + 1}`}
                  >
                    <Trash01 className="size-3.5" />
                  </button>
                )}
              </div>
              {/* Distance band, editable end-to-end */}
              <div className="flex items-center gap-1 text-[11px] text-[#5C6B5E]">
                <Controller
                  control={form.control}
                  name={`tiers.${index}.fromKm`}
                  render={({ field }) => (
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={field.value ?? 0}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      disabled={readOnly}
                      className="w-13 rounded border border-[#E2E6DE] bg-white px-1.5 py-0.5 text-[11px] tabular-nums"
                      aria-label={`Tier ${index + 1} from km`}
                    />
                  )}
                />
                <span>–</span>
                <Controller
                  control={form.control}
                  name={`tiers.${index}.toKm`}
                  render={({ field }) => (
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={field.value ?? ""}
                      placeholder="∞"
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      disabled={readOnly}
                      className="w-13 rounded border border-[#E2E6DE] bg-white px-1.5 py-0.5 text-[11px] tabular-nums"
                      aria-label={`Tier ${index + 1} to km`}
                    />
                  )}
                />
                <span>km</span>
              </div>
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() =>
                append({ label: "New band", fromKm: 0, toKm: null, amountEtb: 10 })
              }
              className="mb-1 flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-[#D6DCD0] px-2.5 py-1.5 text-xs font-semibold text-[#5C6B5E] hover:bg-[#F4F5F2]"
            >
              <Plus className="size-3.5" /> Tier
            </button>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {tierErrors && (
          <span className="text-xs text-[#B91C1C]">{tierErrors}</span>
        )}
        {serverError && (
          <span className="text-xs text-[#B91C1C]">{serverError}</span>
        )}
        {saved && (
          <span className="text-xs font-semibold text-[#15803D]">Saved</span>
        )}
        {!readOnly && (
          <button
            type="submit"
            disabled={!form.formState.isDirty || isPending}
            className="cursor-pointer rounded-lg bg-[#152018] px-4 py-2 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </form>
  );
}
