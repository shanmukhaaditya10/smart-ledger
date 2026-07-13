import nodemailer from "nodemailer";

/**
 * Email is a stretch feature and is GATED behind env vars — the app runs fine
 * without any SMTP config. When `SMTP_HOST` (or `SMTP_URL`) is absent we no-op
 * and report `sent:false` so callers can still drop the in-app notification.
 */

export type SendResult = { sent: boolean; reason?: string; messageId?: string };

function getTransport() {
  if (process.env.SMTP_URL) {
    return nodemailer.createTransport(process.env.SMTP_URL);
  }
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }
  return null;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL || process.env.SMTP_HOST);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SendResult> {
  const transport = getTransport();
  if (!transport) {
    return { sent: false, reason: "Email not configured (set SMTP_URL or SMTP_HOST)" };
  }
  const from = process.env.SMTP_FROM ?? "Smart Ledger <ledger@example.com>";
  const info = await transport.sendMail({ from, ...opts });
  return { sent: true, messageId: info.messageId };
}
