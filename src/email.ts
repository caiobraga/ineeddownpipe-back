export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "noreply@ineeddownpipe.com";

  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping email to ${params.to}: ${params.subject}`
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}

export function verificationEmailHtml(link: string): string {
  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111827">
      <h1 style="font-size:22px;margin:0 0 12px">Verify your email</h1>
      <p style="line-height:1.6;color:#4b5563">Thanks for joining iNeedDownpipe. Confirm your email to manage used listings.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Verify email</a>
      </p>
      <p style="font-size:13px;color:#6b7280">Or copy this link: ${link}</p>
    </div>
  `.trim();
}

export function passwordResetEmailHtml(link: string): string {
  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111827">
      <h1 style="font-size:22px;margin:0 0 12px">Reset your password</h1>
      <p style="line-height:1.6;color:#4b5563">We received a request to reset your iNeedDownpipe password.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Reset password</a>
      </p>
      <p style="font-size:13px;color:#6b7280">If you didn't request this, you can ignore this email.</p>
    </div>
  `.trim();
}
