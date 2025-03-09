"use client";

import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

// Define extended session user type
interface ExtendedUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();

  // Show loading state
  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  // Redirect if not authenticated or not authorized
  if (!session?.user) {
    redirect("/");
  }

  // Access user with proper type safety
  const user = session.user as ExtendedUser;
  if (user.role !== "ADMIN" && user.role !== "TRANSPORT_OFFICIAL") {
    redirect("/");
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <DashboardSidebar />
      <div className="flex-1 overflow-auto p-6">{children}</div>
    </div>
  );
}
