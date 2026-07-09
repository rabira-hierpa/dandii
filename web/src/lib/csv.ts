import { CONSOLE_ROLES, type AppRole } from "@/lib/permissions";
import { getSession } from "@/lib/session";

/** RFC-4180 field escaping. */
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) =>
    row.map(escapeField).join(","),
  );
  // BOM so Excel opens UTF-8 (Amharic stop names) correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Exports are read-only but internal: any console role may download,
 * anonymous/citizen users may not.
 */
export async function requireExportAccess(): Promise<Response | null> {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user.role ?? "user") as AppRole;
  if (!CONSOLE_ROLES.includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
