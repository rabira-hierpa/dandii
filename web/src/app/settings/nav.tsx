"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail01, Settings01, User01, Users01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const ITEMS = [
  { href: "/settings/profile", key: "profile", icon: User01 },
  { href: "/settings/members", key: "members", icon: Users01 },
  { href: "/settings/invitations", key: "invitations", icon: Mail01 },
  { href: "/settings/system", key: "system", icon: Settings01 },
];

export function SettingsNav() {
  const t = useTranslations("settings");
  const pathname = usePathname();
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5 max-md:w-full max-md:flex-row">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium",
              active
                ? "bg-[#E8ECE6] font-semibold text-[#1C2321]"
                : "text-[#3D4A3F] hover:bg-[#EEF1EA]",
            )}
          >
            <Icon className="size-4 text-[#5C6B5E]" />
            {t(`nav.${item.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
