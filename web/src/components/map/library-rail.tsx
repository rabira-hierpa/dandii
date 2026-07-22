"use client";

import Link from "next/link";
import { BankNote02, Bookmark, Clock, Menu01 } from "@untitledui/icons";
import type { AccountData, SubmissionItem } from "@/lib/account";
import type { OperatorCode } from "@/lib/operators";
import { clearRecentSearches, type RecentSearch } from "@/lib/recent-searches";
import { cx } from "@/utils/cx";
import { RouteChip } from "@/components/console/route-chip";
import { SearchLg } from "@untitledui/icons";

export type LibrarySection = "saved" | "recent" | "submissions";

const STATUS_LABEL: Record<SubmissionItem["status"], string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
};

const STATUS_CLASS: Record<SubmissionItem["status"], string> = {
  PENDING: "bg-[#FEF7E0] text-[#B06000]",
  APPROVED: "bg-[#E6F4EA] text-[#137333]",
  REJECTED: "bg-[#FCE8E6] text-[#C5221F]",
  SUPERSEDED: "bg-[#F1F3F4] text-[#5F6368]",
};

/** Hamburger control that sits immediately before the brand wordmark. */
export function LibraryMenuButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close library" : "Open library"}
      aria-expanded={open}
      className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#5F6368] hover:bg-[#F1F3F4] hover:text-[#202124]"
    >
      <Menu01 className="size-5" />
    </button>
  );
}

/**
 * Narrow icon strip (Saved / Recent / Fare submissions). Lives on the left
 * edge of the explore panel when the hamburger is open.
 */
export function LibraryIconRail({
  section,
  onSelect,
  unseenCount,
  signedIn,
}: {
  section: LibrarySection | null;
  onSelect: (section: LibrarySection) => void;
  unseenCount: number;
  signedIn: boolean;
}) {
  const items: {
    id: LibrarySection;
    label: string;
    icon: typeof Bookmark;
    badge?: number;
    requiresAuth?: boolean;
  }[] = [
    { id: "saved", label: "Saved routes", icon: Bookmark, requiresAuth: true },
    { id: "recent", label: "Recent searches", icon: Clock },
    {
      id: "submissions",
      label: "Fare submissions",
      icon: BankNote02,
      badge: unseenCount,
      requiresAuth: true,
    },
  ];

  return (
    <nav
      aria-label="Library"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[#EEF1EA] bg-[#FAFBFA] py-3 max-sm:w-11"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = section === item.id;
        const disabled = item.requiresAuth && !signedIn;
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            title={
              disabled ? "Sign in to use this" : item.label
            }
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(item.id)}
            className={cx(
              "relative flex size-9 cursor-pointer items-center justify-center rounded-xl transition-colors",
              disabled && "cursor-not-allowed opacity-40",
              active
                ? "bg-[#E8F0FE] text-[#1A73E8]"
                : "text-[#5F6368] hover:bg-[#F1F3F4] hover:text-[#202124]",
            )}
          >
            <Icon className="size-5" />
            {item.badge != null && item.badge > 0 && (
              <span className="absolute top-0.5 right-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-[#D93025] px-0.5 text-[9px] font-bold text-white">
                {item.badge > 9 ? "9+" : item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/** Body lists for each library section — same visual language as the old sidebar. */
export function LibraryPanel({
  section,
  account,
  recents,
  onSelectRoute,
  onSelectRecent,
  signedIn,
}: {
  section: LibrarySection;
  account: AccountData | null;
  recents: RecentSearch[];
  onSelectRoute: (routeId: string) => void;
  onSelectRecent: (q: string) => void;
  signedIn: boolean;
}) {
  if (section === "saved") {
    if (!signedIn) {
      return <SignInPrompt action="save routes" />;
    }
    const saved = account?.savedRoutes ?? [];
    return (
      <div className="flex flex-col gap-0.5">
        <div className="text-[10.5px] font-semibold tracking-wide text-[#5F6368] uppercase">
          Saved routes
        </div>
        {saved.length === 0 ? (
          <p className="py-3 text-[13px] text-[#80868B]">
            No saved routes yet. Open a route and tap the bookmark.
          </p>
        ) : (
          saved.map((r) => (
            <button
              key={r.routeId}
              type="button"
              onClick={() => onSelectRoute(r.routeId)}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-[#F8F9FA]"
            >
              <RouteChip
                shortName={r.shortName}
                operatorCode={r.operatorCode as OperatorCode | null}
                size="sm"
              />
              <span className="min-w-0 truncate text-[13px] text-[#202124]">
                {r.longName}
              </span>
            </button>
          ))
        )}
      </div>
    );
  }

  if (section === "recent") {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <div className="text-[10.5px] font-semibold tracking-wide text-[#5F6368] uppercase">
            Recent searches
          </div>
          {recents.length > 0 && (
            <button
              type="button"
              onClick={() => clearRecentSearches()}
              className="cursor-pointer text-[11px] font-medium text-[#5F6368] hover:text-[#D93025]"
            >
              Clear
            </button>
          )}
        </div>
        {recents.length === 0 ? (
          <p className="py-3 text-[13px] text-[#80868B]">
            Searches you run show up here.
          </p>
        ) : (
          recents.map((r) => (
            <button
              key={r.at}
              type="button"
              onClick={() => onSelectRecent(r.q)}
              className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] text-[#202124] hover:bg-[#F8F9FA]"
            >
              <SearchLg className="size-4 text-[#9AA69C]" />
              <span className="min-w-0 truncate">{r.q}</span>
            </button>
          ))
        )}
      </div>
    );
  }

  // submissions
  if (!signedIn) {
    return <SignInPrompt action="track fare edits" />;
  }
  const submissions = account?.submissions ?? [];
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] font-semibold tracking-wide text-[#5F6368] uppercase">
          Fare submissions
        </div>
        <Link
          href="/profile#submissions"
          className="text-[11px] font-medium text-[#1A73E8] hover:underline"
        >
          All
        </Link>
      </div>
      {submissions.length === 0 ? (
        <p className="py-3 text-[13px] text-[#80868B]">
          Fare edits you propose appear here after review.
        </p>
      ) : (
        submissions.slice(0, 12).map((s) => (
          <Link
            key={s.id}
            href="/profile#submissions"
            className="flex flex-col gap-0.5 rounded-xl px-2 py-2 hover:bg-[#F8F9FA]"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#202124]">
                {s.routeShortName}
                <span className="ml-1.5 font-normal text-[#5F6368]">
                  {s.routeLongName}
                </span>
              </span>
              <span
                className={cx(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  STATUS_CLASS[s.status],
                )}
              >
                {STATUS_LABEL[s.status]}
              </span>
            </div>
            <div className="truncate text-[11.5px] text-[#5F6368]">
              {s.proposedLabel}
            </div>
          </Link>
        ))
      )}
    </div>
  );
}

function SignInPrompt({ action }: { action: string }) {
  return (
    <p className="py-3 text-[13px] text-[#80868B]">
      <Link href="/sign-in" className="font-semibold text-[#1A73E8] hover:underline">
        Sign in
      </Link>{" "}
      to {action}.
    </p>
  );
}
