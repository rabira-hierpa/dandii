import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@untitledui/icons";
import { DandiiLogo } from "@/components/foundations/logo/dandii-logo";
import { LocaleToggle } from "@/components/foundations/locale-toggle";
import { TransitBackdrop } from "@/components/foundations/transit-backdrop";
import { getAccountData } from "@/lib/account";
import { CONSOLE_ROLES, type AppRole } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { LeaderboardToggle } from "./leaderboard-toggle";
import { MarkSubmissionsViewed } from "./mark-viewed";
import { ProfileForm } from "./profile-form";
import { SubmissionList } from "./submission-list";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callbackURL=/profile");

  const role = (session.user.role ?? "user") as AppRole;
  const hasConsoleAccess = CONSOLE_ROLES.includes(role);
  const account = await getAccountData(session.user.id);
  const contributions = account.contributions;

  const approved = account.submissions.filter(
    (s) => s.status === "APPROVED",
  ).length;
  const pending = account.submissions.filter(
    (s) => s.status === "PENDING",
  ).length;

  return (
    <TransitBackdrop watermark={false}>
      {account.unseenCount > 0 && <MarkSubmissionsViewed />}
      <div className="status-rise relative z-1 mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12 max-sm:px-5 max-sm:py-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-brand-700">
            <DandiiLogo />
          </Link>
          <div className="flex items-center gap-3">
            <LocaleToggle />
            <Link
              href="/"
              className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:underline"
            >
              <ArrowLeft className="size-4" /> Back to map
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-full bg-[#152018] text-[20px] font-bold text-white">
            {session.user.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-[#202124]">
              {session.user.name}
            </h1>
            <p className="truncate text-[13px] text-[#5F6368]">
              {session.user.email}
            </p>
          </div>
        </div>

        {/* My Contributions — the rewards ladder (R1). */}
        <section className="rounded-2xl bg-white/80 p-5 shadow-lg ring-1 ring-black/5 backdrop-blur-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-[#202124]">
                My Contributions
              </h2>
              <p className="mt-0.5 text-[12.5px] text-[#5F6368]">
                Level {contributions.level} ·{" "}
                <span className="font-semibold text-[#15803D]">
                  {contributions.title}
                </span>
              </p>
            </div>
            <div className="text-right">
              <div className="text-[26px] leading-none font-bold tabular-nums text-[#202124]">
                {contributions.points}
              </div>
              <div className="text-[11.5px] text-[#5F6368]">points</div>
            </div>
          </div>

          {/* Progress to the next level */}
          <div className="mt-3">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-[#E8F0EA]"
              role="progressbar"
              aria-valuenow={contributions.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress to level ${contributions.level + 1}`}
            >
              <div
                className="h-full rounded-full bg-[#15803D] transition-[width] duration-500"
                style={{ width: `${contributions.percent}%` }}
              />
            </div>
            <p className="mt-1.5 text-[12px] text-[#5F6368]">
              {contributions.toNext != null
                ? `${contributions.toNext} points to level ${contributions.level + 1}`
                : "Top level reached — thank you for keeping Addis fares accurate."}
            </p>
          </div>

          {/* Impact line: what these contributions actually did */}
          {contributions.approvedCount > 0 && (
            <p className="mt-3 rounded-lg bg-[#F3F8F1] px-3 py-2 text-[12.5px] text-[#15803D]">
              {contributions.approvedCount} approved{" "}
              {contributions.approvedCount === 1 ? "fare is" : "fares are"} live
              on {contributions.routesImproved}{" "}
              {contributions.routesImproved === 1 ? "route" : "routes"}.
            </p>
          )}
          {contributions.approvedCount === 0 && (
            <p className="mt-3 text-[12.5px] text-[#5F6368]">
              Suggest a fare correction from any route to start earning points.
            </p>
          )}

          {/* Streak — consecutive weeks with an approved contribution (R2) */}
          {contributions.streakWeeks > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-[#B45309]">
              <span aria-hidden>🔥</span>
              {contributions.streakWeeks}-week streak
              <span className="font-normal text-[#5F6368]">
                — keep it alive with an edit this week.
              </span>
            </p>
          )}

          {/* Badges */}
          {contributions.badges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {contributions.badges.map((b) => (
                <span
                  key={b.badge}
                  title={`Earned ${new Date(b.earnedAt).toLocaleDateString()}`}
                  className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[11.5px] font-semibold text-[#92400E]"
                >
                  {b.label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 border-t border-[#EEF1EA] pt-3">
            <LeaderboardToggle initialOptIn={contributions.leaderboardOptIn} />
          </div>
        </section>

        {/* Contribution summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Saved routes", value: account.savedRoutes.length },
            { label: "Fare edits", value: account.submissions.length },
            { label: "Approved", value: approved },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-white/80 p-4 text-center shadow-sm ring-1 ring-black/5 backdrop-blur-sm"
            >
              <div className="text-[26px] font-bold tabular-nums text-[#202124]">
                {stat.value}
              </div>
              <div className="text-[12px] text-[#5F6368]">{stat.label}</div>
            </div>
          ))}
        </div>

        <ProfileForm initialName={session.user.name} />

        {/* Submitted fares — the avatar dropdown links here (#submissions). */}
        <div
          id="submissions"
          className="scroll-mt-6 rounded-2xl bg-white/80 p-5 shadow-lg ring-1 ring-black/5 backdrop-blur-sm"
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#202124]">
              Submitted fares
            </h2>
            {pending > 0 && (
              <span className="text-[12.5px] text-[#5F6368]">
                {pending} awaiting review
              </span>
            )}
          </div>
          <p className="mb-3 text-[12.5px] text-[#5F6368]">
            Select an edit to see the route and what you changed.
          </p>
          <SubmissionList submissions={account.submissions} />
        </div>

        {hasConsoleAccess && (
          <Link
            href="/console"
            className="w-fit rounded-full bg-[#152018] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#24352A]"
          >
            Open operations console
          </Link>
        )}
      </div>
    </TransitBackdrop>
  );
}
