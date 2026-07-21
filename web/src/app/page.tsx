import { PublicMap } from "@/components/map/public-map";
import { getAccountData, type AccountData } from "@/lib/account";
import { CONSOLE_ROLES, type AppRole } from "@/lib/permissions";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  const role = (session?.user.role ?? "user") as AppRole;

  let account: AccountData | null = null;
  if (session) {
    account = await getAccountData(session.user.id);
  }

  return (
    <PublicMap
      user={
        session
          ? {
              name: session.user.name,
              email: session.user.email,
              hasConsoleAccess: CONSOLE_ROLES.includes(role),
            }
          : null
      }
      account={account}
    />
  );
}
