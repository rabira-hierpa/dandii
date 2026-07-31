import { sendGAEvent } from "@next/third-parties/google";

/**
 * Centralized GA4 custom events. One named function per meaningful user action
 * so call sites read clearly and event names stay consistent across the app.
 *
 * `sendGAEvent` queues until gtag loads and no-ops when GA isn't configured
 * (G4A_TAG unset), so every call here is safe — nothing throws if analytics is
 * off. We deliberately instrument the essential actions, not every click.
 */
type Value = string | number | boolean | undefined;

function track(event: string, params: Record<string, Value> = {}) {
  if (typeof window === "undefined") return;
  sendGAEvent("event", event, params);
}

export const ga = {
  // --- Public map ---
  search: (term: string) => track("search", { search_term: term }),
  selectRoute: (routeId: string, operator?: string | null) =>
    track("select_route", { route_id: routeId, operator: operator ?? "none" }),
  selectStop: (stopId: string) => track("select_stop", { stop_id: stopId }),
  directionsRequest: (fromId: string, toId: string) =>
    track("directions_request", { from_id: fromId, to_id: toId }),
  filterAgency: (context: "explore" | "directions", operators: string[]) =>
    track("filter_agency", { context, operators: operators.join(",") || "all" }),
  toggleLayer: (layer: string, visible: boolean) =>
    track("toggle_layer", { layer, visible }),
  openAccountMenu: () => track("open_account_menu"),
  useMyLocation: () => track("use_my_location"),
  saveRoute: (routeId: string, saved: boolean) =>
    track("save_route", { route_id: routeId, saved }),
  fareProposalSubmit: (routeId: string) =>
    track("fare_proposal_submit", { route_id: routeId }),

  // --- Operations console ---
  consoleSelectRoute: (routeId: string) =>
    track("console_select_route", { route_id: routeId }),
  consoleCloseRoute: (routeId: string, reason: string) =>
    track("console_close_route", { route_id: routeId, reason }),
  consoleReopenRoute: (routeId: string) =>
    track("console_reopen_route", { route_id: routeId }),
  consoleReviewFare: (proposalId: string, decision: "approve" | "reject") =>
    track("console_review_fare", { proposal_id: proposalId, decision }),
};
