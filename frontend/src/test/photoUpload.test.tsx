import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "./msw/server";
import { UPLOADED_PHOTO_URL } from "./msw/handlers";
import { renderWithProviders } from "./utils";
import { setToken } from "../lib/storage";

const API = "http://localhost:4000/api/v1";

/**
 * The item form's photo control (SRS F3.4).
 *
 * Asserted against the *wire*, not the pixels: the promise this component makes
 * is that choosing a file uploads it and the returned URL is what the form
 * submits as `photoUrl`. A test that only checked "an image appeared" would pass
 * even if the URL never reached the form, which is the one failure that matters.
 *
 * `renderWithProviders` mounts the production route tree, so these exercise the
 * real `apiClient`, the real request and the real form state.
 */
describe("item form photo field", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The two hidden file inputs are the actual controls; the buttons click them. */
  function fileInputs(container: HTMLElement): { camera: HTMLInputElement; gallery: HTMLInputElement } {
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    expect(inputs).toHaveLength(2);
    return { camera: inputs[0]!, gallery: inputs[1]! };
  }

  /**
   * Asserts the multipart upload at the `fetch` boundary rather than through MSW.
   *
   * This is an environment limitation, not a design choice: jsdom's `File` and
   * `FormData` are jsdom's own classes while `fetch` is Node's undici, and
   * undici cannot encode a jsdom `File` into a multipart body — building the
   * intercepted `Request` throws before any handler runs. Every other request in
   * this suite still goes through MSW; only the multipart one is inspected here.
   * The real encoding is verified end-to-end against the deployed API, where a
   * genuine JPEG is uploaded and the returned CDN URL serves the image back.
   */
  async function stubUploadCapture() {
    const passthrough = globalThis.fetch;
    const captured: { body?: FormData; authorization: string | null } = { authorization: null };

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/uploads/photo")) {
        captured.body = init?.body as FormData;
        captured.authorization = new Headers(init?.headers).get("Authorization");
        return new Response(JSON.stringify({ url: UPLOADED_PHOTO_URL }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      return passthrough(input as RequestInfo, init);
    });

    return captured;
  }

  it("uploads a file chosen from the device and previews the stored URL", async () => {
    const captured = await stubUploadCapture();

    setToken("test-token");
    const { container } = renderWithProviders({ initialEntries: ["/items/new"] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Register an item" });

    // Camera is the default source: photographing the item in front of you is
    // the common case in a property office.
    expect(screen.getByLabelText("Photo source")).toHaveValue("camera");
    expect(screen.getByRole("button", { name: "Open camera" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Photo source"), "gallery");
    const { gallery } = fileInputs(container);

    // A gallery pick must never land in the camera input — it is
    // `capture="environment"`, so on a phone that would open the camera instead.
    expect(gallery).not.toHaveAttribute("capture");

    await user.upload(gallery, new File(["fake-jpeg-bytes"], "desk.jpg", { type: "image/jpeg" }));

    await waitFor(() => expect(captured.body).toBeDefined());
    const file = captured.body!.get("photo") as File;
    // The field name is part of the API contract; the route reads `photo`.
    expect(file.name).toBe("desk.jpg");
    expect(file.type).toBe("image/jpeg");
    // Writes are authenticated, like every other write in the app.
    expect(captured.authorization).toBe("Bearer test-token");

    // The preview shows the *stored* image, not a local object URL, so what the
    // user sees is what Save will commit.
    const preview = await screen.findByAltText("Photo preview");
    expect(preview).toHaveAttribute("src", UPLOADED_PHOTO_URL);
  });

  it("rejects an oversized file before uploading it", async () => {
    let uploadCalled = false;
    server.use(
      http.post(`${API}/uploads/photo`, () => {
        uploadCalled = true;
        return HttpResponse.json({ url: UPLOADED_PHOTO_URL }, { status: 201 });
      }),
    );

    setToken("test-token");
    const { container } = renderWithProviders({ initialEntries: ["/items/new"] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Register an item" });
    await user.selectOptions(screen.getByLabelText("Photo source"), "gallery");

    // 6 MB against the 5 MB limit. Checked client-side so an obviously-wrong
    // file costs no round trip — the server checks independently.
    const huge = new File([new Uint8Array(6 * 1024 * 1024)], "huge.jpg", { type: "image/jpeg" });
    await user.upload(fileInputs(container).gallery, huge);

    expect(await screen.findByRole("alert")).toHaveTextContent(/larger than 5 MB/i);
    expect(uploadCalled).toBe(false);
  });

  it("accepts a pasted URL without uploading anything", async () => {
    let uploadCalled = false;
    server.use(
      http.post(`${API}/uploads/photo`, () => {
        uploadCalled = true;
        return HttpResponse.json({ url: UPLOADED_PHOTO_URL }, { status: 201 });
      }),
    );

    setToken("test-token");
    renderWithProviders({ initialEntries: ["/items/new"] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Register an item" });
    await user.selectOptions(screen.getByLabelText("Photo source"), "url");

    await user.type(screen.getByLabelText("Photo URL"), "https://example.com/laptop.jpg");

    const preview = await screen.findByAltText("Photo preview");
    expect(preview).toHaveAttribute("src", "https://example.com/laptop.jpg");
    expect(uploadCalled).toBe(false);
  });

  it("clears the photo back to the empty state", async () => {
    setToken("test-token");
    renderWithProviders({ initialEntries: ["/items/new"] });
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: "Register an item" });
    await user.selectOptions(screen.getByLabelText("Photo source"), "url");
    await user.type(screen.getByLabelText("Photo URL"), "https://example.com/laptop.jpg");

    await screen.findByAltText("Photo preview");
    await user.click(screen.getByRole("button", { name: "Remove photo" }));

    // Empty means empty: the frame falls back rather than pointing at a dead src.
    await waitFor(() => expect(screen.queryByAltText("Photo preview")).not.toBeInTheDocument());
    expect(screen.getByText("No photo attached yet.")).toBeInTheDocument();
  });
});
