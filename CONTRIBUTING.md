# Contributing to Dandii

Thanks for helping improve Addis Ababa’s transit map and ops console.

## Before you start

1. Read [README.md](./README.md) for local setup (PostGIS, OTP, Next.js, seed).
2. **Sign the [Contributor License Agreement](./CLA.md).** One time, takes about
   a minute, covers all your past and future contributions. Pull requests cannot
   be merged without it — see [How to sign](./CLA.md#how-to-sign).
3. Open an issue (or comment on an existing one) before large features so we can
   align on scope.
4. Security-sensitive discoveries go through [SECURITY.md](./SECURITY.md), not
   public issues.

### Why there is a CLA

Dandii is public under the noncommercial [LICENSE](./LICENSE), and is also
offered to transit agencies and operators under separate commercial terms. That
dual model requires the Maintainer to hold the rights to every line in the tree.
The CLA grants those rights — **you keep the copyright in your own work**, and
nothing you contribute stops being yours. Without it, contributed code would
eventually have to be removed and rewritten, which is a waste of your time and
ours.

If the terms are a problem for your employer, raise it in an issue or by email
**before** writing code.

## Development workflow

```bash
# From repo root
docker compose up -d postgis otp

cd web
cp .env.example .env   # fill secrets
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Useful commands (from `web/`):

| Command            | Purpose                                                     |
| ------------------ | ----------------------------------------------------------- |
| `npm run lint`     | ESLint                                                      |
| `npx tsc --noEmit` | Typecheck                                                   |
| `npm test`         | Vitest unit / integration tests                             |
| `npm run test:e2e` | Playwright (needs app + seeded DB; reuses `localhost:3000`) |

Branch off `dev` (or `main` if you are fixing a production hotfix). Keep PRs
focused — one concern per PR when you can.

## Pull requests

- Target **`dev`** for features; use **`main`** only for urgent production fixes
  unless maintainers say otherwise.
- Confirm the CLA checkbox in the PR template. If your name is not yet in
  [`CONTRIBUTORS.md`](./CONTRIBUTORS.md), add it in the same PR.
- Describe **what** changed and **why** (user impact beats implementation detail).
- Include screenshots or a short clip for UI changes on the public map or console.
- Ensure CI is green: typecheck, lint, unit tests, and (when relevant) the GTFS
  validator gate.
- Do not commit secrets, generated `.gtfs-exports/`, or large binary dumps.
- Follow existing code style: TypeScript, App Router server actions, Untitled UI
  patterns already in the tree. Prefer small, readable diffs over drive-by refactors.

## Commit messages

Use short, imperative subjects with a conventional prefix when it fits:

- `feat:` new user-facing capability
- `fix:` bug fix
- `test:` tests only
- `docs:` documentation
- `chore:` tooling / deps / housekeeping

Example: `feat: library rail for saved and recent searches`

## Data and licensing notes

- The vendored DT4A GTFS feed under `data/gtfs-2026/` remains subject to its
  upstream terms. Dandii application code is under the
  [PolyForm Noncommercial License](./LICENSE): keep the Required Notice /
  credit Rabira Hierpa · Dandii, and do **not** use the work commercially
  without a separate written license from the copyright holder.
- Contributions are covered by the [CLA](./CLA.md). Code you did not write
  yourself — including anything copied from another repository, a blog post, or
  reproduced by an AI assistant — must be identified per
  [CLA §5](./CLA.md#5-third-party-material) rather than merged silently.
- Prefer preserving approved fare data when reseeding (`npm run db:seed`
  defaults to preserve-fares). Do not wipe production-like data casually.

## Code of conduct (short)

Be respectful. Assume good intent. No harassment, hate speech, or personal
attacks. Maintainers may refuse or revert contributions that violate this.
