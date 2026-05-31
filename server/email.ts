import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = "RobotPay <noreply@westpay.cfd>";

export async function sendMerchantOtpEmail(to: string, otp: string, merchantName?: string): Promise<boolean> {
  if (!resend) {
    console.log(`[EMAIL OTP] RESEND_API_KEY non configuré — OTP pour ${to}: ${otp}`);
    return true;
  }

  const name = merchantName || "Marchand";

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code de vérification WestPay</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#00b050 0%,#005c2e 100%);padding:36px 40px 32px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:10px;display:inline-block;vertical-align:middle;line-height:40px;text-align:center;font-size:22px;">💳</div>
                <span style="font-size:26px;font-weight:800;color:#ffffff;vertical-align:middle;letter-spacing:-0.5px;">WestPay</span>
              </div>
              <p style="margin:12px 0 0;color:rgba(255,255,255,0.85);font-size:14px;letter-spacing:0.3px;">Plateforme de paiement Mobile Money</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 20px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a1628;letter-spacing:-0.3px;">Code de vérification</h1>
              <p style="margin:0 0 28px;color:#64748b;font-size:15px;line-height:1.6;">Bonjour <strong style="color:#0a1628;">${name}</strong>, utilisez le code ci-dessous pour finaliser votre connexion à votre espace marchand.</p>

              <!-- OTP Box -->
              <div style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:12px;padding:28px;text-align:center;margin:0 0 28px;">
                <p style="margin:0 0 8px;color:#16a34a;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Votre code</p>
                <div style="font-size:42px;font-weight:800;color:#00b050;letter-spacing:10px;font-family:'Courier New',monospace;">${otp}</div>
                <p style="margin:10px 0 0;color:#64748b;font-size:13px;">Valable <strong>5 minutes</strong> · Usage unique</p>
              </div>

              <!-- Security notice -->
              <div style="background:#fefce8;border-left:4px solid #fbbf24;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 24px;">
                <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">
                  <strong>🔒 Sécurité :</strong> Ne communiquez jamais ce code à personne. WestPay ne vous demandera jamais votre code par téléphone ou email.
                </p>
              </div>

              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">Si vous n'êtes pas à l'origine de cette tentative de connexion, ignorez cet email. Votre compte reste sécurisé.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 36px;border-top:1px solid #f1f5f9;">
              <p style="margin:0;color:#cbd5e1;font-size:12px;text-align:center;">
                © ${new Date().getFullYear()} WestPay · Plateforme privée · 
                <a href="https://westpay.cfd" style="color:#00b050;text-decoration:none;">westpay.cfd</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `${otp} — Votre code de vérification RobotPay`,
      html,
    });
    if (result.error) {
      console.error("[EMAIL OTP] Erreur Resend:", result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[EMAIL OTP] Exception:", err);
    return false;
  }
}

export async function sendAdminNotificationEmail(
  to: string,
  subject: string,
  message: string,
  recipientName?: string
): Promise<boolean> {
  if (!resend) {
    console.log(`[EMAIL NOTIFY] RESEND_API_KEY non configuré — notification pour ${to}: ${subject}`);
    return true; // pretend success in dev
  }

  const name = recipientName || "Marchand";
  const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  const messageHtml = message
    .split("\n")
    .map(line => line.trim() ? `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.7;">${escHtml(line)}</p>` : "<br>")
    .join("");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#00b050 0%,#005c2e 100%);padding:36px 40px 32px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:10px;display:inline-block;vertical-align:middle;line-height:40px;text-align:center;font-size:22px;">🤖</div>
                <span style="font-size:26px;font-weight:800;color:#ffffff;vertical-align:middle;letter-spacing:-0.5px;">RobotPay</span>
              </div>
              <p style="margin:12px 0 0;color:rgba(255,255,255,0.85);font-size:14px;letter-spacing:0.3px;">Plateforme de paiement Mobile Money</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a1628;letter-spacing:-0.3px;">${subject}</h1>
              <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;">Bonjour <strong style="color:#0a1628;">${name}</strong>,</p>
              <div style="border-left:4px solid #00b050;padding-left:16px;margin:0 0 24px;">
                ${messageHtml}
              </div>
              <div style="background:#f0fdf4;border-radius:10px;padding:16px 20px;margin:0 0 16px;">
                <p style="margin:0;color:#16a34a;font-size:13px;line-height:1.5;">
                  📧 Cet email vous a été envoyé par l'équipe <strong>RobotPay</strong>. Pour toute question, contactez votre gestionnaire de compte.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 36px;border-top:1px solid #f1f5f9;">
              <p style="margin:0;color:#cbd5e1;font-size:12px;text-align:center;">
                © ${new Date().getFullYear()} RobotPay · Plateforme privée ·
                <a href="https://westpay.cfd" style="color:#00b050;text-decoration:none;">westpay.cfd</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const result = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    if (result.error) {
      console.error("[EMAIL NOTIFY] Erreur Resend:", result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[EMAIL NOTIFY] Exception:", err);
    return false;
  }
}
