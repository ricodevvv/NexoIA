type Mail = { to: string; subject: string; title: string; body: string; action: { label: string; url: string } };

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(mail: Mail) {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:32px 16px;background:#f3f4f6;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0d1015">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #d9dce1">
    <tr><td style="padding:28px 32px 0;font-family:Georgia,serif;font-size:22px;font-weight:600">Nexo<span style="display:inline-block;width:7px;height:7px;margin-left:4px;background:#2451e6"></span></td></tr>
    <tr><td style="padding:24px 32px 8px;font-family:Georgia,serif;font-size:26px;line-height:1.2">${escape(mail.title)}</td></tr>
    <tr><td style="padding:0 32px 24px;font-size:15px;line-height:1.6;color:#4b5360">${escape(mail.body)}</td></tr>
    <tr><td style="padding:0 32px 28px"><a href="${escape(mail.action.url)}" style="display:inline-block;padding:12px 20px;background:#0d1015;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600">${escape(mail.action.label)}</a></td></tr>
    <tr><td style="padding:16px 32px 24px;border-top:1px solid #e9ebee;font-size:12px;color:#7a828e">Si no fuiste tú, ignora este correo. El enlace caduca pronto.</td></tr>
  </table>
</body>
</html>`;
}

/**
 * Manda un correo con Resend. Si no hay RESEND_API_KEY, imprime el enlace en
 * la consola para poder probar en local sin servicio de correo.
 */
export async function sendMail(mail: Mail) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[correo] ${mail.subject} → ${mail.to}\n          ${mail.action.url}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Nexo <onboarding@resend.dev>",
      to: mail.to,
      subject: mail.subject,
      html: render(mail),
      text: `${mail.title}\n\n${mail.body}\n\n${mail.action.label}: ${mail.action.url}`,
    }),
  });
  if (!res.ok) console.error(`[correo] Resend respondió ${res.status}: ${await res.text()}`);
}

export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY);
}
