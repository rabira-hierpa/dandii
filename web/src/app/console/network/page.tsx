import { NetworkMap, type NetworkRoute } from "@/components/console/network-map";
import { getTranslations } from "next-intl/server";
import { ConsolePageHeader } from "@/components/console/page-header";
import type { ClosureReasonValue, OperatorCode } from "@/lib/operators";
import { CONSOLE_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireConsoleScope } from "@/lib/session";
import { activeClosureFilter } from "@/lib/transit";

export const dynamic = "force-dynamic";

export default async function NetworkMapPage() {
  const t = await getTranslations("console");
  const { role, routeWhere } = await requireConsoleScope(CONSOLE_ROLES);

  const routes = await prisma.route.findMany({
    where: routeWhere,
    select: {
      id: true,
      shortName: true,
      longName: true,
      assignment: { select: { operator: { select: { code: true } } } },
      closures: {
        where: activeClosureFilter(),
        select: {
          id: true,
          reason: true,
          note: true,
          endsAt: true,
          kind: true,
          fromStopId: true,
          toStopId: true,
        },
        orderBy: { endsAt: "desc" },
        take: 1,
      },
    },
    orderBy: { shortName: "asc" },
  });

  const networkRoutes: NetworkRoute[] = routes.map((route) => {
    const c = route.closures[0];
    return {
      id: route.id,
      shortName: route.shortName,
      longName: route.longName,
      operatorCode:
        (route.assignment?.operator.code as OperatorCode | undefined) ?? null,
      closure: c
        ? {
            id: c.id,
            reason: c.reason as ClosureReasonValue,
            note: c.note,
            endsAt: c.endsAt.toISOString(),
            kind: c.kind as "WHOLE_ROUTE" | "SEVERED" | "SKIPPED",
            fromStopId: c.fromStopId,
            toStopId: c.toStopId,
          }
        : null,
    };
  });

  return (
    <>
      <ConsolePageHeader
        title={t("network.title")}
        subtitle={t("network.subtitle")}
      />
      <NetworkMap routes={networkRoutes} isMaintainer={role === "maintainer"} />
    </>
  );
}
