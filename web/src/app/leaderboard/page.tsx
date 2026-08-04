import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@untitledui/icons";
import { DandiiLogo } from "@/components/foundations/logo/dandii-logo";
import { TransitBackdrop } from "@/components/foundations/transit-backdrop";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard";
import { getSession } from "@/lib/session";
import { cx } from "@/utils/cx";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contributor leaderboard",
  description:
    "Riders keeping Addis Ababa fares accurate, ranked by approved contributions.",
};

function medalFor(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return null;
}

function Row({ entry }: Readonly<{ entry: LeaderboardEntry }>) {
  const medal = medalFor(entry.rank);
  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-xl px-3.5 py-3",
        entry.isViewer
          ? "bg-[#E8F0FE] ring-1 ring-[#1A73E8]/30"
          : "bg-white/70 ring-1 ring-black/5",
      )}
    >
      <span className="w-8 shrink-0 text-center text-[15px] font-bold tabular-nums text-[#5F6368]">
        {medal ?? entry.rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-[#202124]">
          {entry.name}
          {entry.isViewer && (
            <span className="ml-1.5 text-[12px] font-medium text-[#1A73E8]">
              you
            </span>
          )}
        </span>
        <span className="block truncate text-[12px] text-[#5F6368]">
          Level {entry.level} · {entry.title} · {entry.approvedCount} approved
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[16px] font-bold tabular-nums text-[#15803D]">
          {entry.points}
        </span>
        <span className="block text-[11px] text-[#5F6368]">points</span>
      </span>
    </div>
  );
}

export default async function LeaderboardPage() {
  const session = await getSession();
  const { entries, viewerEntry, viewerOptedIn } = await getLeaderboard(
    session?.user.id,
  );

  return (
    <TransitBackdrop watermark={false}>
      <div className="status-rise relative z-1 mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12 max-sm:px-5 max-sm:py-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-brand-700">
            <DandiiLogo />
          </Link>
          <Link
            href="/"
            className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to map
          </Link>
        </div>

        <div>
          <h1 className="font-display text-display-sm font-bold tracking-tight text-primary max-sm:text-display-xs">
            Fare Scouts
          </h1>
          <p className="mt-1.5 max-w-prose text-md leading-relaxed text-tertiary">
            Riders keeping Addis fares accurate. Ranked by points earned from
            approved fare corrections.
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 p-4 shadow-lg ring-1 ring-black/5 backdrop-blur-sm">
          {entries.length === 0 ? (
            <p className="px-1 py-6 text-center text-[13px] text-[#5F6368]">
              No one has joined the leaderboard yet. Submit a fare correction
              and opt in from your profile to be the first.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {entries.map((e) => (
                <Row key={e.userId} entry={e} />
              ))}
              {viewerEntry && (
                <>
                  <div className="py-1 text-center text-[12px] text-[#9AA0A6]">
                    ···
                  </div>
                  <Row entry={viewerEntry} />
                </>
              )}
            </div>
          )}
        </div>

        {session && !viewerOptedIn && (
          <p className="text-sm text-quaternary">
            You&rsquo;re not on the leaderboard.{" "}
            <Link
              href="/profile"
              className="font-semibold text-brand-700 hover:text-brand-800"
            >
              Join it from your profile
            </Link>{" "}
            — your contributions stay private until you do.
          </p>
        )}
        {!session && (
          <p className="text-sm text-quaternary">
            <Link
              href="/sign-in"
              className="font-semibold text-brand-700 hover:text-brand-800"
            >
              Sign in
            </Link>{" "}
            to start earning points for fare corrections.
          </p>
        )}
      </div>
    </TransitBackdrop>
  );
}
