import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@untitledui/icons";
import { getAccountData } from "@/lib/account";
import { CONSOLE_ROLES, type AppRole } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

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

        {pending > 0 && (
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <div className="text-[13px] text-[#5F6368]">
              You have{" "}
              <span className="font-semibold text-[#202124]">{pending}</span>{" "}
              fare {pending === 1 ? "edit" : "edits"} awaiting review. Track
              {" "}
              {pending === 1 ? "it" : "them"} from the account panel on the map.
            </div>
          </div>
        )}

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
