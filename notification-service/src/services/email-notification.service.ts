import { Resend } from "resend";
import { config } from "../config.js";

export const notificationTypes = [
  "account",
  "application",
  "interview",
  "offer",
  "message",
  "system",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export interface EmailAction {
  label: string;
  url: string;
}

export interface EmailNotification {
  type: NotificationType;
  to: string;
  recipientName?: string;
  subject: string;
  message: string;
  action?: EmailAction;
}

const resend = new Resend(config.resendApiKey);

const categoryLabels: Record<NotificationType, string> = {
  account: "Account update",
  application: "Application update",
  interview: "Interview update",
  offer: "Offer update",
  message: "New message",
  system: "Internflare notification",
};

// Escape untrusted text before placing it in HTML; the text alternative stays readable.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

// Render a simple HTML email with a text alternative. The HTML is styled inline for maximum compatibility.
function renderEmail(notification: EmailNotification): {
  html: string;
  text: string;
} {
  const greeting = notification.recipientName
    ? `Hello ${notification.recipientName},`
    : "Hello,";
  const actionHtml = notification.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(notification.action.url)}" style="background:#6b4eff;border-radius:6px;color:#fff;display:inline-block;padding:12px 18px;text-decoration:none">${escapeHtml(notification.action.label)}</a></p>`
    : "";
  const actionText = notification.action
    ? `\n\n${notification.action.label}: ${notification.action.url}`
    : "";

  return {
    html: `<!doctype html><html><body style="background:#f7f7f8;color:#202124;font-family:Arial,sans-serif;margin:0;padding:24px"><main style="background:#fff;border:1px solid #e5e5e5;border-radius:10px;margin:0 auto;max-width:600px;padding:32px"><p style="color:#6b4eff;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">${categoryLabels[notification.type]}</p><h1 style="font-size:22px">${escapeHtml(notification.subject)}</h1><p>${escapeHtml(greeting)}</p><p style="line-height:1.6;white-space:pre-line">${escapeHtml(notification.message)}</p>${actionHtml}<hr style="border:0;border-top:1px solid #eee;margin:28px 0 16px"><p style="color:#777;font-size:12px">Internflare · Opportunities and career growth</p></main></body></html>`,
    text: `${categoryLabels[notification.type]}\n\n${notification.subject}\n\n${greeting}\n\n${notification.message}${actionText}\n\nInternflare`,
  };
}

// Sends one transactional notification and returns Resend's provider message ID.
async function sendEmailNotification(
  notification: EmailNotification,
): Promise<{ id: string }> {
  const content = renderEmail(notification);
  const { data, error } = await resend.emails.send({
    from: config.emailFrom,
    to: notification.to,
    subject: notification.subject,
    html: content.html,
    text: content.text,
  });

  if (error) {
    throw new Error(`Resend rejected the email: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("Resend did not return an email ID");
  }

  return { id: data.id };
}

export { sendEmailNotification };
