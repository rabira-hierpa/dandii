"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/base/avatar/avatar";
import { authClient } from "@/lib/auth-client";
import { ASSIGNABLE_ROLES, type AppRole } from "@/lib/permissions";
import { cx } from "@/utils/cx";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: string | null;
  banned?: boolean | null;
  createdAt: Date | string;
}

const ROLE_BADGES: Record<string, string> = {
  "super-admin": "bg-[#152018] text-white",
  admin: "bg-[#DCFCE7] text-[#166534]",
  "route-operator": "bg-[#DBEAFE] text-[#1E40AF]",
  maintainer: "bg-[#FEF3C7] text-[#92400E]",
  user: "bg-[#EEF1EA] text-[#3D4A3F]",
};

export function MembersTable({
  currentUserId,
  currentRole,
}: {
  currentUserId: string;
  currentRole: AppRole;
}) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const assignable = ASSIGNABLE_ROLES[currentRole] ?? [];

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await authClient.admin.listUsers({
      query: { limit: 200, sortBy: "createdAt", sortDirection: "desc" },
    });
    if (error) {
      setError(error.message ?? "Failed to load members");
    } else {
      setMembers((data?.users as MemberRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Admins cannot manage other admins/super-admins; nobody manages themselves. */
  const canManage = (member: MemberRow) => {
    if (member.id === currentUserId) return false;
    if (currentRole === "super-admin") return true;
    const memberRole = member.role ?? "user";
    return !["admin", "super-admin"].includes(memberRole);
  };

  const setRole = async (member: MemberRow, role: string) => {
    setBusyId(member.id);
    setError(null);
    const { error } = await authClient.admin.setRole({
      userId: member.id,
      role: role as AppRole,
    });
    if (error) setError(error.message ?? "Failed to set role");
    await load();
    setBusyId(null);
  };

  const toggleBan = async (member: MemberRow) => {
    setBusyId(member.id);
    setError(null);
    const { error } = member.banned
      ? await authClient.admin.unbanUser({ userId: member.id })
      : await authClient.admin.banUser({
          userId: member.id,
          banReason: "Banned from settings",
        });
    if (error) setError(error.message ?? "Failed to update ban state");
    await load();
    setBusyId(null);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-[#E2E6DE] bg-white p-8 text-center text-[13px] text-[#5C6B5E]">
        Loading members…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#991B1B]">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-[#E2E6DE] bg-white">
        <div className="grid min-w-150 grid-cols-[1.6fr_130px_150px_100px] items-center gap-3 border-b border-[#E2E6DE] bg-[#F8FAF6] px-5 py-2.5 text-[11.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
          <span>Member</span>
          <span>Role</span>
          <span>Change role</span>
          <span>Access</span>
        </div>
        {members.map((member) => {
          const role = member.role ?? "user";
          const manageable = canManage(member);
          return (
            <div
              key={member.id}
              className="grid min-w-150 grid-cols-[1.6fr_130px_150px_100px] items-center gap-3 border-b border-[#EEF1EA] px-5 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  size="sm"
                  src={member.image ?? undefined}
                  alt={member.name}
                  initials={member.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-[#1C2321]">
                      {member.name}
                    </span>
                    {member.id === currentUserId && (
                      <span className="rounded-full bg-[#EEF1EA] px-1.5 py-0.5 text-[10px] font-semibold text-[#5C6B5E]">
                        You
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[12px] text-[#5C6B5E]">
                    {member.email}
                  </div>
                </div>
              </div>

              <span
                className={cx(
                  "justify-self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                  ROLE_BADGES[role] ?? ROLE_BADGES.user,
                )}
              >
                {role}
              </span>

              {manageable && assignable.length > 0 ? (
                <select
                  value={role}
                  onChange={(e) => setRole(member, e.target.value)}
                  disabled={busyId === member.id}
                  className="cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-2 py-1.5 text-[12.5px] text-[#1C2321] disabled:opacity-50"
                >
                  {!assignable.includes(role as AppRole) && (
                    <option value={role} disabled>
                      {role}
                    </option>
                  )}
                  {assignable.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[12px] text-[#9AA69C]">—</span>
              )}

              {manageable ? (
                <button
                  onClick={() => toggleBan(member)}
                  disabled={busyId === member.id}
                  className={cx(
                    "cursor-pointer justify-self-start rounded-lg border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50",
                    member.banned
                      ? "border-[#86EFAC] bg-white text-[#15803D] hover:bg-[#F0FDF4]"
                      : "border-[#FCA5A5] bg-white text-[#B91C1C] hover:bg-[#FEF2F2]",
                  )}
                >
                  {member.banned ? "Unban" : "Ban"}
                </button>
              ) : (
                <span className="text-[12px] text-[#9AA69C]">—</span>
              )}
            </div>
          );
        })}
        {members.length === 0 && (
          <div className="p-8 text-center text-[13px] text-[#5C6B5E]">
            No members yet.
          </div>
        )}
      </div>
    </div>
  );
}
