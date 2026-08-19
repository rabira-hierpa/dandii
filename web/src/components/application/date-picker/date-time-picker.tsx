"use client";

import { useMemo, useState } from "react";
import {
  CalendarDateTime,
  getLocalTimeZone,
  today,
  toCalendarDate,
} from "@internationalized/date";
import { Calendar as CalendarIcon } from "@untitledui/icons";
import { useDateFormatter } from "react-aria";
import type { DateValue } from "react-aria-components";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import { Calendar } from "./calendar";

function toCalendarDateTimeFromDate(date: Date): CalendarDateTime {
  return new CalendarDateTime(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  );
}

function toJsDate(value: CalendarDateTime): Date {
  return value.toDate(getLocalTimeZone());
}

function startOfMinute(date: Date): Date {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

function clampToMin(
  value: CalendarDateTime,
  min: Date | undefined,
): CalendarDateTime {
  if (!min) return value;
  const js = toJsDate(value);
  return js < min ? toCalendarDateTimeFromDate(min) : value;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export interface DateTimePickerProps {
  value: Date;
  onChange: (value: Date) => void;
  /** Earliest selectable instant (past dates/times are blocked). */
  minValue?: Date;
  label?: string;
  className?: string;
  isInvalid?: boolean;
}

/**
 * Console-themed date+time picker. Replaces the browser's blue
 * `datetime-local` UI with the app calendar (brand green) plus hour/minute
 * selects, and enforces `minValue` so operators can't schedule into the past.
 */
export function DateTimePicker({
  value,
  onChange,
  minValue,
  label,
  className,
  isInvalid,
}: DateTimePickerProps) {
  const formatter = useDateFormatter({
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const [draft, setDraft] = useState(() => toCalendarDateTimeFromDate(value));
  const minDate = useMemo(
    () =>
      minValue
        ? toCalendarDate(toCalendarDateTimeFromDate(minValue))
        : undefined,
    [minValue],
  );
  const highlighted = useMemo(() => [today(getLocalTimeZone())], []);

  const openWithValue = () => {
    setDraft(clampToMin(toCalendarDateTimeFromDate(value), minValue));
  };

  const setDatePart = (date: DateValue) => {
    const calendarDate = toCalendarDate(date);
    const next = new CalendarDateTime(
      calendarDate.year,
      calendarDate.month,
      calendarDate.day,
      draft.hour,
      draft.minute,
    );
    setDraft(clampToMin(next, minValue));
  };

  const setHour = (hour: number) => {
    setDraft(clampToMin(draft.set({ hour }), minValue));
  };

  const setMinute = (minute: number) => {
    setDraft(clampToMin(draft.set({ minute }), minValue));
  };

  const setNow = () => {
    const now = startOfMinute(new Date());
    const floor = minValue && minValue > now ? minValue : now;
    setDraft(toCalendarDateTimeFromDate(floor));
  };

  const apply = (close: () => void) => {
    const next = clampToMin(draft, minValue);
    onChange(toJsDate(next));
    close();
  };

  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {label && (
        <span className="text-xs font-semibold text-[#5C6B5E]">{label}</span>
      )}
      <AriaDialogTrigger onOpenChange={(open) => open && openWithValue()}>
        <AriaButton
          className={cx(
            "flex w-full cursor-pointer items-center gap-2 rounded-lg border bg-white px-2.5 py-2 text-left text-xs font-normal text-[#1C2321] outline-hidden transition",
            isInvalid
              ? "border-[#FCA5A5] ring-1 ring-[#FECACA]"
              : "border-[#D6DCD0] hover:border-[#B7C0B2] focus-visible:border-[#15803D] focus-visible:ring-2 focus-visible:ring-[#15803D]/30",
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 text-[#5C6B5E]" />
          <span className="min-w-0 flex-1 truncate">
            {formatter.format(value)}
          </span>
        </AriaButton>
        <AriaPopover
          placement="bottom start"
          offset={6}
          className={({ isEntering, isExiting }) =>
            cx(
              "z-50 origin-(--trigger-anchor-point) will-change-transform",
              isEntering &&
                "duration-150 ease-out animate-in fade-in slide-in-from-top-0.5",
              isExiting &&
                "duration-100 ease-in animate-out fade-out slide-out-to-top-0.5",
            )
          }
        >
          <AriaDialog
            aria-label={label ?? "Date and time"}
            className="rounded-xl bg-white shadow-xl ring-1 ring-[#E2E6DE] outline-hidden"
          >
            {({ close }) => (
              <div className="flex flex-col">
                <div className="flex gap-4 p-4 max-sm:flex-col">
                  <Calendar
                    value={toCalendarDate(draft)}
                    onChange={setDatePart}
                    minValue={minDate}
                    highlightedDates={highlighted}
                    className="shrink-0"
                  >
                    <div className="flex gap-2">
                      <Button
                        slot={null}
                        size="sm"
                        color="secondary"
                        onClick={setNow}
                      >
                        Now
                      </Button>
                    </div>
                  </Calendar>

                  <div className="flex min-w-28 flex-col gap-3 border-l border-[#E2E6DE] pl-4 max-sm:border-t max-sm:border-l-0 max-sm:pt-3 max-sm:pl-0">
                    <div className="text-[11px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
                      Time
                    </div>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
                      Hour
                      <select
                        value={draft.hour}
                        onChange={(e) => setHour(Number(e.target.value))}
                        className="cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-2 py-1.5 text-[13px] font-medium text-[#1C2321] outline-hidden focus:border-[#15803D] focus:ring-2 focus:ring-[#15803D]/25"
                      >
                        {HOURS.map((hour) => (
                          <option key={hour} value={hour}>
                            {String(hour).padStart(2, "0")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
                      Minute
                      <select
                        value={draft.minute}
                        onChange={(e) => setMinute(Number(e.target.value))}
                        className="cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-2 py-1.5 text-[13px] font-medium text-[#1C2321] outline-hidden focus:border-[#15803D] focus:ring-2 focus:ring-[#15803D]/25"
                      >
                        {MINUTES.map((minute) => (
                          <option key={minute} value={minute}>
                            {String(minute).padStart(2, "0")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-[11px] leading-snug text-[#7E9182]">
                      Past dates and times are disabled.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-[#E2E6DE] p-3">
                  <Button size="sm" color="secondary" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    color="primary"
                    onClick={() => apply(close)}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </AriaDialog>
        </AriaPopover>
      </AriaDialogTrigger>
    </div>
  );
}
