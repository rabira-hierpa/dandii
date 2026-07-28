import type { Metadata } from "next";
import { StatusPage } from "@/components/status/status-page";

export const metadata: Metadata = {
  title: "Access denied",
  robots: { index: false, follow: false },
};

export default function AccessDeniedPage() {
  return (
    <StatusPage
      code="403"
      compactCode
      closedRoute
      eyebrow="Route closed to your role"
      title="Staff routes only"
      description="Your account doesn’t have permission for this part of Dandii. The public map is still open — ask an admin if you need console access."
      actions={[
        { href: "/", label: "Back to map", color: "primary" },
        {
          href: "/sign-in",
          label: "Sign in with another account",
          color: "secondary",
        },
      ]}
      footnote="Think this is a mistake? Contact your Dandii admin."
    />
  );
}
