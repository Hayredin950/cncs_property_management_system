/**
 * Email side-channel for notifications (SRS F8.3).
 *
 * Deliberately dependency-free. F8.3 is the lowest-priority notification
 * requirement, real SMTP would mean a new dependency, a regenerated lockfile
 * and credentials nobody on the team has — so the transport is a stub and the
 * feature sits behind NOTIFY_EMAIL. In-app notifications (F8.1/F8.2) are the
 * real delivery mechanism and do not depend on this file.
 *
 * Swapping in a real transport later means changing `deliver()` only.
 */

export type EmailDeliveryResult = "sent" | "skipped" | "failed";

export interface NotificationEmail {
  to: string;
  subject: string;
  body: string;
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/**
 * Read inside the function, never at module load. Reading env at import time is
 * what forced the dynamic-import gymnastics in qrGenerator.test.ts: the value
 * gets frozen before a test can set it, so every test needs its own module
 * registry. As a function call it is just `process.env.NOTIFY_EMAIL = "true"`.
 */
export function isEmailNotifyEnabled(): boolean {
  const raw = process.env.NOTIFY_EMAIL;
  if (typeof raw !== "string") return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}

/** The stub transport. Replace this body to go live; nothing else changes. */
function deliver(email: NotificationEmail): void {
  console.info(
    `[email] NOTIFY_EMAIL is on but no SMTP transport is configured — would send to ${email.to}: ${email.subject}`,
  );
}

/**
 * Never throws. Email is a best-effort side-channel: an approval that already
 * committed must not report failure because a mail server was unreachable, so
 * callers log the result and carry on.
 *
 * Must be called AFTER the transaction commits — network I/O inside
 * `prisma.$transaction` holds a pooled Neon connection open for its duration.
 */
export async function sendNotificationEmail(
  email: NotificationEmail,
): Promise<EmailDeliveryResult> {
  if (!isEmailNotifyEnabled()) return "skipped";
  if (!email.to.trim()) return "skipped";

  try {
    await Promise.resolve(deliver(email));
    return "sent";
  } catch (err) {
    console.error("sendNotificationEmail failed:", err);
    return "failed";
  }
}
