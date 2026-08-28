// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MapEmptyNotice } from "./map-empty-notice";

/**
 * The distinction this draws is the whole point: "you cannot see these routes"
 * and "these routes have no geometry" send the operator to different people.
 * On dev.dandii.app the console map was blank for every role, including
 * super-admin, and nothing on screen said which of the two it was.
 */

afterEach(cleanup);

describe("MapEmptyNotice", () => {
  it("says nothing while the geometry is still loading", () => {
    const { container } = render(
      <MapEmptyNotice routeCount={122} featureCount={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("says nothing when the map has features to draw", () => {
    const { container } = render(
      <MapEmptyNotice routeCount={122} featureCount={243} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("names missing geometry when routes exist but none is drawable", () => {
    render(<MapEmptyNotice routeCount={122} featureCount={0} />);

    expect(screen.getByText(/No route geometry to draw/)).toBeTruthy();
    expect(screen.getByText(/122 routes visible/)).toBeTruthy();
    // The actionable half: this is a data problem, not a permission one.
    expect(screen.getByText(/needs reseeding/)).toBeTruthy();
  });

  it("names missing access when no routes are visible at all", () => {
    render(<MapEmptyNotice routeCount={0} featureCount={0} />);

    expect(screen.getByText(/No routes to show/)).toBeTruthy();
    expect(screen.getByText(/Route Assignment/)).toBeTruthy();
    expect(screen.queryByText(/reseeding/)).toBeNull();
  });

  it("reads correctly for a single route", () => {
    render(<MapEmptyNotice routeCount={1} featureCount={0} />);
    expect(screen.getByText(/1 route visible/)).toBeTruthy();
  });

  it("is announced to screen readers rather than only drawn", () => {
    render(<MapEmptyNotice routeCount={5} featureCount={0} />);
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
