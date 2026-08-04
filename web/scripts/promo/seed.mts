/**
 * Demo data + session minting for the promo recorder.
 *
 * The rewards clips need a signed-in account with a believable history:
 * an empty leaderboard and a zero-point profile make for a dead video. This
 * seeds a self-contained cast of contributors, all namespaced under the
 * `promo-demo-` id prefix so `--clean` can remove every trace without ever
 * touching the real dogfooding accounts already in the dev database.
 *
 *   npx tsx --env-file=.env scripts/promo/seed.mts          # seed + print cookie
 *   npx tsx --env-file=.env scripts/promo/seed.mts --clean  # remove it all
 *
 * Auth is Google-OAuth-only, which a headless browser cannot complete, so the
 * script writes a Session row directly and mints the matching signed cookie
 * exactly the way better-call's setSignedCookie does (`value.HMAC-SHA256`,
 * base64, URI-encoded). Local dev database only.
 */
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Load `web/.env` ourselves rather than relying on `node --env-file`, which
 * only exists on Node 20.6+ and silently changes meaning under a version
 * manager. Existing environment variables always win.
 */
function loadEnv() {
  const file = join(dirname(fileURLToPath(import.meta.url)), "../../.env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line);
    if (!match || line.trimStart().startsWith("#")) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = match[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
}
loadEnv();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PREFIX = "promo-demo-";
/** The account the camera is signed in as. */
export const VIEWER_ID = `${PREFIX}viewer`;

/**
 * The cast. Points are set to land on interesting rungs of the ladder
 * (Newcomer → Transit Legend) so the leaderboard shows real spread, and the
 * viewer sits at rank 4 — high enough to feel invested, low enough that the
 * "climb" story still has somewhere to go.
 */
const CONTRIBUTORS: {
  id: string;
  name: string;
  points: number;
  approved: number;
}[] = [
  { id: `${PREFIX}c1`, name: "Marta Tesfaye", points: 1240, approved: 58 },
  { id: `${PREFIX}c2`, name: "Yonas Girma", points: 860, approved: 41 },
  { id: `${PREFIX}c3`, name: "Hanna Bekele", points: 615, approved: 29 },
  { id: VIEWER_ID, name: "Abel Mekonnen", points: 340, approved: 16 },
  { id: `${PREFIX}c5`, name: "Selamawit Alemu", points: 295, approved: 14 },
  { id: `${PREFIX}c6`, name: "Dawit Haile", points: 210, approved: 10 },
  { id: `${PREFIX}c7`, name: "Rahel Assefa", points: 155, approved: 7 },
  { id: `${PREFIX}c8`, name: "Kalkidan Wolde", points: 120, approved: 5 },
  { id: `${PREFIX}c9`, name: "Nahom Tadesse", points: 85, approved: 4 },
  { id: `${PREFIX}c10`, name: "Bethlehem Sisay", points: 60, approved: 3 },
  { id: `${PREFIX}c11`, name: "Eyob Getachew", points: 45, approved: 2 },
  { id: `${PREFIX}c12`, name: "Lidya Fikru", points: 28, approved: 1 },
];

/** Badges the viewer has earned, matching their 16 approved contributions. */
const VIEWER_BADGES = ["first_fix", "reliable_reporter", "network_explorer"];

async function clean() {
  // Sessions, ledger, badges, saved routes and proposals all cascade from
  // User, except proposals (no FK cascade on submittedById) — drop those first.
  const ids = (
    await prisma.user.findMany({
      where: { id: { startsWith: PREFIX } },
      select: { id: true },
    })
  ).map((u) => u.id);

  if (ids.length === 0) {
    console.log("nothing to clean");
    return;
  }
  await prisma.fareProposal.deleteMany({ where: { submittedById: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`removed ${ids.length} promo-demo users and their data`);
}

async function seed() {
  // Real route ids keep the profile's saved-routes and submission history
  // pointing at routes that actually render on the map.
  const routes = await prisma.route.findMany({
    orderBy: { shortName: "asc" },
    select: { id: true, shortName: true },
    take: 60,
  });
  if (routes.length === 0) {
    throw new Error("no routes in the database — run the GTFS seed first");
  }

  for (const c of CONTRIBUTORS) {
    await prisma.user.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        points: c.points,
        leaderboardOptIn: true,
      },
      create: {
        id: c.id,
        name: c.name,
        // The viewer's address is on camera in the profile header, so it uses
        // the reserved example.com domain: plausible on screen, and guaranteed
        // never to belong to a real person.
        email: `${c.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        emailVerified: true,
        role: "user",
        points: c.points,
        leaderboardOptIn: true,
      },
    });

    // The leaderboard's "N approved" column reads live from FareProposal, so
    // the history has to exist rather than being a number on the user row.
    const existing = await prisma.fareProposal.count({
      where: { submittedById: c.id, status: "APPROVED" },
    });
    const missing = c.approved - existing;
    for (let i = 0; i < missing; i++) {
      const route = routes[(i * 7) % routes.length];
      // Spread submissions back over ~12 weeks so streak logic sees a habit.
      const daysAgo = Math.floor((i / Math.max(c.approved, 1)) * 84) + 1;
      const at = new Date(Date.now() - daysAgo * 86_400_000);
      await prisma.fareProposal.create({
        data: {
          routeId: route.id,
          submittedById: c.id,
          status: "APPROVED",
          proposedKind: "FLAT",
          proposedFlatEtb: 10 + (i % 5) * 2.5,
          baselineKind: "FLAT",
          baselineFlatEtb: 8 + (i % 5) * 2.5,
          note: "Conductor has been charging this since Monday",
          decidedAt: at,
          createdAt: at,
        },
      });
    }
  }

  // Ledger + badges for the viewer only — that is the profile on camera.
  await prisma.pointsLedger.deleteMany({ where: { userId: VIEWER_ID } });
  const viewer = CONTRIBUTORS.find((c) => c.id === VIEWER_ID)!;
  await prisma.pointsLedger.createMany({
    data: [
      ...Array.from({ length: viewer.approved }, (_, i) => ({
        userId: VIEWER_ID,
        delta: 20,
        reason: "APPROVED" as const,
        createdAt: new Date(Date.now() - (i + 1) * 3 * 86_400_000),
      })),
      { userId: VIEWER_ID, delta: 5, reason: "BADGE_BONUS" as const },
      { userId: VIEWER_ID, delta: 15, reason: "BADGE_BONUS" as const },
    ],
  });
  for (const badge of VIEWER_BADGES) {
    await prisma.userBadge.upsert({
      where: { userId_badge: { userId: VIEWER_ID, badge } },
      update: {},
      create: { userId: VIEWER_ID, badge },
    });
  }

  // Saved routes give the library rail something to show on camera.
  await prisma.savedRoute.deleteMany({ where: { userId: VIEWER_ID } });
  await prisma.savedRoute.createMany({
    data: routes.slice(0, 6).map((r) => ({ userId: VIEWER_ID, routeId: r.id })),
    skipDuplicates: true,
  });

  console.log(
    `seeded ${CONTRIBUTORS.length} contributors; viewer=${viewer.name} (${viewer.points} pts)`,
  );
}

/**
 * Mirror of better-call `signCookieValue`: HMAC-SHA256 over the raw token,
 * base64 (with padding, as btoa produces), joined with a dot, URI-encoded.
 */
function signCookieValue(value: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(value).digest("base64");
  return encodeURIComponent(`${value}.${sig}`);
}

async function mintSession(): Promise<{ name: string; value: string }> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);

  await prisma.session.deleteMany({ where: { userId: VIEWER_ID } });
  await prisma.session.create({
    data: {
      id: randomUUID(),
      token,
      userId: VIEWER_ID,
      expiresAt,
      updatedAt: new Date(),
      userAgent: "dandii-promo-recorder",
    },
  });

  // No __Secure- prefix: BETTER_AUTH_URL is http://localhost in dev, so
  // better-auth serves the cookie unprefixed and non-secure.
  return {
    name: "better-auth.session_token",
    value: signCookieValue(token, secret),
  };
}

/** Seed (idempotently) and return the cookie the recorder should inject. */
export async function prepareDemoSession() {
  await seed();
  return mintSession();
}

/** Importers must call this, or the open pool keeps the process alive. */
export async function disconnect() {
  await prisma.$disconnect();
}

if (process.argv[1]?.includes("seed.mts")) {
  const run = process.argv.includes("--clean")
    ? clean()
    : prepareDemoSession().then((c) =>
        console.log(`\ncookie ${c.name}=${c.value}`),
      );
  run
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
