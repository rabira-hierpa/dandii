/**
 * Promo clip recorder.
 *
 *   npx tsx --env-file=.env scripts/promo/record.mts
 *   npx tsx --env-file=.env scripts/promo/record.mts --only 01,04,13
 *   npx tsx --env-file=.env scripts/promo/record.mts --keep-webm
 *
 * Requires the app running on PROMO_BASE_URL (default http://localhost:3000)
 * with the dev database seeded. Writes 1080x1920 H.264 MP4s to
 * `scripts/promo/out/`, one per clip, plus an index.md describing each.
 *
 * A warm-up pass runs first and is not optional: in `next dev` every route
 * compiles on its first request, and a clip that opens on a compiling page
 * records several seconds of blank white.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { CLIPS, type Clip } from "./clips.mts";
import { disconnect, prepareDemoSession } from "./seed.mts";
import {
  launchBrowser,
  makeStudio,
  newClipContext,
  VIDEO_SIZE,
  type SessionCookie,
} from "./studio.mts";

const execFileAsync = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const RAW = join(OUT, ".raw");
const BASE_URL = process.env.PROMO_BASE_URL ?? "http://localhost:3000";

const args = process.argv.slice(2);
const only = args.includes("--only")
  ? (args[args.indexOf("--only") + 1] ?? "").split(",").map((s) => s.trim())
  : null;
const keepWebm = args.includes("--keep-webm");
const skipEncode = args.includes("--no-encode");

/** Lead-in kept before the marked action, so a cut never feels abrupt. */
const LEAD_IN_S = 0.35;

interface Result {
  clip: Clip;
  file: string | null;
  seconds: number;
  error?: string;
}

/**
 * Compile every route the clips touch. Uses a real browser rather than plain
 * fetches so the client bundles, map tiles, and the GTFS geometry endpoints
 * are all warm too.
 */
async function warmUp(cookie: SessionCookie) {
  process.stdout.write("warming up routes… ");
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: null });
  await ctx.addCookies([
    { name: cookie.name, value: cookie.value, url: BASE_URL, sameSite: "Lax" },
  ]);
  const page = await ctx.newPage();

  await page.goto("/", { waitUntil: "networkidle" }).catch(() => {});
  await page.goto("/?route=16765470", { waitUntil: "networkidle" }).catch(() => {});
  await page.goto("/profile", { waitUntil: "networkidle" }).catch(() => {});
  await page.goto("/leaderboard", { waitUntil: "networkidle" }).catch(() => {});

  // The journey planner is the slowest first hit — exercise it end to end.
  await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {});
  try {
    await page.locator('button:visible:has-text("Directions")').first().click();
    const start = page.locator('input[aria-label="Choose start point"]:visible').first();
    await start.fill("Megenagna");
    await page.getByRole("option").filter({ hasText: "Megenagna Terminal" }).first().click();
    const dest = page.locator('input[aria-label="Choose destination"]:visible').first();
    await dest.fill("Mexico");
    await page.getByRole("option").first().click();
    await page.locator('button:visible:has-text("Directions")').first().click();
    await page.locator("text=/\\d+ min/").first().waitFor({ timeout: 45_000 });
  } catch {
    // A cold planner is a slow clip, not a failed run — carry on.
  }

  await ctx.close();
  await browser.close();
  console.log("done");
}

async function encode(src: string, dest: string, startS: number) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", src,
    ...(startS > 0 ? ["-ss", startS.toFixed(2)] : []),
    "-vf", `fps=30,scale=${VIDEO_SIZE.width}:${VIDEO_SIZE.height}:flags=lanczos`,
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-movflags", "+faststart",
    "-an",
    dest,
  ]);
}

async function probeDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    file,
  ]);
  return Number.parseFloat(stdout.trim()) || 0;
}

async function main() {
  // Fail loudly here rather than producing fourteen one-second clips of a
  // connection error, which is what a dead dev server otherwise looks like.
  const reachable = await fetch(BASE_URL, { redirect: "manual" })
    .then((r) => r.status < 500)
    .catch(() => false);
  if (!reachable) {
    throw new Error(
      `${BASE_URL} is not responding. Start the app (npm run dev) and retry, ` +
        `or set PROMO_BASE_URL to point somewhere else.`,
    );
  }

  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const cookie = await prepareDemoSession();
  await disconnect();
  await warmUp(cookie);

  const queue = only
    ? CLIPS.filter((c) => only.some((o) => c.name.startsWith(o)))
    : CLIPS;
  if (queue.length === 0) throw new Error(`no clips matched --only ${only?.join(",")}`);

  const browser = await launchBrowser();
  const results: Result[] = [];

  for (const [i, clip] of queue.entries()) {
    process.stdout.write(`[${i + 1}/${queue.length}] ${clip.name} … `);
    const ctx = await newClipContext(browser, RAW, {
      baseURL: BASE_URL,
      cookie: clip.signedIn ? cookie : undefined,
    });
    const page = await ctx.newPage();
    const studio = makeStudio(page);

    let error: string | undefined;
    try {
      await clip.run(studio);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const video = page.video();
    const marked = studio.markedAt;
    await ctx.close(); // flushes the video file to disk
    const raw = video ? await video.path() : null;

    if (!raw) {
      console.log("no video");
      results.push({ clip, file: null, seconds: 0, error: error ?? "no video produced" });
      continue;
    }

    if (skipEncode) {
      const dest = join(OUT, `${clip.name}.webm`);
      renameSync(raw, dest);
      results.push({ clip, file: dest, seconds: await probeDuration(dest), error });
      console.log(error ? `webm (with error: ${error})` : "webm");
      continue;
    }

    const dest = join(OUT, `${clip.name}.mp4`);
    const startS = marked === null ? 0 : Math.max(0, marked / 1000 - LEAD_IN_S);
    await encode(raw, dest, startS);
    const seconds = await probeDuration(dest);
    results.push({ clip, file: dest, seconds, error });
    console.log(
      `${seconds.toFixed(1)}s${error ? `  (partial: ${error.split("\n")[0]})` : ""}`,
    );
  }

  await browser.close();
  if (!keepWebm) rmSync(RAW, { recursive: true, force: true });

  const ok = results.filter((r) => r.file && !r.error);

  // The index describes every clip on disk, not just the ones this run
  // touched — otherwise `--only 04` would leave an index listing one file.
  const ext = skipEncode ? "webm" : "mp4";
  const rows: string[] = [];
  for (const clip of CLIPS) {
    const justRun = results.find((r) => r.clip.name === clip.name);
    const file = join(OUT, `${clip.name}.${ext}`);
    const onDisk = existsSync(file);
    if (!onDisk && !justRun) continue;
    const seconds = justRun?.seconds ?? (onDisk ? await probeDuration(file) : 0);
    const warn = justRun?.error ? " ⚠️ partial" : "";
    rows.push(`| \`${clip.name}.${ext}\` | ${seconds.toFixed(1)}s | ${clip.title}${warn} |`);
  }

  writeFileSync(
    join(OUT, "index.md"),
    [
      "# Dandii promo clips",
      "",
      `Recorded ${new Date().toISOString().slice(0, 16).replace("T", " ")} · ` +
        `${VIDEO_SIZE.width}x${VIDEO_SIZE.height} (9:16) · 30fps · H.264, no audio.`,
      "",
      "Drop these straight into CapCut, Opus Clip, Descript, or any AI editor —",
      "they are already vertical and need no cropping.",
      "",
      "| Clip | Length | What it shows |",
      "| --- | --- | --- |",
      ...rows,
      "",
    ].join("\n"),
  );

  console.log(
    `\n${ok.length}/${results.length} clean · ${readdirSync(OUT).filter((f) => f.endsWith(".mp4") || f.endsWith(".webm")).length} files in scripts/promo/out/`,
  );
  for (const r of results.filter((x) => x.error)) {
    console.log(`  ⚠️  ${r.clip.name}: ${r.error?.split("\n")[0]}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
