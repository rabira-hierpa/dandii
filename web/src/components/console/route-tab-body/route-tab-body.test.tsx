// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useRouteEditorStore } from "@/stores/route-editor-store";
import type { NetworkRoute } from "@/components/console/network-map";
import type { RouteEditorDetail } from "@/types/console";

/**
 * The first component test in the repo, and it exists for a specific bug.
 *
 * When the route detail fetch failed, this returned `null` and four of the five
 * editor tabs went blank — no message, no retry, no sign anything had gone
 * wrong. During QA that made one failing request look like a broken editor. The
 * bug was fixed on sight; it had no automated guard because there was no way to
 * render a component in this suite. Now there is.
 */

// The tabs themselves pull in maplibre, dnd-kit and server actions. This test is
// about which branch the body takes, not what the tabs draw, so they are stubbed.
vi.mock("@/components/console/route-details-tab", () => ({
  RouteDetailsTab: () => <div>details tab</div>,
}));
vi.mock("@/components/console/route-stops-tab", () => ({
  RouteStopsTab: () => <div>stops tab</div>,
}));
vi.mock("@/components/console/route-trips-tab", () => ({
  RouteTripsTab: () => <div>trips tab</div>,
}));
vi.mock("@/components/console/route-shapes-tab", () => ({
  RouteShapesTab: () => <div>shapes tab</div>,
  directionLabel: () => "Outbound",
}));
vi.mock("@/components/console/route-service-tab", () => ({
  RouteServiceTab: () => <div>service tab</div>,
}));

const { RouteTabBody } = await import("./route-tab-body");

const ROUTE: NetworkRoute = {
  id: "route-1",
  shortName: "A24",
  longName: "Mexico ↔ Megenagna",
  operatorCode: "ALLIANCE",
  closure: null,
};

const DETAIL = { id: "route-1" } as RouteEditorDetail;

const renderBody = (onChanged = vi.fn()) =>
  render(
    <RouteTabBody
      route={ROUTE}
      isMaintainer={false}
      canDraw
      onChanged={onChanged}
    />,
  );

beforeEach(() => {
  useRouteEditorStore.setState({
    activeTab: "details",
    detail: DETAIL,
    detailLoading: false,
  });
});

afterEach(cleanup);

describe("RouteTabBody", () => {
  it("renders the tab the store says is active", () => {
    useRouteEditorStore.setState({ activeTab: "stops" });

    renderBody();

    expect(screen.getByText("stops tab")).toBeDefined();
  });

  it("shows a loading affordance while the detail is in flight", () => {
    useRouteEditorStore.setState({ detail: null, detailLoading: true });

    renderBody();

    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("says so when the detail could not be loaded", () => {
    // The regression. This used to render nothing at all.
    useRouteEditorStore.setState({ detail: null, detailLoading: false });

    renderBody();

    expect(
      screen.getByText(/Couldn't load this route's details/),
    ).toBeDefined();
  });

  it("offers a retry that re-runs the fetch", () => {
    useRouteEditorStore.setState({ detail: null, detailLoading: false });
    const onChanged = vi.fn();

    renderBody(onChanged);
    screen.getByRole("button", { name: "Retry" }).click();

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("still renders Service when the detail failed", () => {
    // Service reads the route row, not the editor payload, so it is the one tab
    // that has something to show. This asymmetry is what made a single failed
    // request look like "four tabs are broken".
    useRouteEditorStore.setState({
      activeTab: "service",
      detail: null,
      detailLoading: false,
    });

    renderBody();

    expect(screen.getByText("service tab")).toBeDefined();
  });

  it("shows Service rather than the loading state while detail loads", () => {
    useRouteEditorStore.setState({
      activeTab: "service",
      detail: null,
      detailLoading: true,
    });

    renderBody();

    expect(screen.getByText("service tab")).toBeDefined();
  });
});
