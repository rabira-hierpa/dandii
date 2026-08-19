/**
 * Minimal transactional email sender for the console invitation flow.
 *
 * No email SDK is a dependency of this project, so this speaks Resend's HTTP
 * API directly — one `fetch`, no new package — when `RESEND_API_KEY` is set.
 * Without it (the default in dev, and in any environment that hasn't
 * configured a provider yet) the message is logged instead of sent, and the
 * caller still gets the invite link back to show in the console so an admin
 * can share it by hand. Swap in a different provider here later without
 * touching call sites.
 */

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  sent: boolean;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Dandii <no-reply@dandii.et>";

  if (!apiKey) {
    // Dev/unconfigured fallback: no PII beyond the recipient, which the admin
    // who triggered the send already knows.
    console.log(
      `[email:unsent — no RESEND_API_KEY] to=${input.to} subject="${input.subject}"`,
    );
    return { sent: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      console.error(`[email] send failed: ${res.status}`);
      return { sent: false };
    }
    return { sent: true };
  } catch {
    console.error("[email] send threw");
    return { sent: false };
  }
}
