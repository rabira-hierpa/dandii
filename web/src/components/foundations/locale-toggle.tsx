"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { setLocale } from "@/actions/locale";
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, type Locale } from "@/i18n/config";
import { cx } from "@/utils/cx";

/**
 * EN / አማርኛ switch. Two locales, so a segmented control beats a dropdown —
 * the alternative is always visible and one tap away.
 */
export function LocaleToggle({ className }: Readonly<{ className?: string }>) {
  const active = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label="Language"
      className={cx(
        "flex shrink-0 rounded-full bg-[#F1F3F4] p-0.5",
        isPending && "opacity-60",
        className,
      )}
    >
      {LOCALES.map((locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-label={LOCALE_LABELS[locale]}
            aria-pressed={isActive}
            disabled={isPending || isActive}
            onClick={() =>
              startTransition(async () => {
                await setLocale({ locale });
              })
            }
            className={cx(
              "cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
              isActive
                ? "bg-white text-[#1A73E8] shadow-sm"
                : "text-[#5F6368] hover:text-[#202124]",
            )}
          >
            {LOCALE_SHORT[locale]}
          </button>
        );
      })}
    </div>
  );
}
