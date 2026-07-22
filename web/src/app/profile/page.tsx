import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@untitledui/icons";
import { getAccountData, type SubmissionItem } from "@/lib/account";
import { CONSOLE_ROLES, type AppRole } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { MarkSubmissionsViewed } from "./mark-viewed";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<
  SubmissionItem["status"],
  { bg: string; fg: string; label: string }
> = {
  PENDING: { bg: "#FEF3C7", fg: "#92400E", label: "Pending" },
  APPROVED: { bg: "#DCFCE7", fg: "#166534", label: "Approved" },
  REJECTED: { bg: "#FEE2E2", fg: "#991B1B", label: "Rejected" },
  SUPERSEDED: { bg: "#E8EAED", fg: "#5F6368", label: "Resolved" },
};

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?callbackURL=/profile");

  const role = (session.user.role ?? "user") as AppRole;
  const hasConsoleAccess = CONSOLE_ROLES.includes(role);
  const account = await getAccountData(session.user.id);

  const approved = account.submissions.filter(
    (s) => s.status === "APPROVED",
  ).length;
  const pending = account.submissions.filter(
    (s) => s.status === "PENDING",
  ).length;

  return (
    <div className="min-h-dvh bg-[#F1F3F4]">
      {account.unseenCount > 0 && <MarkSubmissionsViewed />}
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <Link
          href="/"
          className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[#1A73E8] hover:underline"
        >
          <ArrowLeft className="size-4" /> Back to map
        </Link>

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

        {/* Contribution summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Saved routes", value: account.savedRoutes.length },
            { label: "Fare edits", value: account.submissions.length },
            { label: "Approved", value: approved },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-black/5"
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
          className="scroll-mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#202124]">
              Submitted fares
            </h2>
            {pending > 0 && (
              <span className="text-[12.5px] text-[#5F6368]">
                {pending} awaiting review
              </span>
            )}
          </div>
          {account.submissions.length === 0 ? (
            <p className="text-[13px] text-[#5F6368]">
              No fare edits yet — open any route on the map and suggest a
              correction when the posted fare has changed.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {account.submissions.map((s) => {
                const st = STATUS_STYLE[s.status];
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-[#EEF1EA] px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12.5px] font-semibold text-[#1C2321]">
                        {s.routeShortName}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#5F6368]">
                        {s.proposedLabel}
                      </span>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
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
    </div>
  );
}
