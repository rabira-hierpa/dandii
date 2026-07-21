"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Bookmark,
  ClockRewind,
  LogOut01,
  Share01,
  User01,
  X as CloseX,
} from "@untitledui/icons";
import {
  markSubmissionsViewed,
  toggleSavedRoute,
} from "@/actions/saved-routes";
import { RouteChip } from "@/components/console/route-chip";
import { authClient } from "@/lib/auth-client";
import type { AccountData, SubmissionItem } from "@/lib/account";
import type { OperatorCode } from "@/lib/operators";
import {
  clearRecentSearches,
  readRecentSearches,
  type RecentSearch,
} from "@/lib/recent-searches";

interface AccountDrawerProps {
  user: { name: string; email: string; hasConsoleAccess: boolean };
  account: AccountData;
  /** The route currently selected on the map (for the Share section). */
  selectedRoute: { id: string; shortName: string } | null;
  onOpenRoute: (routeId: string) => void;
  onRunSearch: (q: string) => void;
}

const STATUS_STYLE: Record<
  SubmissionItem["status"],
  { bg: string; fg: string; label: string }
> = {
  PENDING: { bg: "#FEF3C7", fg: "#92400E", label: "Pending" },
  APPROVED: { bg: "#DCFCE7", fg: "#166534", label: "Approved" },
  REJECTED: { bg: "#FEE2E2", fg: "#991B1B", label: "Rejected" },
  SUPERSEDED: { bg: "#E8EAED", fg: "#5F6368", label: "Resolved" },
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[#5F6368] uppercase">
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[#F8F9FA] px-3 py-3 text-[12.5px] leading-snug text-[#5F6368]">
      {children}
    </div>
  );
}

export function AccountDrawer({
  user,
  account,
  selectedRoute,
  onOpenRoute,
  onRunSearch,
}: AccountDrawerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [, startTransition] = useTransition();
  const initials = user.name.charAt(0).toUpperCase();

  // Sync the badge from the server prop across router.refresh() cycles
  // (render-time sync — the React-recommended alternative to a setState effect).
  const [badge, setBadge] = useState(account.unseenCount);
  const [prevUnseen, setPrevUnseen] = useState(account.unseenCount);
  if (account.unseenCount !== prevUnseen) {
    setPrevUnseen(account.unseenCount);
    setBadge(account.unseenCount);
  }

  // Opening the drawer reads recents and clears the unseen badge (D2).
  const openDrawer = () => {
    setOpen(true);
    setRecents(readRecentSearches());
    if (badge > 0) {
      setBadge(0);
      startTransition(async () => {
        await markSubmissionsViewed();
        router.refresh();
      });
    }
  };

  const unsave = (routeId: string) => {
    startTransition(async () => {
      await toggleSavedRoute({ routeId });
      router.refresh();
    });
  };

  const shareUrl = useMemo(
    () =>
      selectedRoute && typeof window !== "undefined"
        ? `${window.location.origin}/?route=${selectedRoute.id}`
        : null,
    [selectedRoute],
  );

  const copyShare = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const signOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <button
        aria-label={
          badge > 0 ? `Account — ${badge} submission updates` : "Account"
        }
        onClick={openDrawer}
        className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-[#152018] text-[15px] font-bold text-white shadow-[0_1px_6px_rgba(0,0,0,0.25)] sm:size-10 sm:text-[13px]"
      >
        {initials}
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-[#D93025] px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {badge}
          </span>
        )}
      </button>

      {/* Portal to <body> so the fixed overlay escapes the top-bar's
          z-20 stacking context (otherwise the bottom sheet renders on top). */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  className="fixed inset-0 z-[60] bg-black/30"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setOpen(false)}
                />
                <motion.aside
                  className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-96 flex-col bg-white shadow-2xl sm:max-w-90"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", stiffness: 380, damping: 38 }}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 border-b border-[#EEF1EA] px-4 py-3.5">
                    <span className="flex size-10 items-center justify-center rounded-full bg-[#152018] text-[14px] font-bold text-white">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-[#202124]">
                        {user.name}
                      </div>
                      <div className="truncate text-[12px] text-[#5F6368]">
                        {user.email}
                      </div>
                    </div>
                    <button
                      aria-label="Close account"
                      onClick={() => setOpen(false)}
                      className="cursor-pointer rounded-full p-1.5 text-[#5F6368] hover:bg-[#F1F3F4]"
                    >
                      <CloseX className="size-5" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                    {/* Saved routes */}
                    <SectionHeader>
                      <Bookmark className="size-3.5" /> Saved routes
                    </SectionHeader>
                    {account.savedRoutes.length === 0 ? (
                      <EmptyHint>
                        No saved routes yet — tap the star on any route to save
                        it here.
                      </EmptyHint>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {account.savedRoutes.map((r) => (
                          <div
                            key={r.routeId}
                            className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-[#F8F9FA]"
                          >
                            <button
                              onClick={() => {
                                onOpenRoute(r.routeId);
                                setOpen(false);
                              }}
                              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                            >
                              <RouteChip
                                shortName={r.shortName}
                                operatorCode={
                                  r.operatorCode as OperatorCode | null
                                }
                                size="sm"
                              />
                              <span className="min-w-0 truncate text-[13px] text-[#202124]">
                                {r.longName}
                              </span>
                            </button>
                            <button
                              aria-label={`Unsave ${r.shortName}`}
                              onClick={() => unsave(r.routeId)}
                              className="cursor-pointer rounded-lg p-1 text-[#9AA69C] hover:text-[#D93025]"
                            >
                              <CloseX className="size-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* My submissions */}
                    <SectionHeader>My fare submissions</SectionHeader>
                    {account.submissions.length === 0 ? (
                      <EmptyHint>
                        No fare edits yet — open any route and suggest a
                        correction when the posted fare has changed.
                      </EmptyHint>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {account.submissions.map((s) => {
                          const st = STATUS_STYLE[s.status];
                          return (
                            <div
                              key={s.id}
                              className="rounded-xl border border-[#EEF1EA] px-3 py-2.5"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[12px] font-semibold text-[#1C2321]">
                                  {s.routeShortName}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[12px] text-[#5F6368]">
                                  {s.proposedLabel}
                                </span>
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                  style={{ background: st.bg, color: st.fg }}
                                >
                                  {st.label}
                                </span>
                              </div>
                              {s.reviewNote && (
                                <div className="mt-1 text-[11.5px] text-[#5F6368]">
                                  {s.reviewNote}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Recent searches */}
                    <SectionHeader>
                      <ClockRewind className="size-3.5" /> Recent searches
                    </SectionHeader>
                    {recents.length === 0 ? (
                      <EmptyHint>
                        Your recent searches will show here.
                      </EmptyHint>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {recents.map((r) => (
                          <button
                            key={r.at}
                            onClick={() => {
                              onRunSearch(r.q);
                              setOpen(false);
                            }}
                            className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] text-[#202124] hover:bg-[#F8F9FA]"
                          >
                            <ClockRewind className="size-4 text-[#9AA69C]" />
                            {r.q}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            clearRecentSearches();
                            setRecents([]);
                          }}
                          className="mt-1 cursor-pointer self-start px-2 text-[12px] font-medium text-[#5F6368] hover:text-[#D93025]"
                        >
                          Clear history
                        </button>
                      </div>
                    )}

                    {/* Share */}
                    <SectionHeader>
                      <Share01 className="size-3.5" /> Share a route
                    </SectionHeader>
                    {selectedRoute ? (
                      <button
                        onClick={copyShare}
                        className="w-full cursor-pointer rounded-xl bg-[#1A73E8] py-2 text-[13px] font-semibold text-white hover:bg-[#1765CC]"
                      >
                        {copied
                          ? "Link copied ✓"
                          : `Copy link to ${selectedRoute.shortName}`}
                      </button>
                    ) : (
                      <EmptyHint>
                        Select a route on the map to share a direct link to it.
                      </EmptyHint>
                    )}

                    {/* Profile + console + sign out */}
                    <SectionHeader>
                      <User01 className="size-3.5" /> Account
                    </SectionHeader>
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href="/profile"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-2 py-2 text-[13px] font-medium text-[#202124] hover:bg-[#F8F9FA]"
                      >
                        <User01 className="size-4 text-[#5F6368]" /> Manage
                        profile
                      </Link>
                      {user.hasConsoleAccess && (
                        <Link
                          href="/console"
                          onClick={() => setOpen(false)}
                          className="rounded-xl px-2 py-2 pl-8 text-[13px] font-medium text-[#202124] hover:bg-[#F8F9FA]"
                        >
                          Operations console
                        </Link>
                      )}
                      <button
                        onClick={signOut}
                        className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-left text-[13px] font-medium text-[#202124] hover:bg-[#F8F9FA]"
                      >
                        <LogOut01 className="size-4 text-[#5F6368]" /> Sign out
                      </button>
                    </div>
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
