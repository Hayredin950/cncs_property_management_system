import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailNotifyEnabled, sendNotificationEmail } from "./email.js";

/**
 * SRS F8.3 behind a flag. The transport is a stub — see the header of email.ts for
 * why shipping real SMTP was the wrong trade in Phase 2 — so what is worth testing
 * is the switch and the promise never rejecting.
 *
 * `NOTIFY_EMAIL` is read inside the function rather than at module load, which is
 * what lets these tests just assign to process.env instead of resetting the module
 * registry the way qrGenerator.test.ts has to.
 */

const original = process.env.NOTIFY_EMAIL;

afterEach(() => {
  if (original === undefined) {
    delete process.env.NOTIFY_EMAIL;
  } else {
    process.env.NOTIFY_EMAIL = original;
  }
  vi.restoreAllMocks();
});

describe("isEmailNotifyEnabled", () => {
  it("is off unless the flag is explicitly truthy", () => {
    delete process.env.NOTIFY_EMAIL;
    expect(isEmailNotifyEnabled()).toBe(false);

    for (const value of ["false", "0", "no", "off", "", "  ", "maybe"]) {
      process.env.NOTIFY_EMAIL = value;
      expect(isEmailNotifyEnabled()).toBe(false);
    }
  });

  it("accepts the usual spellings of yes", () => {
    for (const value of ["true", "TRUE", " True ", "1", "yes", "on"]) {
      process.env.NOTIFY_EMAIL = value;
      expect(isEmailNotifyEnabled()).toBe(true);
    }
  });
});

describe("sendNotificationEmail", () => {
  const email = {
    to: "admin@cncs.aau.edu.et",
    subject: "CNCS Property: a request needs your review",
    body: "Demo Staff requested a TRANSFER for item CNCS-DEMO-0001.",
  };

  it("skips without touching the transport when the flag is off", async () => {
    process.env.NOTIFY_EMAIL = "false";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(sendNotificationEmail(email)).resolves.toBe("skipped");
    expect(info).not.toHaveBeenCalled();
  });

  it("reports what it would have sent when the flag is on", async () => {
    process.env.NOTIFY_EMAIL = "true";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(sendNotificationEmail(email)).resolves.toBe("sent");
    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]?.[0]).toContain("admin@cncs.aau.edu.et");
  });

  it("skips a recipient with no address instead of failing the caller", async () => {
    process.env.NOTIFY_EMAIL = "true";
    await expect(sendNotificationEmail({ ...email, to: "   " })).resolves.toBe("skipped");
  });
});
