"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LOCALES, LOCALE_COOKIE } from "@/i18n/config";

const localeSchema = z.object({ locale: z.enum(LOCALES) });

/**
 * Persist the reader's language choice. Locale lives in a cookie rather than
 * the URL, so switching costs nothing structurally — every route stays put.
 */
export async function setLocale(input: z.infer<typeof localeSchema>) {
  const { locale } = localeSchema.parse(input);
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  // Every server-rendered string depends on this, so refresh the whole tree.
  revalidatePath("/", "layout");
  return { ok: true as const, locale };
}
