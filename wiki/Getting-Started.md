# Getting Started

This walks you from a clean checkout to a running Dandii with all 447 Addis Ababa routes on the map. By the end you'll have the public map, the seeded database, and (optionally) a signed-in console.

**Time to first map: 4 commands.**

## What you'll need

- **Docker** + Docker Compose (for PostgreSQL/PostGIS and OpenTripPlanner)
- **Node.js 22+** and npm
- ~2 GB free disk (the GTFS feed and OTP graph are vendored/built locally)
- Optional, for sign-in: a **Google OAuth** client (see [Configuration](Configuration))

## Step 1: Clone and start the backing services

```bash
git clone https://github.com/rabira-hierpa/dandii.git
cd dandii
docker compose up -d postgis otp
```

This starts:
- **PostGIS** (`dandii-dev-db`) on host port **5433** (bound to `127.0.0.1`).
- **OpenTripPlanner** (`otp-routing`) on host port **8081**. On first start OTP builds its routing graph from `otp-data/` (~2 min). It's transit-only (no street walk legs).

Check they're healthy:

```bash
docker compose ps
```

## Step 2: Configure the web app

```bash
cd web
cp .env.example .env
```

Open `web/.env` and set at minimum:

```bash
# Host-mapped PostGIS port is 5433 (not 5432) when the app runs on your host:
DATABASE_URL="postgresql://admin:adminpassword@localhost:5433/gtfs_dev_db"
BETTER_AUTH_SECRET="run: openssl rand -base64 32"
BETTER_AUTH_URL="http://localhost:3000"
OTP_URL="http://localhost:8081"
```

Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and `SUPER_ADMIN_EMAIL` are only needed to **sign in**. The public map works signed-out. See [Configuration](Configuration) for the full list.

## Step 3: Migrate and seed the database

```bash
npm install
npm run db:migrate     # applies Prisma migrations (also generates the client)
npm run db:seed        # imports the GTFS 2026 feed
```

The seed parses the vendored feed in `data/gtfs-2026/`, derives operators, precomputes route geometry, and inserts default fares. Expected result:

```
447 routes · 5 operators (Anbessa 122 / Sheger 46 / Minibus 251 / Alliance 26 / LRT 2)
2270 stop rows · 891 frequency-based trips
```

The seed is **idempotent and fare-preserving by default** — re-running it never discards crowdsourced fares. Pass `--destructive` for a full wipe + reseed. See [GTFS Data and Seeding](GTFS-Data-and-Seeding).

## Step 4: Run the app

```bash
npm run dev
```

Open **http://localhost:3000**. You should see the full Addis network — every route shape rendered on a WebGL map, colored by operator, with a floating search panel. Search `AB001`, click a result, and the route detail opens with its stops, headway, and fare.

**That's the first result.** Everything below is optional.

## Optional: Sign in and reach the console

1. Create a Google OAuth client and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `web/.env` (redirect URI `http://localhost:3000/api/auth/callback/google`).
2. Set `SUPER_ADMIN_EMAIL` to the Google account you'll sign in with — that account is bootstrapped as `super-admin` on first login.
3. Restart `npm run dev`, click **Sign in**, and complete Google sign-in.
4. Signed-in riders can save routes and submit fare corrections. The super-admin can open **`/console`**.

For a fast local sign-in without Google (dev only), see the dev-session helper described in [Development and Testing](Development-and-Testing).

## What you built

You now have the complete Dandii stack running locally: PostGIS + OTP in Docker, a seeded 447-route database, and the Next.js app serving the public map and the console. Next:

- Understand the pieces → [Architecture](Architecture)
- Walk the fare loop → [Crowdsourced Fares](Crowdsourced-Fares)
- Operate the console → [Operations Console](Operations-Console)
