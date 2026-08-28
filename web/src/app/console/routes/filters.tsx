"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchLg } from "@untitledui/icons";
import { Input } from "@/components/base/input/input";
import { OPERATOR_META, type OperatorCode } from "@/lib/operators";
import { useConsoleFilters } from "@/stores/console-filters-store";
import { cx } from "@/utils/cx";

const CHIPS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  ...Object.values(OPERATOR_META).map((m) => ({
    value: m.code,
    label: m.short,
  })),
];

export function RouteFilters({
  resultCount,
  scoped = false,
}: {
  resultCount: number;
  /**
   * True when the viewer only ever sees one operator. The chips are hidden
   * rather than disabled: a scoped viewer clicking "Addis LRT" still gets
   * their own routes back, so leaving the control visible shows a selected
   * operator that does not match the rows underneath it.
   */
  scoped?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { searchText, setSearchText, lastChange } = useConsoleFilters();
  const initialized = useRef(false);

  const activeOperator = searchParams.get("operator") ?? "";

  // Hydrate live search text from the URL once.
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      setSearchText(searchParams.get("q") ?? "");
    }
  }, [searchParams, setSearchText]);

  // Debounce search text into the URL.
  useEffect(() => {
    if (!initialized.current) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (searchText) params.set("q", searchText);
      else params.delete("q");
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const setOperator = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set("operator", value);
    else params.delete("operator");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="mb-4 flex flex-col gap-3">
      {lastChange && (
        <div className="self-start rounded-full border border-[#86EFAC] bg-[#DCFCE7] px-3 py-1.5 text-[12.5px] text-[#15803D]">
          {lastChange}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-55 max-w-85 flex-1">
          <Input
            size="sm"
            icon={SearchLg}
            placeholder="Search route id or name…"
            value={searchText}
            onChange={setSearchText}
            aria-label="Search routes"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!scoped && CHIPS.map((chip) => {
            const active = activeOperator === chip.value;
            return (
              <button
                key={chip.value}
                onClick={() => setOperator(chip.value)}
                className={cx(
                  "cursor-pointer rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
                  active
                    ? "border-[#152018] bg-[#152018] text-white"
                    : "border-[#D6DCD0] bg-white text-[#3D4A3F] hover:bg-[#F4F5F2]",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto text-[12.5px] text-[#5C6B5E]">
          {resultCount.toLocaleString()} routes
        </div>
      </div>
    </div>
  );
}

export type { OperatorCode };
