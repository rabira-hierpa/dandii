"use client";

import { useRouter } from "next/navigation";
import { Button as AriaButton } from "react-aria-components";
import { LogOut01, User01, Building07, BankNote02 } from "@untitledui/icons";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { authClient } from "@/lib/auth-client";

interface AccountMenuProps {
  user: { name: string; email: string; hasConsoleAccess: boolean };
  /** Fare submissions decided since the user last viewed them (D2 badge). */
  unseenCount: number;
}

/**
 * Top-right account control: an avatar button that opens a compact dropdown
 * (Manage profile / Submitted fares / [Console] / Log out). Saved routes,
 * recent searches, and fare submissions also live in the hamburger library
 * rail on the left. The unseen-count badge is cleared on the /profile visit.
 */
export function AccountMenu({ user, unseenCount }: AccountMenuProps) {
  const router = useRouter();
  const initials = user.name.charAt(0).toUpperCase();

  const signOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <Dropdown.Root>
      <AriaButton
        aria-label={
          unseenCount > 0
            ? `Account — ${unseenCount} submission updates`
            : "Account"
        }
        className="relative flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#152018] text-[15px] font-bold text-white shadow-[0_1px_6px_rgba(0,0,0,0.25)] outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2 sm:size-10 sm:text-[13px]"
      >
        {initials}
        {unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-[#D93025] px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {unseenCount}
          </span>
        )}
      </AriaButton>

      <Dropdown.Popover className="w-60">
        <Dropdown.Menu>
          <Dropdown.Item icon={User01} href="/profile" textValue="Manage profile">
            Manage profile
          </Dropdown.Item>
          <Dropdown.Item
            icon={BankNote02}
            href="/profile#submissions"
            textValue="Submitted fares"
            addon={unseenCount > 0 ? String(unseenCount) : undefined}
          >
            Submitted fares
          </Dropdown.Item>
          {user.hasConsoleAccess && (
            <Dropdown.Item
              icon={Building07}
              href="/console"
              textValue="Operations console"
            >
              Operations console
            </Dropdown.Item>
          )}
          <Dropdown.Separator />
          <Dropdown.Item
            icon={LogOut01}
            onAction={signOut}
            textValue="Log out"
          >
            Log out
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  );
}
