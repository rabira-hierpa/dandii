# Batch D — Console Route/Stop Editor (locked design)

Status: **locked design, not yet built.** This is the plan for the console GTFS
editor (feature 5) plus the shared foundation it needs. Batch A (road-snapped
directions, stop-by-stop results, search grouping, console hover) shipped
separately.

## 1. Problem

Console operators need to correct the feed from inside Dandii: rename fragmented
stops (~36 nodes named "Megenagna"), fix route metadata, and eventually re-sequence
stops and redraw shapes — and have those corrections flow into the **published GTFS
feed** and into what riders see (directions + search), not just a downloaded zip.

Today the app can't do this. Two hard facts from the current code:

- **`lib/gtfs-export.ts` is a fares overlay.** It copies the base feed's `.txt`
  files verbatim and regenerates only `fare_attributes.txt`, `fare_rules.txt`,
  `feed_info.txt`. `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`,
  `shapes.txt` pass through untouched.
- **The DB is seeded FROM the base feed** (`prisma/seed/`) and can be wiped and
  re-seeded. Anything an operator edits only in the DB is erased on the next reseed.
- **Shapes are not stored as rows.** `Route.geojson` holds one precomputed
  LineString per route; the raw `shapes.txt` lives only in the base feed.

So feature 5 is not a UI feature. It is an architectural pivot from *"copy base +
overlay fares"* to *"the DB (base + operator edits) is authoritative for the
tables we let people edit."*

## 2. Core decision — override model, not destructive edits

We do **not** mutate the seeded GTFS rows in place (a reseed would wipe them, and
we'd lose the base-vs-edit distinction). Instead, edits are stored as **overrides**
in dedicated tables that survive reseed and are re-applied after it.

```prisma
model StopOverride {
  stopId    String   @id            // GTFS stop id
  name      String?                 // renamed stop_name (null = unchanged)
  editedById String
  editedAt  DateTime @updatedAt
  @@map("stop_override")
}

model RouteOverride {
  routeId    String  @id            // GTFS route id
  shortName  String?
  longName   String?
  color      String?
  textColor  String?
  operatorCode OperatorCode?        // reassign operator (drives per-operator agency_id)
  editedById String
  editedAt   DateTime @updatedAt
  @@map("route_override")
}

// 5b/5c only — heavier, added when those phases start:
model TripStopOverride { … }        // replacement stop_times sequence for a trip
model ShapeOverride    { … }        // replacement shape geometry for a route
```

Rules:
- An override row = "this field is operator-edited." Null field = fall back to base.
- The **seed** applies overrides as a final step (read base → apply override rows →
  write DB), so a reseed reproduces the same edited state. Overrides are never
  truncated by the seed.
- Every write goes through a server action that re-checks RBAC and appends an audit
  row (mirror the existing `FareChangeLog` pattern).

## 3. Export regeneration

`gtfs-export.ts` stops passing edited tables through verbatim. For each edited
table it **regenerates** from base + overrides:

| Table | Source | When |
|---|---|---|
| `stops.txt` | base rows, `stop_name` replaced by `StopOverride.name` | phase C (rename) |
| `routes.txt` | base rows, name/color/`agency_id` replaced by `RouteOverride` | phase A |
| `agency.txt` | already per-operator (see `scripts/otp-feed-agencies.ts`) | phase A |
| `stop_times.txt` | base rows, replaced per trip from `TripStopOverride` | phase B |
| `shapes.txt` | base rows, replaced per route from `ShapeOverride` | phase C-shape |
| `fare_*` | Fare table (unchanged) | already done |

Unedited tables still copy verbatim (fast). Each publish bumps `feed_version` and
writes a `FeedVersion` row — the existing versioning stays.

## 4. Apply / Publish pipeline — the piece that's easy to forget

Editing a name only changes the *exported zip*. For an edit to change **directions
and search**, it must reach the two systems riders hit:

- **DB** — direct-route matching (`lib/directions.ts`) and search (`api/search`)
  read Postgres.
- **OTP graph** — the transfer fallback reads OTP, built from the GTFS zip + OSM.

So publishing is a real pipeline, not a file write:

```
operator edits (override rows)
        │  "Publish" (explicit button, not per-edit)
        ▼
regenerate revised GTFS zip  →  new FeedVersion
        ├─► reseed DB from revised feed        (~seconds; direct + search reflect edits)
        └─► drop otp-data/graph.obj + rebuild  (~25s; transfers reflect edits)
```

**Decision (Q3): edits must reach riders, so the pipeline is in scope — but
Publish is explicit and batched, not automatic per edit.** An operator makes a
batch of corrections, then clicks Publish once. Per-edit OTP rebuilds (~25s each)
would be unusable. Publish shows progress and a "live as of version N" badge.

Operationally this reuses what already exists: `FeedVersion`, the OTP `--build`
path (compose already rebuilds on boot), and the seed. New work is the trigger +
status surface + running the reseed/rebuild from the app (or a queued job on the
VPS).

## 5. RBAC

New permissions in `lib/permissions.ts`, enforced in middleware → server layout →
every action (same three-layer pattern as fares/closures):

| Permission | super-admin | admin | route-operator | maintainer |
|---|---|---|---|---|
| edit stop names | ✓ | ✓ | ✓ | — |
| edit route fields (5a) | ✓ | ✓ | ✓ | — |
| edit stop sequence / shape (5b/5c) | ✓ | ✓ | ✓ | — |
| publish revised feed | ✓ | ✓ | — | — |

Publishing (reseed + OTP rebuild) is admin+ only — it affects every rider.

## 6. Editor UI — phased

Built into the console network map (which now has hover from Batch A). Clicking a
route selects it; a new **Edit** button opens the editor for the selected route.
Stop rename is reachable by clicking a stop marker.

- **5a — Route fields (cheap, one table).** Rename `shortName`/`longName`, color,
  reassign operator, edit headway/fare. All map to `RouteOverride` (+ existing Fare).
  Reassigning operator also changes the per-operator `agency_id` in the export, so
  ranking/filtering follow. **Ship this first.**
- **5c-rename — Stop names.** Click a stop → rename → `StopOverride`. This is the
  concrete answer to the "36 Megenagnas" ask (disambiguate: "Megenagna LRT",
  "Megenagna Taxi"). Independent of 5a; can ship alongside it.
- **5b — Stop sequence.** Add / remove / reorder stops on a route → rewrites
  `stop_times.txt` for that route's trips. Medium: needs a sequence editor + the
  `TripStopOverride` model + stop_times regeneration + recomputed in-vehicle times.
- **5c-shape — Shape redraw.** Draw/adjust the route line on the map → `ShapeOverride`
  + `shapes.txt` regeneration + recomputed `Route.geojson`. Hardest: needs an
  interactive polyline editor (drag vertices, snap to roads). Do last.

**Decision (Q2): order is 5a + 5c-rename → 5b → 5c-shape.** The first two deliver
most of the value (clean names, correct metadata/operator/fare) at a fraction of
the cost; shape editing is a genuine mini-CAD tool and should not block them.

## 7. Data-model gaps to close before 5b/5c

- **Per-direction shapes.** `Route.geojson` stores one shape; routes have 2 trips
  (directions) with different `shape_id`s. Batch A works around bad shapes by
  street-snapping at request time. 5c-shape needs real per-shape storage
  (`ShapeOverride` keyed by `shape_id`, or store both directions).
- **In-vehicle times.** Direct-route timing comes from `stop_time` arrival/departure
  offsets. Re-sequencing stops (5b) must recompute these (interpolate by distance),
  or the ride-time estimates go stale.

## 8. Risks

- **Reseed clobbers edits** if overrides aren't applied post-seed. The override
  tables + seed-final-apply step is the mitigation; it must land with phase A.
- **Publish is heavy** (OTP rebuild ~25s + reseed). Mitigate: explicit, batched,
  admin-only, with a job + progress UI. Consider a staging feed version before it
  goes live to riders.
- **GTFS referential integrity.** Editing must not orphan `stop_times` (deleting a
  stop referenced by trips) or break `agency_id`/`route_id` foreign keys — the
  export already guards fare_rules against non-base route_ids; extend that discipline.
- **Scope creep into a full GTFS editor.** Keep phases hard-walled; 5c-shape is the
  natural stopping point to reassess.

## 9. Effort (CC-assisted)

| Phase | Scope | Rough size |
|---|---|---|
| Foundation | override tables + seed apply + export regen + RBAC | 1 unit |
| Apply/Publish | trigger + reseed + OTP rebuild + status UI | 1 unit |
| 5a | route field editor | 0.5 unit |
| 5c-rename | stop name editor | 0.5 unit |
| 5b | stop-sequence editor + stop_times regen + time recompute | 1.5 units |
| 5c-shape | interactive shape editor + shapes regen | 2+ units |

Foundation + Apply/Publish are the prerequisite for everything; 5a + 5c-rename are
the first shippable operator-visible value on top of them.

---

# Batch D part 2 — Route tabs + operator-authored entities

Locked 2026-08-12. Supersedes §6's "Edit button" sketch: the console's left panel
gets a tab bar per selected route, modelled on GTFS-X (screenshots in the
2026-08-12 session). Two decisions were taken at the gate.

## D1 — Tab set: Details, Stops, Trips, Service

GTFS-X shows six tabs. We ship four, chosen by whether the Addis feed actually
carries the data:

| Tab | Ships | Why |
|---|---|---|
| Details | ✓ | names/color/operator are `RouteOverride` (foundation done) |
| Stops | ✓ | `StopTime.sequence` + `StopOverride.name` |
| Trips | ✓ | read-only; every one of 9,067 stop_times has a time |
| Service | ✓ | our own concept — the closure form moves here from the bare panel |
| Shapes | deferred | see "Shape collapse" below — needs per-shape storage first |
| Costs | dropped | US planning metrics (deadhead, peak vehicles, USD); nothing consumes them |
| Coverage | dropped | needs census/population data we don't have |

Fields GTFS-X shows that this feed cannot fill, and which are therefore NOT built:
`route_desc` (present as a column, empty on all 447 routes), `route_url`,
`block_id`, and `continuous_pickup`/`continuous_drop_off` (no such columns).

## D2 — Operator-authored entities (full CRUD)

The gate chose full CRUD: create, duplicate and delete, not just field overrides.
That breaks the foundation's core assumption — "every override falls back to a
base-feed value" — because a created stop has no base row to fall back to, and a
deleted feed row comes straight back on the next reseed. So the model grows a
provenance axis.

### Provenance

```prisma
enum EntityOrigin { FEED | OPERATOR }
// on Route and Stop, @default(FEED)
```

Three states, each with one storage rule:

| State | Where the truth lives | Reseed behaviour |
|---|---|---|
| Feed row, unedited | `route` / `stop` | reloaded from the feed |
| Feed row, edited | base row + `*Override` field | reloaded, then override replayed |
| Operator-created | base row with `origin = OPERATOR` | **not deleted, not reloaded** |
| Feed row, deleted | base row + override with `deletedAt` | reloaded, then removed by apply |

An operator-created entity needs no override row: the base row *is* the truth.
Only feed rows carry overrides. This keeps one writer per fact.

### Deletion is a tombstone, never a DELETE

Deleting a feed route with `DELETE FROM route` is a lie — the next reseed
resurrects it. Deletion sets `deletedAt` on the override row; the seed's apply
step removes the reloaded row afterwards. Deleting an *operator-created* entity
is a real delete, since nothing will bring it back.

Deleting a stop that other routes still serve must be refused, not cascaded —
cascading would silently shorten unrelated routes.

### Id namespacing

Feed ids are `node/…` / `way/…` for stops and numeric for routes. Operator
entities get an `op:` prefix (`op:<cuid>`), which cannot collide with either,
so a future DT4A revision can never overwrite operator work by id reuse.

### Consequences for what shipped on 2026-08-10

Full CRUD invalidates three assumptions in the foundation commit. These are
corrections to existing code, not new files:

1. `prisma/seed/index.ts` — `stop.deleteMany()` and `route.deleteMany()` must be
   scoped to `where: { origin: 'FEED' }`, or every reseed wipes operator-created
   entities.
2. `prisma/seed/apply-overrides.ts` — currently patches fields only. It must also
   drop tombstoned feed rows.
3. `src/lib/gtfs-overrides.ts` — `applyStopOverridesToCsv` /
   `applyRouteOverridesToCsv` patch rows by id and ignore unknown ids by design.
   They must additionally **append** `origin = OPERATOR` rows and **omit**
   tombstoned ones, or operator work never reaches the exported feed or OTP.

## Schema deltas

| Change | Unblocks |
|---|---|
| `Route.origin`, `Stop.origin` (`EntityOrigin`, default FEED) | create/delete |
| `RouteOverride.deletedAt`, `StopOverride.deletedAt` | delete feed rows |
| `Trip.directionId Int?` | direction labels (Details), direction selector (Stops), direction column (Trips) |
| `RouteOverride.type Int?` | editable route type |

`direction_id` is already in `trips.txt` and fully populated (447 direction-0
trips, 444 direction-1) — the seed simply never read it. One column plus a
reseed turns three tabs from partial to complete.

## Shape collapse — a live bug, not an editor gap

`prisma/seed/index.ts:118` keeps only the first `shape_id` per route:

```ts
if (trip.shape_id && !routeShapeId.has(trip.route_id)) { … }
```

**444 of 447 routes have two shapes**, one per direction. The rider map therefore
draws the outbound geometry and discards the inbound for 99% of the network, and
the partial-closure split slices a one-direction line. This is why GTFS-X shows
"Shapes 2".

Fixing it (a real `Shape` table keyed by `shape_id`, `Route.geojson` per
direction) is the prerequisite for the Shapes tab, but it is worth doing on its
own merits before any editor work — it is data loss visible to riders today.

## Phase order

| Phase | Scope | Size |
|---|---|---|
| T0 | provenance schema + seed/apply/export corrections above | 1 unit |
| T1 | tab shell + Details (5a) + create/duplicate/delete route | 1 unit |
| T2 | Stops tab: ordered list, rename (5c-rename), create/delete stop | 1 unit |
| T3 | Trips tab (read-only) + Service tab (move closure form) | 0.5 unit |
| T4 | stop reordering (5b — `TripStopOverride` + stop_times regen) | 1.5 units |
| — | shape-collapse fix + `Shape` table, then Shapes tab (5c-shape) | 2+ units |

T0 must land before T1: shipping create/delete against the current seed would
lose operator work on the first reseed.
