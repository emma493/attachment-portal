// Netlify Function: sends email via Brevo (prod) or Gmail SMTP (test-only).
// Env:
//   EMAIL_PROVIDER=brevo | gmail
//   BREVO_API_KEY, BREVO_SENDER_EMAIL (prod)
//   GMAIL_USER, GMAIL_APP_PASSWORD (test-only, App Password, never commit)
export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const { to, subject, html, submissionId } = JSON.parse(event.body || "{}");
    if (!to || !subject || !html) return { statusCode: 400, body: "Missing to/subject/html" };

    const provider = (process.env.EMAIL_PROVIDER || "brevo").toLowerCase();

    if (provider === "gmail") {
      // TEST-ONLY: Gmail SMTP, 500/day, spam-prone. Use App Password, not login password.
      const user = process.env.GMAIL_USER;
      const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
      if (!user || !pass) return { statusCode: 500, body: "Missing GMAIL_USER / GMAIL_APP_PASSWORD" };
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user, pass },
      });
      const info = await transporter.sendMail({
        from: user,
        to,
        subject,
        html,
        headers: submissionId ? { "X-Submission-Id": submissionId } : undefined,
      });
      return { statusCode: 200, body: JSON.stringify({ provider: "gmail", messageId: info.messageId }) };
    }

    // PROD: Brevo API
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        tags: submissionId ? [submissionId] : undefined,
      }),
    });
    const body = await res.text();
    return { statusCode: res.ok ? 200 : 502, body };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
}
