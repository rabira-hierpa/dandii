# Promo clip recorder

Records the app driving itself and writes vertical, social-ready video —
one MP4 per idea, sized for Instagram Reels and TikTok, ready to drop into an
AI editor without cropping or trimming.

```bash
npm run promo
```

Output lands in `scripts/promo/out/` (git-ignored) alongside an `index.md`
naming what every clip shows.

**1080×1920 · 9:16 · 30fps · H.264 · no audio.**

## Cutting the finished videos

```bash
npm run promo:cut
```

Assembles the raw clips into three postable vertical videos in
`out/final/`, each in two variants — `-voiceover.mp4` and `-silent.mp4`.
Edit the `VIDEOS` array in `assemble.mts` to change the shot order, the
burned-in captions, or the narration.

Picture is cut to narration: each beat's on-screen length comes from the
measured length of its spoken line, so audio and cuts cannot drift. Narration
is macOS `say` — offline and free, but audibly synthetic. **Treat it as a
scratch track**; a real voice, ideally an Ethiopian one, is worth recording
before these run as paid ads. The script and timings stay valid if you swap the
audio.

There is no music track. Licensed music has to come from an editor's own
library (Clipchamp and CapCut both include one) — dropping a track under these
is a two-click job there.

## Requirements

- The app running on `http://localhost:3000` (`npm run dev`), with PostGIS and
  OTP up — the recorder refuses to start otherwise rather than filming errors.
- The dev database seeded with the GTFS feed.
- `ffmpeg` and `ffprobe` on `PATH` (`brew install ffmpeg`).
- Chromium for Playwright (`npx playwright install chromium`).

## Options

```bash
npm run promo -- --only 04,13     # re-record specific clips by number
npm run promo -- --no-encode      # leave raw .webm, skip the ffmpeg pass
npm run promo -- --keep-webm      # keep the intermediates in out/.raw
PROMO_BASE_URL=https://… npm run promo   # record against a deployed build
```

## How it fits together

| File | Role |
| --- | --- |
| `record.mts` | CLI: preflight, seed, warm up, record each clip, encode, write `index.md` |
| `clips.mts` | The shot list — one entry per clip, each a short async script |
| `studio.mts` | The engine: browser/frame setup, visible cursor, taps, drags, map camera |
| `seed.mts` | Demo contributors + a signed session cookie for the rewards clips |

### Demo data

The rewards clips need a populated leaderboard and a profile with history, so
`seed.mts` creates a cast of contributors under the `promo-demo-` id prefix and
signs the browser in as one of them (Abel Mekonnen, level 4, 340 points).

**This is fictional demo data**, addressed at `example.com`, seeded into your
local dev database only. It never touches the real accounts already there.
Remove it whenever you like:

```bash
npx tsx scripts/promo/seed.mts --clean
```

Auth is Google-OAuth-only and a headless browser cannot complete that, so the
script writes a `Session` row directly and mints the matching signed cookie the
same way better-auth does. Local dev only — it needs `BETTER_AUTH_SECRET`.

### Adding a clip

Append to `CLIPS` in `clips.mts`:

```ts
{
  name: "16-fare-proposal",
  title: "Reporting a fare that changed",
  signedIn: true,
  async run(s) {
    await s.goto("/?route=16765470");
    await s.mark();                      // trim everything before this
    await s.tap('button[aria-label="…"]');
    await s.beat(1500);                  // hold the shot
  },
}
```

`s.mark()` is the trim point: anything before it is setup and gets cut, so a
clip can take as long as it needs to reach an interesting state and still come
out eight seconds long. `s.camera({ zoom, center, pitch, bearing, duration })`
animates the MapLibre camera for cinematic moves.

### Keeping it working

The clips drive real UI, so they break when that UI changes. Selectors here
prefer accessible names (`aria-label`, roles) over CSS classes and visible copy
for that reason — a placeholder rewording already broke them once. When a clip
reports `⚠️ partial`, the video still exists but the flow didn't finish; re-run
that one with `--only` after fixing the selector.
