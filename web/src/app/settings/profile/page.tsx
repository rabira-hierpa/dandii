import { SETTINGS_ROLES } from "@/lib/permissions";
import { requireRole } from "@/lib/session";

export default async function ProfileSettingsPage() {
  const { session, role } = await requireRole(SETTINGS_ROLES);

  const fields = [
    { label: "Name", value: session.user.name },
    { label: "Email", value: session.user.email },
    { label: "Role", value: role },
    {
      label: "Member since",
      value: new Date(session.user.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div>
      <h1 className="text-lg font-bold text-[#1C2321]">Profile</h1>
      <p className="mt-1 text-[13px] text-[#5C6B5E]">
        Your account details come from Google sign-in.
      </p>
      <div className="mt-5 divide-y divide-[#EEF1EA] rounded-xl border border-[#E2E6DE] bg-white">
        {fields.map((field) => (
          <div key={field.label} className="flex items-center gap-4 px-5 py-3.5">
            <span className="w-32 text-[12.5px] font-semibold text-[#5C6B5E]">
              {field.label}
            </span>
            <span className="text-[13.5px] text-[#1C2321]">{field.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
