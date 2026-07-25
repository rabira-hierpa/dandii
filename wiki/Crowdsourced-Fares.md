# Crowdsourced Fares

This is Dandii's core idea. This page explains why it exists, how the flow works end to end, and the concurrency rules that keep it correct under real use.

## The problem

Addis Ababa fares change faster than any official update cycle. A conductor starts charging a new price on Monday; the published feed won't reflect it for weeks or months. A transit app that shows a stale fare is worse than one that shows none. But a single maintainer can't track every line by hand either.

## The approach

Let the people who ride keep the data honest, with a maintainer in the loop:

```
1. Rider opens a route on the public map and submits a fare correction
      (a whole-fare replacement: one flat amount, or per-tier amounts)
                              │
2. Maintainer sees it in the console Fare Review queue, grouped by route,
      with a three-way diff (what the rider saw → what they propose →
      the live fare now) and an "N riders agree" pill when edits corroborate
                              │
3. Maintainer approves → the fare is written via applyFareChange():
      • Fare row updated       • FareChangeLog row appended (audit)
      • Every other PENDING proposal on that route marked SUPERSEDED
                              │
4. The approved fare is live immediately for every user (read from the DB).
      Visibility is NOT gated on any export step.
                              │
5. Separately, a maintainer generates a versioned GTFS export for downstream
      consumers, and CI proves the feed still validates.
```

Steps 1–4 are the wedge; step 5 is decoupled on purpose (see [GTFS Export and Feed Versions](GTFS-Export-and-Feed-Versions)).

## One write path: `applyFareChange()`

Every fare mutation — a console edit, a proposal approval, or a reseed — funnels through a single permission-free helper, `applyFareChange(tx, routeId, data, meta)` in `src/lib/fare-write.ts`. It reads the before-image, upserts the `Fare` (+ tiers), and appends a `FareChangeLog` row tagged with the `source`. Because there's exactly one path, the audit log can never be bypassed. Permission checks live in the *callers* (the server actions), not the helper.

## Server actions

`src/actions/fare-proposals.ts`:

- **`submitProposal(input)`** — rider path. Guards: signed in, one PENDING proposal per route (the partial-unique index; a `P2002` is caught and returned as a friendly "you already have a pending edit"), a rolling 24-hour rate limit (5/day), and zod amount validation (positive, ≤ 1000 ETB) at submit. Snapshots the current fare as the `baseline` so the reviewer's diff is stable.
- **`reviewProposal(input)`** — maintainer path. Requires the `proposal:review` permission. Approve or reject.

## Concurrency and integrity rules

These are the rules that make the queue safe when multiple riders and maintainers act at once:

| Rule | Mechanism | Prevents |
|---|---|---|
| One open edit per rider per route | Partial unique index `WHERE status='PENDING'` | Spam / duplicate pendings |
| Rate limit | 5 proposals per rolling 24h per user | Abuse |
| Amount sanity | zod `> 0` and `≤ 1000 ETB`, at **both** submit and approval | Absurd/malicious values reaching the DB or feed |
| No double-decision | Approve/reject via `updateMany ... WHERE status='PENDING'`; 0 rows updated ⇒ another maintainer already decided | Two maintainers deciding the same proposal |
| Cross-user consolidation | On approve, sibling PENDING proposals on the route are set `SUPERSEDED` | Re-reviewing edits an approval already resolved |
| Stable diffs | `baseline*` snapshot taken at submit time | The diff shifting if the live fare changes mid-review |
| Audit survives deletion | `submittedById` / `reviewedById` are plain Strings (no FK) | Losing history when a user is deleted/banned |

## What the rider sees

- **Before decision** — their submission appears under **Submitted fares** (in the account menu / `/profile`) as **Pending**.
- **After decision** — **Approved**, **Rejected** (with the maintainer's reason), or **Resolved** (superseded by another approved edit).
- **Unseen badge** — the avatar shows a count of edits decided since they last looked; it clears when they view their submissions (`User.lastSubmissionsViewedAt`).

## Trade-off: tiered fares and GTFS V1

Approved **tiered** fares render fully in Dandii's own UI, but are **omitted** from the GTFS V1 export. GTFS Fares V1 without stop zones can carry only one price per route; exporting the tier ceiling would systematically overstate short trips, and Dandii is an accuracy product. Downstream consumers see "unknown" (honest) rather than a wrong number until phase-2 zone synthesis. Flat fares export normally. See [GTFS Export and Feed Versions](GTFS-Export-and-Feed-Versions).

## Related

- [Operations Console](Operations-Console) — the Fare Review queue UI
- [Public Map](Public-Map) — the rider submission form
- [Roles and Permissions](Roles-and-Permissions) — who can review
- [Data Model](Data-Model) — `FareProposal`, `FareChangeLog`
