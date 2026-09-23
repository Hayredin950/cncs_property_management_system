import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { createToken } from "../test-utils/index.js";

process.env.JWT_SECRET = "test_jwt_secret";

/**
 * The Cloudinary call is mocked, not the route's own logic.
 *
 * This suite is about the *contract* of `POST /uploads/photo` — who may call it,
 * which files it accepts, and what it answers when the storage is unavailable.
 * Reaching the network would test Cloudinary's uptime, and stubbing the whole
 * route would test nothing at all, so only the two functions that touch the
 * outside world are replaced.
 */
vi.mock("../services/photoStorage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/photoStorage.js")>();
  return {
    ...actual,
    readPhotoUploadConfig: vi.fn(),
    uploadPendingPhoto: vi.fn(),
  };
});

const { PhotoUploadError, readPhotoUploadConfig, uploadPendingPhoto } = await import(
  "../services/photoStorage.js"
);
const readConfigMock = vi.mocked(readPhotoUploadConfig);
const uploadMock = vi.mocked(uploadPendingPhoto);

const staffToken = createToken({ id: "staff-1", role: "STAFF" });

/** A 1x1 PNG — small enough to keep the suite fast, real enough for multer. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const CONFIGURED = { cloudName: "demo", apiKey: "key", apiSecret: "secret" };

function postPhoto(token?: string) {
  const req = request(app).post("/api/v1/uploads/photo");
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
}

beforeEach(() => {
  vi.clearAllMocks();
  readConfigMock.mockReturnValue(CONFIGURED);
  uploadMock.mockResolvedValue("https://res.cloudinary.com/demo/image/upload/pending-1.png");
});

describe("POST /uploads/photo", () => {
  it("rejects an anonymous caller before reading the body", async () => {
    const res = await postPhoto().attach("photo", PNG_BYTES, {
      filename: "desk.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(401);
    // The upload was never attempted — the point of authenticating first.
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("answers 503 when the deployment has no Cloudinary credentials", async () => {
    readConfigMock.mockReturnValue(null);

    const res = await postPhoto(staffToken).attach("photo", PNG_BYTES, {
      filename: "desk.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it("answers 400 when no image is attached", async () => {
    const res = await postPhoto(staffToken);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("photo");
  });

  it("answers 400 when the image arrives under the wrong field name", async () => {
    // The field name is part of the contract, so a mismatch has to be loud
    // rather than silently uploading nothing.
    const res = await postPhoto(staffToken).attach("image", PNG_BYTES, {
      filename: "desk.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("answers 415 for a file that is not an accepted image type", async () => {
    const res = await postPhoto(staffToken).attach("photo", Buffer.from("not an image"), {
      filename: "notes.txt",
      contentType: "text/plain",
    });

    expect(res.status).toBe(415);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("answers 413, not 500, when the file is over the size limit", async () => {
    // 6 MB against the 5 MB limit. Without the multer translation in
    // `middleware/photoUpload` this reaches the error handler as a bare
    // MulterError and comes back as "the server is broken".
    const oversized = Buffer.alloc(6 * 1024 * 1024);
    const res = await postPhoto(staffToken).attach("photo", oversized, {
      filename: "huge.jpg",
      contentType: "image/jpeg",
    });

    expect(res.status).toBe(413);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("stores the image and returns its URL", async () => {
    const res = await postPhoto(staffToken).attach("photo", PNG_BYTES, {
      filename: "desk.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ url: "https://res.cloudinary.com/demo/image/upload/pending-1.png" });
    // The route hands over the raw bytes; nothing here re-encodes them.
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0]?.[0]).toEqual(PNG_BYTES);
  });

  it("answers 502, not 500, when Cloudinary rejects the upload", async () => {
    uploadMock.mockRejectedValue(new PhotoUploadError("Cloudinary rejected the upload"));

    const res = await postPhoto(staffToken).attach("photo", PNG_BYTES, {
      filename: "desk.png",
      contentType: "image/png",
    });

    // 502 says "the thing we depend on did not answer" — an operator checks the
    // Cloudinary account, not the request.
    expect(res.status).toBe(502);
  });
});
