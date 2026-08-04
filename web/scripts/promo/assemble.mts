/**
 * Cuts the recorded clips into finished, postable vertical videos.
 *
 *   npx tsx scripts/promo/assemble.mts
 *
 * Reads from `out/`, writes to `out/final/`. For each video it produces two
 * files: one with a narration track and one silent, because a large share of
 * Reels/TikTok views happen muted and the burned-in captions carry the story
 * on their own.
 *
 * Picture is cut to narration rather than the other way round: each beat's
 * on-screen duration is derived from the measured length of its spoken line,
 * so the voiceover and the cuts can never drift apart.
 *
 * Narration uses macOS `say`, which is offline and free but audibly synthetic
 * — treat it as a scratch track (see README).
 */
import { execFile } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIPS_DIR = join(HERE, "out");
const OUT = join(CLIPS_DIR, "final");
const WORK = join(OUT, ".work");

const W = 1080;
const H = 1920;
const FPS = 30;
const FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
const VOICE = "Samantha";
const WPM = 168;

/** Gap after a spoken line before the cut, so beats do not feel clipped. */
const TAIL_S = 0.55;
/** Floor for beats whose line is very short. */
const MIN_BEAT_S = 2.2;

interface Beat {
  clip: string;
  /** Seconds into the source clip to start from. */
  from?: number;
  /** Big burned-in text. Must carry the meaning with the sound off. */
  text: string;
  /** Spoken line. Numbers are spelled out so the synth reads them correctly. */
  vo: string;
}

interface Video {
  name: string;
  beats: Beat[];
}

const VIDEOS: Video[] = [
  {
    name: "dandii-1-map-and-search",
    beats: [
      {
        clip: "01-network-hero.mp4",
        text: "447 bus routes",
        vo: "Addis Ababa runs on four hundred and forty seven bus routes.",
      },
      {
        clip: "02-network-tilt.mp4",
        text: "One map.\nEvery operator.",
        vo: "Anbessa, Sheger, Alliance, the minibus associations, and the light rail.",
      },
      {
        clip: "03-search-typing.mp4",
        text: "Search any destination",
        vo: "Search where you're going.",
      },
      {
        clip: "04-route-detail.mp4",
        text: "Tap a route",
        vo: "Tap a route, and the line draws itself.",
      },
      {
        clip: "05-route-stops.mp4",
        text: "Every stop.\nFare. Frequency.",
        vo: "Every stop, the fare in birr, and how often it runs.",
      },
      {
        clip: "06-layers-toggle.mp4",
        text: "Filter by operator",
        vo: "Filter the map down to the operator you ride.",
      },
      {
        clip: "07-my-location.mp4",
        text: "Dandii",
        vo: "Dandii. The transit map Addis has been missing.",
      },
    ],
  },
  {
    name: "dandii-2-journey-planner",
    beats: [
      {
        clip: "08-directions-open.mp4",
        text: "Which bus gets me there?",
        vo: "Getting across Addis shouldn't take three phone calls and a guess.",
      },
      {
        clip: "09-directions-plan.mp4",
        text: "Megenagna to Mexico",
        vo: "Tell Dandii where you are, and where you're going.",
      },
      {
        clip: "10-itinerary.mp4",
        text: "58 min · 8 stops · 10 ETB",
        vo: "It finds the bus. Route A B seventy eight. Fifty eight minutes, eight stops, about ten birr.",
      },
      {
        clip: "10-itinerary.mp4",
        from: 6.2,
        text: "Dandii",
        vo: "No asking around. No waiting to find out.",
      },
    ],
  },
  {
    name: "dandii-3-rewards",
    beats: [
      {
        clip: "11-profile-level.mp4",
        text: "Fares change.\nMaps don't.",
        vo: "Bus fares in Addis change without warning, and nobody updates the map.",
      },
      {
        clip: "12-contribution-history.mp4",
        text: "So riders fix them",
        vo: "So the riders fix them. Report a fare that changed.",
      },
      {
        clip: "13-leaderboard.mp4",
        text: "Approved edits earn points",
        vo: "When a reviewer approves it, you earn points, levels, and badges.",
      },
      {
        clip: "14-saved-routes.mp4",
        text: "Dandii",
        vo: "Dandii. Built by the people who ride it.",
      },
    ],
  },
];

async function duration(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    file,
  ]);
  return Number.parseFloat(stdout.trim());
}

/** Render one spoken line to wav and report how long it actually is. */
async function speak(text: string, dest: string): Promise<number> {
  const aiff = `${dest}.aiff`;
  await run("say", ["-v", VOICE, "-r", String(WPM), "-o", aiff, text]);
  await run("ffmpeg", ["-y", "-v", "error", "-i", aiff, "-ar", "48000", "-ac", "2", dest]);
  return duration(dest);
}

/**
 * drawtext escaping is its own dialect (colons, quotes, commas all bite), so
 * the copy goes through a file instead. Two lines are drawn as two calls
 * because textfile does not honour a literal newline.
 */
function textFilter(lines: string[], workDir: string, id: string): string {
  const size = 66;
  const lineGap = 88;
  // Sit above the platform UI: TikTok and Reels overlay the bottom ~15%.
  const baseY = H - 470 - (lines.length - 1) * lineGap;

  return lines
    .map((line, i) => {
      const file = join(workDir, `text-${id}-${i}.txt`);
      writeFileSync(file, line);
      return [
        `drawtext=fontfile='${FONT}'`,
        `textfile='${file}'`,
        "fontcolor=white",
        `fontsize=${size}`,
        // A scrim, not a shadow: the app is mostly white, and white-on-white
        // text disappears exactly where the bottom sheet sits.
        "box=1:boxcolor=black@0.62:boxborderw=22",
        "x=(w-text_w)/2",
        `y=${baseY + i * lineGap}`,
      ].join(":");
    })
    .join(",");
}

async function buildVideo(video: Video) {
  const workDir = join(WORK, video.name);
  mkdirSync(workDir, { recursive: true });

  // 1. Voice each line first — the measured lengths drive every cut.
  const beats = [];
  for (const [i, beat] of video.beats.entries()) {
    const voFile = join(workDir, `vo-${i}.wav`);
    const voLen = await speak(beat.vo, voFile);
    const srcLen = await duration(join(CLIPS_DIR, beat.clip));
    const from = beat.from ?? 0;
    const available = srcLen - from;
    const wanted = Math.max(voLen + TAIL_S, MIN_BEAT_S);
    beats.push({ ...beat, from, voFile, voLen, beatLen: Math.min(wanted, available), available });
  }

  // 2. Cut each beat and burn its caption in.
  const segments: string[] = [];
  for (const [i, b] of beats.entries()) {
    const seg = join(workDir, `seg-${i}.mp4`);
    const filter = `${textFilter(b.text.split("\n"), workDir, String(i))},fps=${FPS},format=yuv420p`;
    await run("ffmpeg", [
      "-y", "-v", "error",
      "-ss", b.from.toFixed(2),
      "-t", b.beatLen.toFixed(2),
      "-i", join(CLIPS_DIR, b.clip),
      "-vf", filter,
      "-c:v", "libx264", "-preset", "slow", "-crf", "18",
      "-pix_fmt", "yuv420p", "-an",
      seg,
    ]);
    segments.push(seg);

    // Pad the spoken line out to the full beat so audio and picture stay locked.
    const padded = join(workDir, `aud-${i}.wav`);
    await run("ffmpeg", [
      "-y", "-v", "error",
      "-i", b.voFile,
      "-af", `apad=whole_dur=${b.beatLen.toFixed(3)}`,
      "-ar", "48000", "-ac", "2",
      padded,
    ]);
    b.voFile = padded;
  }

  // 3. Concatenate picture and narration separately, then mux.
  const vList = join(workDir, "video.txt");
  writeFileSync(vList, segments.map((s) => `file '${s}'`).join("\n"));
  const silent = join(workDir, "silent.mp4");
  await run("ffmpeg", [
    "-y", "-v", "error",
    "-f", "concat", "-safe", "0", "-i", vList,
    "-c", "copy",
    silent,
  ]);

  const aList = join(workDir, "audio.txt");
  writeFileSync(aList, beats.map((b) => `file '${b.voFile}'`).join("\n"));
  const voTrack = join(workDir, "vo.wav");
  await run("ffmpeg", [
    "-y", "-v", "error",
    "-f", "concat", "-safe", "0", "-i", aList,
    "-c", "copy",
    voTrack,
  ]);

  const total = await duration(silent);

  // Silent cut — captions only, for muted autoplay.
  const silentOut = join(OUT, `${video.name}-silent.mp4`);
  await run("ffmpeg", [
    "-y", "-v", "error",
    "-i", silent,
    "-vf", `fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.5).toFixed(2)}:d=0.5`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
    silentOut,
  ]);

  // Narrated cut.
  const voiced = join(OUT, `${video.name}-voiceover.mp4`);
  await run("ffmpeg", [
    "-y", "-v", "error",
    "-i", silentOut,
    "-i", voTrack,
    // Instagram and TikTok normalise playback to roughly -14 LUFS; landing
    // there beats letting them turn a quiet -17 LUFS track up for us.
    "-af",
    `afade=t=in:st=0:d=0.2,afade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6,` +
      "loudnorm=I=-14:TP=-1.5:LRA=11",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest", "-movflags", "+faststart",
    voiced,
  ]);

  return { video, total, beats };
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });

  const summaries = [];
  for (const video of VIDEOS) {
    process.stdout.write(`building ${video.name} … `);
    const result = await buildVideo(video);
    console.log(`${result.total.toFixed(1)}s (${result.beats.length} beats)`);
    for (const b of result.beats) {
      const squeezed = b.voLen + TAIL_S > b.available ? "  ⚠️ line longer than clip" : "";
      console.log(
        `    ${b.clip.padEnd(28)} beat ${b.beatLen.toFixed(1)}s  vo ${b.voLen.toFixed(1)}s${squeezed}`,
      );
    }
    summaries.push(result);
  }

  rmSync(WORK, { recursive: true, force: true });
  console.log(`\nwrote ${summaries.length * 2} files to scripts/promo/out/final/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
