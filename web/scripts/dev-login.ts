/**
 * DEV ONLY: creates a user with the given role plus a session row, and
 * prints a signed `better-auth.session_token` cookie for local testing
 * without Google OAuth. Usage:
 *   npx tsx --env-file=.env scripts/dev-login.ts [role] [email]
 */
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function signCookieValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  const b64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return encodeURIComponent(`${value}.${b64}`);
}

async function main() {
  const role = process.argv[2] ?? "super-admin";
  const email = process.argv[3] ?? `dev-${role}@example.com`;
  const secret = process.env.BETTER_AUTH_SECRET!;

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      id: randomUUID(),
      name: `Dev ${role}`,
      email,
      emailVerified: true,
      role,
      updatedAt: new Date(),
    },
    update: { role },
  });

  const token = randomUUID().replaceAll("-", "");
  await prisma.session.create({
    data: {
      id: randomUUID(),
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const cookie = await signCookieValue(token, secret);
  console.log(`better-auth.session_token=${cookie}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
