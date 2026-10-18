import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import dns from "node:dns";
import dotenv from "dotenv";
import { prisma } from "../lib/prisma.js";

export type EmailDeliveryStatus = "QUEUED" | "SENT" | "DELIVERED" | "BOUNCED" | "FAILED";

export type EmailTemplateType = "verify" | "decision" | "invite" | "reset" | "reset-completed" | "notification";

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
  template?: EmailTemplateType;
}

export interface EmailDeliveryResult {
  outboxId?: string;
  status: EmailDeliveryStatus;
  providerId?: string;
  error?: string;
}

/**
 * Fast DNS resolver using Google/Cloudflare public DNS.
 * This prevents ConnectTimeoutError caused by local router/hotspot DNS gateways (e.g. 172.20.10.1)
 * that hang or drop CNAME queries for external APIs like api.resend.com.
 */
const fastDnsResolver = new dns.promises.Resolver();
try {
  fastDnsResolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {
  // Ignore if unable to set custom DNS servers in environment
}

function fastLookup(hostname: string, opts: any, cb: (err: Error | null, address?: any, family?: number) => void) {
  if (typeof opts === "function") {
    cb = opts;
    opts = {};
  }
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("DNS timeout")), 2000),
  );

  Promise.race([fastDnsResolver.resolve4(hostname), timeoutPromise])
    .then((addrs) => {
      if (addrs && addrs.length > 0) {
        if (opts && opts.all) {
          cb(null, addrs.map((a) => ({ address: a, family: 4 })));
        } else {
          cb(null, addrs[0], 4);
        }
      } else {
        dns.lookup(hostname, opts, cb);
      }
    })
    .catch(() => {
      dns.lookup(hostname, opts, cb);
    });
}

/**
 * Sends an HTTPS POST request to api.resend.com with fast DNS resolution and 8s timeout.
 */
function postToResend(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: { id?: string; message?: string; name?: string; statusCode?: number } }> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload);
    const req = https.request(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
        lookup: fastLookup,
        timeout: 8000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            resolve({
              ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
              status: res.statusCode ?? 500,
              data: parsed,
            });
          } catch {
            resolve({
              ok: false,
              status: res.statusCode ?? 500,
              data: { message: raw || "Invalid JSON from Resend" },
            });
          }
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("Resend request timed out after 8000ms"));
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(bodyStr);
    req.end();
  });
}

/**
 * Synchronizes process.env with the root .env file on disk.
 * This guarantees that commenting or uncommenting RESEND_API_KEY takes effect
 * immediately without requiring a full server restart.
 */
export function syncEnvFromDisk(): void {
  if (process.env.NODE_ENV === "test") return;
  try {
    const candidates = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "../.env"),
      path.resolve(import.meta.dirname, "../../../.env"),
    ];
    for (const envPath of candidates) {
      if (fs.existsSync(envPath)) {
        const parsed = dotenv.parse(fs.readFileSync(envPath));
        if (parsed.RESEND_API_KEY) {
          process.env.RESEND_API_KEY = parsed.RESEND_API_KEY;
        } else {
          delete process.env.RESEND_API_KEY;
        }
        if (parsed.RESEND_FROM) {
          process.env.RESEND_FROM = parsed.RESEND_FROM;
        } else {
          delete process.env.RESEND_FROM;
        }
        if (parsed.PUBLIC_BASE_URL) {
          process.env.PUBLIC_BASE_URL = parsed.PUBLIC_BASE_URL;
        }
        break;
      }
    }
  } catch {
    // non-fatal
  }
}

export function getResendApiKey(): string | undefined {
  syncEnvFromDisk();
  return process.env.RESEND_API_KEY?.trim();
}

export function getResendFrom(): string {
  syncEnvFromDisk();
  return process.env.RESEND_FROM?.trim() || "CNCS Property Office <onboarding@resend.dev>";
}

export function getSiteOrigin(): string {
  syncEnvFromDisk();
  return process.env.PUBLIC_BASE_URL?.trim() || process.env.SITE_ORIGIN?.trim() || "http://localhost:5173";
}

export function getDailyBudget(): number {
  return parseInt(process.env.RESEND_DAILY_BUDGET || "100", 10);
}

/**
 * Returns true if real Resend email sending should be attempted.
 * Under test or local dev without RESEND_API_KEY, fallback stub is used.
 */
export function isResendLive(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  const key = getResendApiKey();
  return Boolean(key && key.startsWith("re_"));
}

const TRUTHY = new Set(["true", "1", "yes", "on"]);

export function isEmailNotifyEnabled(): boolean {
  const raw = process.env.NOTIFY_EMAIL;
  if (typeof raw !== "string") return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * Checks how many emails have been sent today to guard Resend's free tier (100/day).
 */
export async function getTodaySentCount(): Promise<number> {
  if (process.env.NODE_ENV === "test") return 0;
  if (!prisma.emailOutbox?.count) return 0;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return await prisma.emailOutbox.count({
    where: {
      status: { in: ["SENT", "DELIVERED"] },
      createdAt: { gte: startOfDay },
    },
  });
}

/**
 * Generates formatted text & HTML for system email templates.
 */
export function renderEmailTemplate(
  template: EmailTemplateType,
  vars: Record<string, string>,
): { subject: string; body: string; html: string } {
  const origin = getSiteOrigin();
  switch (template) {
    case "verify": {
      const verifyUrl = `${origin}/verify-email?token=${vars.token}`;
      const subject = "Verify your AAU email — CNCS Property Management System";
      const body = `Hello ${vars.name || "Colleague"},\n\nPlease verify your email address to complete your registration for the CNCS Property Management System:\n\n${verifyUrl}\n\nThis verification link expires in 24 hours. After verification, your department head will review your account.\n\nIf you did not request this account, please ignore this email.`;
      const html = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">CNCS Property Management System</h2>
          <p>Hello <strong>${vars.name || "Colleague"}</strong>,</p>
          <p>Please verify your university email address to complete your account registration:</p>
          <p style="margin: 28px 0;">
            <a href="${verifyUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email Address</a>
          </p>
          <p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser:<br/><a href="${verifyUrl}" style="color: #2563eb;">${verifyUrl}</a></p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #94a3b8;">This link expires in 24 hours. Once verified, your department head will review your request.</p>
        </div>
      `;
      return { subject, body, html };
    }

    case "decision": {
      const isApproved = vars.status === "ACTIVE";
      const subject = isApproved
        ? "Your CNCS PMS Account has been approved"
        : "Update on your CNCS PMS Account request";
      const loginUrl = `${origin}/login`;
      const body = isApproved
        ? `Hello ${vars.name},\n\nYour account request for the CNCS Property Management System has been approved.\nDepartment: ${vars.department || "CNCS"}\nRole: ${vars.role || "STAFF"}\n\nYou may now sign in at:\n${loginUrl}\n\nWelcome to the system!`
        : `Hello ${vars.name},\n\nYour account request for the CNCS Property Management System was not approved.\nReason: ${vars.reason || "Not specified"}\n\nIf you believe this was in error, please contact your department office or Property Administration.`;
      const html = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">CNCS Property Management System</h2>
          <p>Hello <strong>${vars.name}</strong>,</p>
          ${
            isApproved
              ? `<div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0; border-radius: 4px;">
                   <p style="margin: 0; color: #166534; font-weight: 600;">Your account request has been approved.</p>
                   <p style="margin: 8px 0 0 0; color: #15803d; font-size: 14px;">Role: <strong>${vars.role || "STAFF"}</strong></p>
                 </div>
                 <p style="margin: 28px 0;">
                   <a href="${loginUrl}" style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Sign In to Your Account</a>
                 </p>`
              : `<div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 4px;">
                   <p style="margin: 0; color: #991b1b; font-weight: 600;">Your account request was declined.</p>
                   <p style="margin: 8px 0 0 0; color: #b91c1c; font-size: 14px;">Reason: ${vars.reason || "Not specified"}</p>
                 </div>
                 <p style="font-size: 13px; color: #64748b;">If you believe this is in error, please contact your department office.</p>`
          }
        </div>
      `;
      return { subject, body, html };
    }

    case "invite": {
      const inviteUrl = `${origin}/accept-invite?token=${vars.token}`;
      const subject = "You have been invited to CNCS Property Management System";
      const body = `Hello,\n\nYou have been invited to join the CNCS Property Management System as ${vars.role}.\nAuthorized by: ${vars.authorizedBy}\nReference: ${vars.authorizationRef}\n\nPlease click the link below to set your password and activate your account:\n\n${inviteUrl}\n\nThis invitation link expires in 72 hours.`;
      const html = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">CNCS Property Management System</h2>
          <p>Hello,</p>
          <p>You have been officially invited to join as <strong>${vars.role}</strong>.</p>
          <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #475569; margin: 16px 0;">
            <p style="margin: 0 0 4px 0;"><strong>Authorized By:</strong> ${vars.authorizedBy}</p>
            <p style="margin: 0;"><strong>Reference:</strong> ${vars.authorizationRef}</p>
          </div>
          <p style="margin: 28px 0;">
            <a href="${inviteUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Set Password & Accept Invitation</a>
          </p>
          <p style="font-size: 12px; color: #94a3b8;">This invite link expires in 72 hours.</p>
        </div>
      `;
      return { subject, body, html };
    }

    case "reset": {
      const resetUrl = `${origin}/reset-password?token=${vars.token}`;
      const subject = "Password Reset Request — CNCS Property Management System";
      const body = `Hello ${vars.name || "Colleague"},\n\nA password reset was requested for your account. Click the link below to choose a new password:\n\n${resetUrl}\n\nThis link is valid for 30 minutes. If you did not request this reset, your account is secure and you can ignore this email.`;
      const html = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">CNCS Property Management System</h2>
          <p>Hello <strong>${vars.name || "Colleague"}</strong>,</p>
          <p>A password reset was requested for your account:</p>
          <p style="margin: 28px 0;">
            <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
          </p>
          <p style="font-size: 12px; color: #64748b;">This link will expire in 30 minutes. If you did not request this, no action is needed.</p>
        </div>
      `;
      return { subject, body, html };
    }

    case "reset-completed": {
      const subject = "Your password has been reset — CNCS Property Management System";
      const body = `Hello ${vars.name || "Colleague"},\n\nYour password for the CNCS Property Management System was successfully changed. All previous active sessions have been terminated.\n\nIf you did not perform this change, please contact the Property Administration immediately.`;
      const html = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">CNCS Property Management System</h2>
          <p>Hello <strong>${vars.name || "Colleague"}</strong>,</p>
          <p>Your password was successfully updated. All previous active sessions have been terminated for security.</p>
          <p style="font-size: 13px; color: #ef4444; font-weight: 600;">If you did not make this change, please report it to the Account Admin immediately.</p>
        </div>
      `;
      return { subject, body, html };
    }

    default: {
      return {
        subject: vars.subject || "Notification — CNCS Property Management System",
        body: vars.body || "",
        html: `<p>${(vars.body || "").replace(/\n/g, "<br/>")}</p>`,
      };
    }
  }
}

/**
 * Main email dispatcher.
 * Logs to EmailOutbox, checks 100/day daily budget, and either dispatches via Resend or queues/stubs.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailDeliveryResult> {
  const { to, subject, body, html } = options;
  if (!to || !to.trim()) {
    return { status: "FAILED", error: "Missing recipient address" };
  }

  // 1. Create outbox record (guarded for mocked test environments)
  let outbox: any = null;
  if (process.env.NODE_ENV !== "test" && prisma.emailOutbox?.create) {
    try {
      outbox = await prisma.emailOutbox.create({
        data: {
          to: to.trim().toLowerCase(),
          subject,
          body,
          status: "QUEUED",
          attempts: 0,
        },
      });
    } catch {
      // Outbox write optional in stub/test environments
    }
  }

  // 2. Check daily budget
  const dailyBudget = getDailyBudget();
  const sentToday = await getTodaySentCount();
  if (sentToday >= dailyBudget) {
    console.warn(`[email] Daily email limit reached (${sentToday}/${dailyBudget}). Outbox ID ${outbox?.id} left QUEUED.`);
    if (outbox?.id && prisma.emailOutbox?.update) {
      await prisma.emailOutbox.update({
        where: { id: outbox.id },
        data: { error: `Daily quota exceeded (${sentToday}/${dailyBudget}). Queued.` },
      });
    }
    return { outboxId: outbox?.id, status: "QUEUED", error: "Daily limit reached" };
  }

  // 3. Dispatch via Resend or Dev Fallback
  if (isResendLive()) {
    const apiKey = getResendApiKey()!;
    const fromAddress = getResendFrom();

    try {
      const res = await postToResend(apiKey, {
        from: fromAddress,
        to: [to.trim().toLowerCase()],
        subject,
        text: body,
        html: html || `<p>${body.replace(/\n/g, "<br/>")}</p>`,
      });

      if (!res.ok) {
        const errorMsg = res.data.message || `Resend error (${res.status})`;
        console.error(`[email] Resend delivery rejected for ${to}:`, errorMsg);
        if (outbox?.id && prisma.emailOutbox?.update) {
          await prisma.emailOutbox.update({
            where: { id: outbox.id },
            data: {
              attempts: { increment: 1 },
              error: errorMsg,
              status: "FAILED",
            },
          });
        }

        // PROVIDER ERROR FALLBACK: Always log fallback link to console so verification is never blocked
        console.warn(`[email:resend-fallback] Resend rejected delivery (${errorMsg}). Verification link logged for development:`);
        console.info(`[email:dev-fallback] To: ${to} | Subject: ${subject}\n\n${body}\n`);

        return { outboxId: outbox?.id, status: "FAILED", error: errorMsg };
      }

      if (outbox?.id && prisma.emailOutbox?.update) {
        await prisma.emailOutbox.update({
          where: { id: outbox.id },
          data: {
            attempts: { increment: 1 },
            ...(res.data.id ? { providerId: res.data.id } : {}),
            status: "SENT",
            sentAt: new Date(),
          },
        });
      }

      console.info(`[email:sent] Delivered via Resend to ${to} (provider ID: ${res.data.id})`);
      return {
        ...(outbox?.id ? { outboxId: outbox.id } : {}),
        status: "SENT",
        ...(res.data.id ? { providerId: res.data.id } : {}),
      };
    } catch (err: any) {
      console.error(`[email] Network exception sending to ${to}:`, err);
      if (outbox?.id && prisma.emailOutbox?.update) {
        await prisma.emailOutbox.update({
          where: { id: outbox.id },
          data: {
            attempts: { increment: 1 },
            error: err.message || "Network exception",
            status: "FAILED",
          },
        });
      }

      // NETWORK ERROR FALLBACK: Always log fallback link so user is never stranded
      console.warn(`[email:network-fallback] Network error connecting to Resend: ${err.message}. Verification link logged for development:`);
      console.info(`[email:dev-fallback] To: ${to} | Subject: ${subject}\n\n${body}\n`);

      return { outboxId: outbox?.id, status: "FAILED", error: err.message };
    }
  } else {
    // Development / Test fallback
    const stubId = `dev-stub-${crypto.randomUUID()}`;
    console.info(`[email:dev-fallback] To: ${to} | Subject: ${subject}\n\n${body}\n`);
    if (outbox?.id && prisma.emailOutbox?.update) {
      await prisma.emailOutbox.update({
        where: { id: outbox.id },
        data: {
          attempts: 1,
          providerId: stubId,
          status: "SENT",
          sentAt: new Date(),
        },
      });
    }

    return { outboxId: outbox?.id, status: "SENT", providerId: stubId };
  }
}

/** Legacy wrapper so existing call sites throughout the app continue to function seamlessly */
export async function sendNotificationEmail(email: { to: string; subject: string; body: string }): Promise<string> {
  if (!isEmailNotifyEnabled()) return "skipped";
  if (!email.to || !email.to.trim()) return "skipped";

  try {
    const res = await sendEmail(email);
    return res.status === "FAILED" ? "failed" : "sent";
  } catch {
    return "failed";
  }
}

/**
 * Handle Resend webhook events (delivery, bounce, complaint).
 */
export async function handleResendWebhook(event: {
  type: string;
  data: { email_id?: string; to?: string[]; recipient?: string };
}): Promise<void> {
  const providerId = event.data.email_id;
  if (!providerId) return;

  const outbox = await prisma.emailOutbox.findFirst({
    where: { providerId },
  });
  if (!outbox) return;

  if (event.type === "email.delivered") {
    await prisma.emailOutbox.update({
      where: { id: outbox.id },
      data: { status: "DELIVERED" },
    });
  } else if (event.type === "email.bounced" || event.type === "email.complained") {
    await prisma.emailOutbox.update({
      where: { id: outbox.id },
      data: {
        status: "BOUNCED",
        error: `Provider event: ${event.type}`,
      },
    });

    // If the bounced email belongs to an account in PENDING_EMAIL_VERIFICATION, record it
    await prisma.user.updateMany({
      where: {
        email: outbox.to,
        accountStatus: "PENDING_EMAIL_VERIFICATION",
      },
      data: {
        reviewNote: "[BOUNCED] Verification email bounced. Please check email address.",
      },
    });
  }
}
