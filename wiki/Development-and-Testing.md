# Development and Testing

How to work on Dandii day to day: the commands, the conventions, and the test suite. See also the repo's [CONTRIBUTING.md](https://github.com/rabira-hierpa/dandii/blob/main/CONTRIBUTING.md).

## Commands (run from `web/`)

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on :3000. |
| `npm run build` | Production build (`output: "standalone"`). |
| `npm run lint` | ESLint. |
| `npx tsc --noEmit` | Typecheck. |
| `npm test` | Vitest unit tests (once). |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run test:e2e` | Playwright e2e (needs the app running / seeded). |
| `npm run db:migrate` | `prisma migrate dev` (also regenerates the client). |
| `npm run db:seed` | Seed the GTFS feed (preserve mode). |

After changing `schema.prisma`, run `npx prisma generate` (or `db:migrate`) so `src/generated/prisma` is up to date, then restart `next dev` — the running server caches the client in memory.

## This is not the Next.js you may know

`web/AGENTS.md` flags that this is **Next.js 16** with breaking changes from earlier versions. Notable:

- **`proxy.ts` replaces `middleware.ts`** for the auth cookie gate.
- Route handlers are uncached by default; caching is explicit (`s-maxage`, `revalidatePath`, `force-dynamic`).
- `params` in dynamic route handlers/pages are async (`await params`).
- The lint config enforces **`react-hooks/set-state-in-effect`** — do not call `setState` synchronously in an effect. Use render-time state sync (compare-prev-prop) or `useSyncExternalStore` for external stores (see `lib/recent-searches.ts`).

When in doubt, read the version's own docs under `node_modules/next/dist/docs/`.

## Local sign-in without Google (dev only)

`web/dev-session.tmp.ts` mints a signed better-auth session cookie for a chosen role so you can preview the console without configuring OAuth:

```bash
cd web
set -a && source .env && set +a
npx tsx dev-session.tmp.ts maintainer     # or: user | route-operator | admin | super-admin
```

It prints a `better-auth.session_token=...` cookie; set it in your browser for `localhost:3000`. It upserts a `dev-<role>` user and a session in the DB. This is a dev helper only — never use it in production.

## Testing

### Unit tests (Vitest)

Pure logic, no database. Config: `web/vitest.config.ts` (resolves the `@/` alias). Coverage includes:

- `src/actions/proposal-schema.test.ts` — proposal validation (flat/tiered, amount ceiling, note length).
- `src/lib/gtfs-fares-format.test.ts` — the exported fare-file formatting and the **tiered-omission rule (4A)**.

```bash
npm test
```

### The preserve-fares regression (critical, DB-backed)

`web/prisma/seed/preserve-fares.test.ts` proves the T0 invariant: a reseed in preserve mode keeps an edited fare; `--destructive` resets it. It's **gated on `RUN_DB_TESTS=1`** so it never touches a dev database by default — CI runs it against an ephemeral Postgres.

```bash
RUN_DB_TESTS=1 DATABASE_URL=... npm test   # runs the seed twice; slow, CI-oriented
```

### End-to-end (Playwright)

`web/e2e/` + `web/playwright.config.ts`. Assumes a running, seeded app (the config reuses a local `next dev`, or starts one). Install browsers once:

```bash
npx playwright install chromium
npm run test:e2e
```

## Continuous integration

`.github/workflows/ci.yml` has two jobs:

1. **check** — `npm ci` → `prisma generate` → `tsc --noEmit` → `eslint` → `npm test` (units; the DB regression skips without `RUN_DB_TESTS`).
2. **feed-validator** — spins up a Postgres service, migrates, seeds, runs the DB tests (`RUN_DB_TESTS=1`), generates a feed (`scripts/generate-feed.ts`), downloads the MobilityData GTFS validator, validates the base feed and the overlay, and runs the **validator gate** (`scripts/validate-feed-diff.mjs`): the overlay must add no ERROR codes beyond the base feed.

See [GTFS Export and Feed Versions](GTFS-Export-and-Feed-Versions) for the gate's design.

## Conventions

- **Writes are server actions**, not API routes; each re-checks permissions.
- **One fare write path** (`applyFareChange`) so the audit log is never bypassed.
- **Match the surrounding code** — the map uses hard-coded hex tokens; the console/base components use the Untitled UI Tailwind theme (react-aria). Reuse `base/` primitives (Dropdown, Select.ComboBox) over new dependencies.
- Commit only when asked; branch off `main` for changes.

## Related

- [Getting Started](Getting-Started) · [Architecture](Architecture) · [Configuration](Configuration) · [Troubleshooting](Troubleshooting)
