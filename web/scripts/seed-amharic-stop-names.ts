/**
 * Curated Amharic (Ge'ez script) names for well-known Addis Ababa transit
 * hubs — the starter data referenced in docs/rewards-and-amharic-design.md
 * §4 ("bilingual feed names with Batch D") and the invitation/Amharic work
 * that followed it.
 *
 * WHY a hand-picked list instead of translating every stop: the feed has no
 * `translations.txt` (see prisma/seed/parse-gtfs.ts#loadStopNameTranslations,
 * which reads one when a future feed ships one), and the stop names
 * themselves are messy, crowdsourced OSM fragments — 858 distinct strings for
 * ~2,270 stops, with typo'd near-duplicates ("Adey abada" / "Adey Abeba" /
 * "Adis sefer" / "Addis Sefer") that a script can't safely disambiguate.
 * Machine-translating all of them would produce confident-looking wrong
 * answers for exactly the audience this feature serves. Instead: exact-match
 * a short list of unambiguous, widely-known neighbourhood/landmark names —
 * the transit hubs any Amharic-reading rider already knows by these names —
 * and leave the long tail for the console's per-stop editor (route-stops-tab)
 * or a future operator-supplied translations.txt.
 *
 * Per the design doc's own gate: this is a best-effort starting point, not a
 * substitute for native-speaker review. Re-running is safe (upsert, keyed by
 * stop id) — it will not clobber a name a console editor already corrected,
 * because it only fills stops whose `nameAm` is still null.
 *
 * Usage: npx tsx --env-file=.env scripts/seed-amharic-stop-names.ts [--dry-run]
 */
import { prisma } from "@/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

/** Exact `stop.name` → Amharic. Only names that appear verbatim in the feed. */
const AMHARIC_NAMES: Record<string, string> = {
  Piassa: "ፒያሳ",
  Merkato: "መርካቶ",
  Bole: "ቦሌ",
  Megenagna: "መገናኛ",
  "Arat Kilo": "አራት ኪሎ",
  Kazanchis: "ካዛንቺስ",
  Kera: "ቄራ",
  Kotebe: "ኮተቤ",
  Legehar: "ለገሃር",
  Lideta: "ልደታ",
  Mexico: "ሜክሲኮ",
  "Nifas Silk": "ንፋስ ስልክ",
  "Sar Bet": "ሳር ቤት",
  Saris: "ሳሪስ",
  Shiromeda: "ሽሮ ሜዳ",
  Stadium: "ስታዲየም",
  Summit: "ሳሚት",
  Torhayloch: "ጦር ኃይሎች",
  "Wollo Sefer": "ወሎ ሰፈር",
  Ayat: "አያት",
  "Ayer Tena": "አየር ጤና",
  Asko: "አስኮ",
  Gofa: "ጎፋ",
  Gerji: "ገርጂ",
  Jemo: "ጀሞ",
  "C.M.C": "ሲኤምሲ",
  Bambis: "ባምቢስ",
  BAMBIS: "ባምቢስ",
  "Autobus Tera": "አውቶብስ ተራ",
  "Old Airport": "ኦልድ ኤርፖርት",
};

async function main() {
  const names = Object.keys(AMHARIC_NAMES);
  const stops = await prisma.stop.findMany({
    where: { name: { in: names }, nameAm: null },
    select: { id: true, name: true, origin: true },
  });

  if (stops.length === 0) {
    console.log("Nothing to do — every matching stop already has an Amharic name.");
    return;
  }

  console.log(`${stops.length} stop(s) to update:`);
  const byName = new Map<string, number>();
  for (const s of stops) byName.set(s.name, (byName.get(s.name) ?? 0) + 1);
  for (const [name, count] of byName) {
    console.log(`  ${name} → ${AMHARIC_NAMES[name]} (${count} stop id${count === 1 ? "" : "s"})`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: no writes made.");
    return;
  }

  // A system user "wrote" this override — pick any admin-tier account so the
  // FK is satisfiable; falls back to whoever exists if no admin is seeded yet.
  const editor =
    (await prisma.user.findFirst({
      where: { role: { in: ["super-admin", "admin"] } },
      select: { id: true },
    })) ?? (await prisma.user.findFirst({ select: { id: true } }));
  if (!editor) {
    console.error("No user in the database to attribute this seed to — aborting.");
    process.exitCode = 1;
    return;
  }

  for (const s of stops) {
    const nameAm = AMHARIC_NAMES[s.name];
    if (s.origin === "OPERATOR") {
      await prisma.stop.update({ where: { id: s.id }, data: { nameAm } });
    } else {
      await prisma.stopOverride.upsert({
        where: { stopId: s.id },
        create: { stopId: s.id, nameAm, editedById: editor.id },
        update: { nameAm, editedById: editor.id },
      });
      await prisma.stop.update({ where: { id: s.id }, data: { nameAm } });
    }
  }

  console.log(`\nDone — ${stops.length} stop(s) updated.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
