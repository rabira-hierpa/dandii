# Dandii Wiki

**Dandii** is a role-based public transport route management system for **Addis Ababa**, built on the DT4A **GTFS 2026** feed (447 routes across Anbessa, Sheger, Alliance, the minibus associations, and the Addis LRT). It pairs a public, Google-Maps-style transit map with a network operations console for transport officials, and a crowdsourced fare registry that keeps fares honest through the people who actually ride.

> The name **Dandii** means *"road / route"* in Afaan Oromo.

This wiki is the deep reference for developers and operators. For a fast overview and quick-start, see the repository [README](https://github.com/rabira-hierpa/dandii/blob/main/README.md).

---

## What Dandii does

| Surface | Route | Who | What it's for |
|---|---|---|---|
| **Public map** | `/` | Anyone | Search routes and stops, view a route's stops, headways and fare, plan a journey, and (signed in) save routes and submit fare corrections. |
| **Operations console** | `/console` | Staff roles | Agency overview, route→operator assignment, network open/close, fare management, rider fare-edit review, and versioned GTFS export. |
| **Rider profile** | `/profile` | Signed-in riders | Manage display name, review submitted fares and saved routes. |
| **Settings** | `/settings` | Admins | Member/role management and system info. |

## The crowdsourced-fare loop (the core idea)

```
Rider submits a fare correction  →  Maintainer approves in the console
        (public map)                        (Fare Review)
                                                 │
                        Approved fare is live for every user (from the DB)
                                                 │
                    Maintainer generates a versioned GTFS export (fares overlay)
                                                 │
                        CI validator gate proves the feed is still valid
```

See [Crowdsourced Fares](Crowdsourced-Fares) for the full design.

---

## Start here

- New to the project? → **[Getting Started](Getting-Started)** (clone to running app in a few steps)
- Want the big picture? → **[Architecture](Architecture)**
- Building a feature? → **[Development and Testing](Development-and-Testing)**
- Operating the console? → **[Operations Console](Operations-Console)**

## Table of contents

**Explanation (why)**
- [Architecture](Architecture)
- [GTFS Data and Seeding](GTFS-Data-and-Seeding)
- [Crowdsourced Fares](Crowdsourced-Fares)

**Reference (what)**
- [Data Model](Data-Model)
- [Roles and Permissions](Roles-and-Permissions)
- [API Reference](API-Reference)
- [Configuration](Configuration)

**How-to (tasks)**
- [Operations Console](Operations-Console)
- [Public Map](Public-Map)
- [GTFS Export and Feed Versions](GTFS-Export-and-Feed-Versions)
- [Deployment](Deployment)

**Tutorial (learning)**
- [Getting Started](Getting-Started)

**Support**
- [Development and Testing](Development-and-Testing)
- [Troubleshooting](Troubleshooting)

---

## Tech stack at a glance

- **Web**: Next.js 16 (App Router, `output: "standalone"`), TypeScript, Tailwind v4, Untitled UI (react-aria)
- **Map**: MapLibre GL JS + react-map-gl, OpenFreeMap basemap (no API key)
- **Auth**: better-auth + Google OAuth + Prisma adapter, admin plugin access-control
- **DB**: PostgreSQL (PostGIS image), Prisma 7 with the `@prisma/adapter-pg` driver adapter
- **Journey planning**: OpenTripPlanner 2.x (GTFS GraphQL API)
- **State/forms**: Zustand, react-hook-form + zod
- **Testing/CI**: Vitest, Playwright, GitHub Actions, MobilityData GTFS validator gate

Current release: **v1.0.0** · License: see [LICENSE](https://github.com/rabira-hierpa/dandii/blob/main/LICENSE).
