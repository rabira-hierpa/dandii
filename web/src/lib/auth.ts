import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { ac, roles } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  // Origin validation behind a reverse proxy (Coolify's Traefik) is more
  // reliable when the public origin is listed explicitly rather than
  // inferred from baseURL alone.
  trustedOrigins: process.env.BETTER_AUTH_URL
    ? [process.env.BETTER_AUTH_URL]
    : undefined,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    additionalFields: {
      // Surfaced so the members list can show and set a member's operator.
      // `input: false` keeps it out of sign-up and profile updates — the
      // scope is granted by an invitation or an admin, never self-declared.
      operatorCode: { type: "string", required: false, input: false },
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    admin({
      ac,
      roles,
      defaultRole: "user",
      adminRoles: ["super-admin", "admin"],
    }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
          if (superAdminEmail && user.email === superAdminEmail) {
            return { data: { ...user, role: "super-admin" } };
          }
          return { data: user };
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
