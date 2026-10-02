// Netlify Function: sends email via Brevo API. Provider swappable via EMAIL_PROVIDER.
// Env: BREVO_API_KEY, BREVO_SENDER_EMAIL, EMAIL_PROVIDER=brevo
export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const { to, subject, html, submissionId } = JSON.parse(event.body || "{}");
    if (!to || !subject || !html) return { statusCode: 400, body: "Missing to/subject/html" };
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
