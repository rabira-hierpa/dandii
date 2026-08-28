/**
 * Release gate for per-operator console scoping.
 *
 * `getUserOperatorCode` fails closed: a `route-operator` whose `operatorCode`
 * is null is refused rather than treated as network-wide. That is right for
 * writes, and once the console's *reads* adopt the same helper it means such a
 * user cannot open the console at all.
 *
 * Every `route-operator` row created before the operatorCode migration has a
 * null code. So this has to run, and be seen to have run, BEFORE the read-side
 * deploy — otherwise the first thing real dispatchers meet is a lockout.
 *
 * Modes:
 *   (default)                 report unresolved rows; exit 1 if any exist
 *   --set alice@x.com=ANBESSA assign an operator to one account (repeatable)
 *   --demote bob@x.com        drop the account to `user` (no console access)
 *
 * The default mode is what CI runs. It never guesses an operator: picking the
 * wrong one grants access to the wrong agency's data, which is worse than the
 * lockout it would be papering over.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";

// Loaded, not required: in the production image DATABASE_URL comes from the
// container environment and there is no .env. dotenv leaves an existing
// process.env value alone, so an inline DATABASE_URL always wins.
config({ path: ".env" });

/**
 * Constructed here rather than imported from `@/lib/prisma`.
 *
 * That module resolves through the `@/` path alias and pulls in the app's
 * singleton, neither of which exists in the runner image — only `scripts/`
 * and the generated client are copied in. A direct client keeps this script
 * runnable in production, which is the one place it actually matters.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const OPERATOR_CODES = ["ANBESSA", "SHEGER", "ALLIANCE", "MINIBUS", "LRT"];
/** Roles that must carry an operator. Mirrors OPERATOR_SCOPED_ROLES. */
const SCOPED_ROLES = ["route-operator"];

interface Assignment {
  email: string;
  code: string;
}

/** Parse argv into the two mutating modes. Exported for tests. */
export function parseArgs(argv: readonly string[]): {
  assignments: Assignment[];
  demotions: string[];
  errors: string[];
} {
  const assignments: Assignment[] = [];
  const demotions: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--set") {
      const pair = argv[++i];
      const [email, code] = (pair ?? "").split("=");
      if (!email || !code) {
        errors.push(`--set needs email=CODE, got ${pair ?? "nothing"}`);
      } else if (!OPERATOR_CODES.includes(code)) {
        errors.push(`unknown operator ${code} (expected ${OPERATOR_CODES.join(", ")})`);
      } else {
        assignments.push({ email, code });
      }
    } else if (arg === "--demote") {
      const email = argv[++i];
      if (!email) errors.push("--demote needs an email");
      else demotions.push(email);
    } else {
      errors.push(`unrecognized argument ${arg}`);
    }
  }
  return { assignments, demotions, errors };
}

async function main() {
  const { assignments, demotions, errors } = parseArgs(process.argv.slice(2));
  if (errors.length > 0) {
    for (const e of errors) console.error(`error: ${e}`);
    process.exit(2);
  }

  for (const { email, code } of assignments) {
    const updated = await prisma.user.updateMany({
      where: { email },
      data: { operatorCode: code as never },
    });
    console.log(
      updated.count === 1
        ? `  set ${email} -> ${code}`
        : `  no account for ${email}`,
    );
  }
  for (const email of demotions) {
    const updated = await prisma.user.updateMany({
      where: { email },
      data: { role: "user", operatorCode: null },
    });
    console.log(
      updated.count === 1 ? `  demoted ${email}` : `  no account for ${email}`,
    );
  }

  const unresolved = await prisma.user.findMany({
    where: { role: { in: SCOPED_ROLES }, operatorCode: null },
    select: { email: true, name: true },
  });

  if (unresolved.length === 0) {
    console.log("OK: every route-operator has an operator assigned.");
    await prisma.$disconnect();
    return;
  }

  console.error(
    `\nBLOCKED: ${unresolved.length} route-operator account(s) have no operator.`,
  );
  console.error("They cannot open the console once read scoping ships.\n");
  for (const u of unresolved) console.error(`  ${u.email}  (${u.name})`);
  console.error("\nResolve each one, then re-run:");
  console.error("  npx tsx scripts/backfill-operator-codes.ts --set EMAIL=ANBESSA");
  console.error("  npx tsx scripts/backfill-operator-codes.ts --demote EMAIL");
  await prisma.$disconnect();
  process.exit(1);
}

// Only run when invoked directly, so the arg parser stays unit-testable.
if (process.argv[1]?.includes("backfill-operator-codes")) {
  main().catch((err: Error) => {
    console.error("backfill failed:", err.message);
    process.exit(2);
  });
}
