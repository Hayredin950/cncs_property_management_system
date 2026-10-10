import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "../app/AppErrorBoundary";

/**
 * Without a boundary, React Router swaps the *entire* app for its own
 * "Unexpected Application Error!" screen — the visitor loses the header, the
 * nav, and any way out. These tests pin the two behaviours that matter: the
 * failure is contained to the screen that broke, and "Try again" recovers
 * without a reload.
 */
let shouldThrow = true;

function Boom() {
  if (shouldThrow) throw new Error("scanner exploded");
  return <p>Recovered</p>;
}

beforeEach(() => {
  shouldThrow = true;
  // React logs the caught error (and its component stack) to the console; the
  // boundary is doing its job, so the noise is expected.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppErrorBoundary", () => {
  it("contains the failure and offers a way out instead of blanking the app", () => {
    render(
      <MemoryRouter>
        <AppErrorBoundary heading="Something went wrong on this screen">
          <Boom />
        </AppErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Something went wrong on this screen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });

  it("recovers in place once the underlying error is gone", () => {
    render(
      <MemoryRouter>
        <AppErrorBoundary>
          <Boom />
        </AppErrorBoundary>
      </MemoryRouter>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
