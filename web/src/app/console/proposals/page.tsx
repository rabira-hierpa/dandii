import { ConsolePageHeader } from "@/components/console/page-header";
import type { OperatorCode } from "@/lib/operators";
import { CONSOLE_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ReviewQueue, type RouteGroup } from "./review-queue";

export const dynamic = "force-dynamic";

interface FareShape {
  kind: "FLAT" | "TIERED";
  flatAmountEtb: number | null;
  tiers: { label: string; amountEtb: number }[];
}

/** Human label for a fare snapshot (null = no fare on record). */
function fareLabel(fare: FareShape | null): string {
  if (!fare) return "No fare set";
  if (fare.kind === "FLAT") {
    return fare.flatAmountEtb != null
      ? `${fare.flatAmountEtb} ETB flat`
      : "Flat";
  }
  if (fare.tiers.length === 0) return "Tiered";
  const amounts = fare.tiers.map((t) => t.amountEtb);
  return `Tiered · ${Math.min(...amounts)}–${Math.max(...amounts)} ETB`;
}

/** Stable key so identical proposals on a route can be counted as agreement. */
function fareKey(fare: FareShape): string {
  if (fare.kind === "FLAT") return `F:${fare.flatAmountEtb ?? 0}`;
  return `T:${fare.tiers.map((t) => `${t.label}=${t.amountEtb}`).join("|")}`;
}

export default async function ProposalsReviewPage() {
  await requireRole(CONSOLE_ROLES);

  const proposals = await prisma.fareProposal.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      note: true,
      createdAt: true,
      submittedById: true,
      proposedKind: true,
      proposedFlatEtb: true,
      proposedTiers: true,
      baselineKind: true,
      baselineFlatEtb: true,
      baselineTiers: true,
      route: {
        select: {
          id: true,
          shortName: true,
          longName: true,
          assignment: { select: { operator: { select: { code: true } } } },
          fare: {
            select: {
              kind: true,
              flatAmountEtb: true,
              tiers: {
                select: { label: true, amountEtb: true },
                orderBy: { fromKm: "asc" },
              },
            },
          },
        },
      },
    },
  });

  // submittedById is a plain String (no User relation, design 1A) — resolve
  // display names in one batched query.
  const submitterIds = [...new Set(proposals.map((p) => p.submittedById))];
  const submitters = await prisma.user.findMany({
    where: { id: { in: submitterIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(submitters.map((u) => [u.id, u.name]));

  // Build proposed / baseline fare shapes from the proposal's columns.
  const toShape = (
    kind: "FLAT" | "TIERED" | null,
    flat: { toNumber(): number } | null,
    tiersJson: unknown,
  ): FareShape | null => {
    if (!kind) return null;
    const tiers =
      (tiersJson as { label: string; amountEtb: number }[] | null) ?? [];
    return {
      kind,
      flatAmountEtb: flat?.toNumber() ?? null,
      tiers,
    };
  };

  // Group by route, preserving first-seen order (oldest proposal first).
  const groupMap = new Map<string, RouteGroup>();
  for (const p of proposals) {
    const proposed = toShape(
      p.proposedKind,
      p.proposedFlatEtb,
      p.proposedTiers,
    )!;
    const baseline = toShape(
      p.baselineKind,
      p.baselineFlatEtb,
      p.baselineTiers,
    );
    const current: FareShape | null = p.route.fare
      ? {
          kind: p.route.fare.kind,
          flatAmountEtb: p.route.fare.flatAmountEtb?.toNumber() ?? null,
          tiers: p.route.fare.tiers.map((t) => ({
            label: t.label,
            amountEtb: t.amountEtb.toNumber(),
          })),
        }
      : null;

    let group = groupMap.get(p.route.id);
    if (!group) {
      group = {
        routeId: p.route.id,
        shortName: p.route.shortName,
        longName: p.route.longName,
        operatorCode:
          (p.route.assignment?.operator.code as OperatorCode | undefined) ??
          null,
        currentLabel: fareLabel(current),
        proposals: [],
        agreement: null,
      };
      groupMap.set(p.route.id, group);
    }

    group.proposals.push({
      id: p.id,
      submitterName: nameById.get(p.submittedById) ?? "A rider",
      createdAt: p.createdAt.toISOString(),
      note: p.note,
      proposedLabel: fareLabel(proposed),
      proposedKey: fareKey(proposed),
      baselineLabel: fareLabel(baseline),
      baselineChanged: baseline
        ? fareKey(baseline) !== fareKey(current!)
        : false,
    });
  }

  // Agreement: if 2+ pending proposals on a route share the same value.
  const groups = [...groupMap.values()];
  for (const group of groups) {
    const counts = new Map<string, { count: number; label: string }>();
    for (const p of group.proposals) {
      const entry = counts.get(p.proposedKey) ?? {
        count: 0,
        label: p.proposedLabel,
      };
      entry.count += 1;
      counts.set(p.proposedKey, entry);
    }
    let top: { count: number; label: string } | null = null;
    for (const entry of counts.values()) {
      if (entry.count >= 2 && (!top || entry.count > top.count)) top = entry;
    }
    group.agreement = top;
  }

  const totalPending = proposals.length;

  return (
    <>
      <ConsolePageHeader
        title="Fare Review"
        subtitle="Rider-submitted fare corrections awaiting approval"
        action={
          totalPending > 0 ? (
            <span className="shrink-0 rounded-full bg-[#FEF3C7] px-3 py-1 text-[12.5px] font-semibold text-[#92400E]">
              {totalPending} pending
            </span>
          ) : undefined
        }
      />
      <ReviewQueue groups={groups} />
    </>
  );
}
