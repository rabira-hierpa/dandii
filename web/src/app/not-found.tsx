import type { Metadata } from "next";
import Link from "next/link";
import { StatusPage } from "@/components/status/status-page";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      eyebrow="Stop not found"
      title="This stop isn’t on the map"
      description="The page you’re looking for doesn’t exist, or the route moved. Jump back to the live Addis transit map."
      actions={[
        { href: "/", label: "Back to map", color: "primary" },
        { href: "/", label: "Search routes", color: "secondary" },
      ]}
      footnote={
        <>
          Need the ops console?{" "}
          <Link
            href="/sign-in"
            className="font-semibold text-brand-700 hover:text-brand-800"
          >
            Sign in
          </Link>
        </>
      }
    />
  );
}
