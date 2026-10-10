import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";
import { saveWalkthrough } from "../lib/auditWalkthrough";
import { AUDIT_READBACK, AUDIT_SESSION, AUDIT_STORED_ROWS } from "./fixtures";

const API = "http://localhost:4000/api/v1";

/** Every toast currently on screen, by sonner's own marker attribute. */
function renderedToasts(): number {
  return document.querySelectorAll("[data-sonner-toast]").length;
}

/** What the toast region is saying — the user-visible answer to "did that work?". */
function toastText(): string {
  return document.querySelector('[aria-label^="Notifications"]')?.textContent ?? "";
}

/**
 * One event, one toast.
 *
 * The walkthrough is the only screen where feedback arrives several times a
 * second: the camera decodes at 10 fps and a sticker sits in frame for seconds, so
 * a scan used to produce a stream of near-identical toasts — first "Scanned …",
 * then "already scanned in this session" over and over — which is noise a novice
 * has to read past to work out whether the scan even landed.
 *
 * The fix is a per-session toast slot: every scan outcome is raised into the same
 * `id`, so a newer message replaces the older one instead of stacking under it.
 * That is what these assertions are: not "no toast", but never more than one.
 */
describe("audit scan feedback", () => {
  it("replaces the previous scan message instead of stacking a new one", async () => {
    server.use(
      http.get(`${API}/audits/:id`, () =>
        HttpResponse.json(AUDIT_READBACK(AUDIT_SESSION.id, { rows: AUDIT_STORED_ROWS })),
      ),
    );

    // Both stored tags are already counted, so each is a duplicate — two distinct
    // events, each of which used to leave its own toast behind.
    saveWalkthrough(AUDIT_SESSION.id, { scopeValue: "Computer Science", scanned: [] });
    setToken("test-token");
    renderWithProviders({ initialEntries: [`/audit/${AUDIT_SESSION.id}/scan`] });
    const user = userEvent.setup();

    const tagInput = await screen.findByLabelText("Tag ID");
    await user.type(tagInput, "CNCS-AB12CD34");
    await user.click(screen.getByRole("button", { name: "Scan" }));
    await waitFor(() => expect(toastText()).toContain("CNCS-AB12CD34"));

    await user.type(screen.getByLabelText("Tag ID"), "CNCS-ELSE0000");
    await user.click(screen.getByRole("button", { name: "Scan" }));

    // The second message is the one on screen; the first was replaced, not joined.
    await waitFor(() => expect(toastText()).toContain("CNCS-ELSE0000"));
    expect(renderedToasts()).toBe(1);
  });

  it("ignores the same tag decoded again within the cooldown", async () => {
    let scanCalls = 0;
    server.use(
      http.post(`${API}/audits/:id/scan`, () => {
        scanCalls += 1;
        return HttpResponse.json({ error: "no item matches this tag" }, { status: 404 });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: [`/audit/${AUDIT_SESSION.id}/scan`] });
    const user = userEvent.setup();

    const tagInput = await screen.findByLabelText("Tag ID");
    await user.type(tagInput, "CNCS-NOPE0000");
    await user.click(screen.getByRole("button", { name: "Scan" }));
    await screen.findByText(/no item matches tag CNCS-NOPE0000/i);

    // A camera pointed at one sticker reports it continuously, and a tag that
    // matches nothing is exactly when a retry storm hurts: the client must not turn
    // one physical scan into a request per frame.
    await user.type(screen.getByLabelText("Tag ID"), "CNCS-NOPE0000");
    await user.click(screen.getByRole("button", { name: "Scan" }));

    // Long enough for a second attempt to land if the guard were missing.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(scanCalls).toBe(0);
    // And the failure is still stated exactly once, not once per decode.
    expect(screen.getAllByText(/no item matches tag CNCS-NOPE0000/i)).toHaveLength(1);
  });
});
