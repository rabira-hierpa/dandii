# Design: Contributor Rewards + Amharic (locked direction)

Status: **design doc, not built.** Output of an office-hours session. Two
features: a fare-contribution reward system (Google Maps Local Guides style),
and Amharic translation of the rider-facing app.

## 1. Problem

Fares are crowdsourced (`FareProposal` → console review → approve). The registry
is only as good as rider participation, and today there's no reason for a rider to
bother submitting a correction. We want a motivator that drives **accurate**
contributions, plus an Amharic UI so the app is usable by riders who don't read
English.

## 2. The premise that shapes the reward design

Reward **approval**, not submission. Dandii's value is fare *accuracy*. If points
flow for hitting "submit," people farm points with junk and the review queue
drowns. Local Guides works on **status + impact + occasional perks**, not because
points are intrinsically valuable. So:

- **Submit → +2** (small nod, instant acknowledgment).
- **Approved → +20** (the real reward, gated by a human reviewer = quality signal).
- **Rejected → clawback the +2** (junk nets zero — clean anti-spam without punishing honest wrong guesses beyond removing the nod).
- **Superseded → +10** partial credit (your fare was right, someone's just landed first — uses the existing `SUPERSEDED` status; fairness).

Same two-stage dopamine the rider wants (instant nod + bigger delayed prize),
no incentive to degrade the data.

## 3. Reward system — "Fare Scout" status ladder (chosen direction)

Non-spendable points → levels → badges → a contributor profile. Zero marginal
cost. Redeemable perks (operator discounts, free-ride credits) are a **later**
phase, gated on partnerships.

### Points ledger (source of truth)
Append-only, mirrors the existing `FareChangeLog` pattern. `User.points` is a
cached sum; the ledger is the audit trail and enables clawbacks + abuse forensics.

```prisma
model PointsLedger {
  id         String   @id @default(cuid())
  userId     String
  delta      Int
  reason     PointsReason  // SUBMIT | APPROVED | REJECT_CLAWBACK | SUPERSEDED_CREDIT | BADGE_BONUS | BACKFILL
  proposalId String?
  createdAt  DateTime @default(now())
  // Idempotency: one award per (proposal, reason) so a double-fire can't double-pay.
  @@unique([proposalId, reason])
  @@index([userId, createdAt])
  @@map("points_ledger")
}

model UserBadge {
  userId   String
  badge    String   // "first_fix" | "reliable_reporter" | "fare_authority" | "network_explorer" | "consistent_commuter"
  earnedAt DateTime @default(now())
  @@id([userId, badge])
  @@map("user_badge")
}
```
`User` gains `points Int @default(0)`. **Level is derived** from points (a pure
threshold table), never stored — no drift.

### Levels (derived from points)
| Level | Points | Title |
|---|---|---|
| 1 | 0 | Newcomer |
| 2 | 25 | Fare Spotter |
| 3 | 75 | Fare Scout |
| 4 | 200 | Route Ranger |
| 5 | 500 | Transit Guardian |
| 6+ | 1000, 2000, … | (scale) |

### Badges (milestones, event-based)
First approved (`first_fix`), 10 approved (`reliable_reporter`), 50 approved
(`fare_authority`), approved fares across ≥3 operators (`network_explorer`),
contributions in N consecutive weeks (`consistent_commuter`). Each badge is a
small point bonus + a visible pin.

### Where it hooks in (existing code)
- `actions/fare-proposals.ts` — on submit: write a `SUBMIT` ledger row (+2), in the same transaction as the proposal insert.
- The approval path (status → `APPROVED`): write an `APPROVED` ledger row (+20) for `submittedById`, re-derive badges, in the same transaction as the status change. On `REJECTED`: `REJECT_CLAWBACK` (-2). On `SUPERSEDED`: `SUPERSEDED_CREDIT` (+10).
- Guard: reviewer (`reviewedById`) must differ from `submittedById` — no self-reward.

### Contributor profile ("My Contributions")
Extends the existing My Submissions view (the avatar already carries an
unseen-count badge via `User.lastSubmissionsViewedAt`). Shows: points, current
level + **progress bar to next level**, badges, approved/pending counts, and an
impact line ("your 8 approved fares are live on 6 routes"). Level-ups get a
celebration moment (Local Guides-style) surfaced via the existing unseen-events
channel — "Your fare for AB014 was approved. +20. You're now a Fare Scout."

### Anti-gaming (summary)
Clawback on reject · submit nod is nominal · one award per (proposal, reason) via
the unique index · reviewer ≠ submitter · soft cap on open pending proposals per
user.

### Retro credit
One-time backfill: award points for already-approved `FareProposal`s so early
contributors aren't punished for being early, and the leaderboard seeds non-empty.

## 4. Amharic (i18n)

Lower design ambiguity — a known pattern. Scope it to the **rider-facing app**.

- **Library:** `next-intl` (App Router-native; Dandii is Next 16 App Router). Cookie/header-based locale with `localePrefix: "as-needed"` so English URLs stay clean and `/am/...` works for shareable Amharic links, without restructuring every route by hand up front.
- **Locales:** `en` (default), `am`.
- **Script/font:** Amharic is Ge'ez script, **LTR** (no RTL mirroring). Poppins doesn't cover Ge'ez glyphs — add **Noto Sans Ethiopic** for `am`.
- **Toggle:** EN / አማርኛ in the header/account menu, persisted to a cookie, seeded from `Accept-Language`.
- **Scope:** public map (search, directions, route/stop detail), account, the fare-proposal flow, and the new reward UI (built i18n-first). Console (operator-facing) stays English for v1 — small internal group.
- **Out of scope v1:** translating GTFS **stop/route names** (feed data, currently English/transliterated). That's a data effort that ties into the Batch D stop-name editor (operators add Amharic names → bilingual feed). Noted as a future link, not v1.
- **Reality check:** machine translation gets a draft, but a **native Amharic speaker must review every string** — transit terms and tone matter. This is the real gate on the feature, not the code.

## 5. Phasing

| Phase | Scope | Size |
|---|---|---|
| R1 | Points ledger + badges schema, award hooks in fare-proposals, level/badge derivation, "My Contributions" profile with progress bar, level-up notice, retro backfill | M |
| R2 | Leaderboard (opt-in), streaks, corridor badges, level-up celebration polish, optional public profiles | M |
| I1 | next-intl setup, extract rider-facing strings, Noto Sans Ethiopic, EN/አማ toggle, Amharic translation (human-reviewed) | M (blocked on a translator) |
| Later | Redeemable perks (operator discounts / ride credits) once partnerships exist; bilingual feed names with Batch D | — |

R1 and I1 are independent and can run in parallel. Perks and bilingual names are
explicitly deferred.

## 6. Open decisions
- **Public profiles / leaderboard:** default to private "My Contributions"; make public profile + city leaderboard opt-in (privacy). Recommend private-first.
- **Exact point values / level thresholds:** the table above is a starting point; tune after seeing real submission volume.
- **Perks trigger:** revisit redeemable perks only after at least one operator partnership exists to fund them.

## 7. The assignment (do this before building)
The reward system's risk is motivational, not technical: *will status actually get
riders to submit fares?* Two cheap real-world checks first:
1. **Talk to the people who already submitted fares.** Pull the existing
   `FareProposal` submitters and ask 3–5 of them why they bothered, and what would
   make them do it again — status, seeing it go live, or something tangible. Their
   answer tells you whether the ladder or the impact line is the real hook.
2. **Recruit one native Amharic speaker to own translation review.** The Amharic
   feature is blocked on human-verified strings, not code. Line that person up now.
