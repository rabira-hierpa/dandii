import { SETTINGS_ROLES } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { MembersTable } from "./members-table";

export default async function MembersSettingsPage() {
  const { session, role } = await requireRole(SETTINGS_ROLES);

  return (
    <div>
      <h1 className="text-lg font-bold text-[#1C2321]">Members</h1>
      <p className="mt-1 text-[13px] text-[#5C6B5E]">
        Manage who can access the operations console and what they can do.
        {role === "admin" &&
          " Admins can manage roles below admin; only super-admins manage admins."}
      </p>
      <div className="mt-5">
        <MembersTable currentUserId={session.user.id} currentRole={role} />
      </div>
    </div>
  );
}
