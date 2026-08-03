const nodemailer = require("nodemailer");
const https = require("https");

/**
 * Multi-port SMTP sender that automatically falls back across ports (465 SSL, 587 TLS, 2525)
 * to bypass cloud server firewall port blocks.
 */
async function sendMailWithFallback(mailOptions) {
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || "").trim();
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_PASS || process.env.EMAIL_PASS || "").trim();
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();

  // 1. If Resend HTTP API Key is provided, use HTTPS Port 443 (Never blocked)
  if (process.env.RESEND_API_KEY) {
    try {
      const resendRes = await sendViaResendHttp(mailOptions);
      if (resendRes) return true;
    } catch (e) {
      console.warn("[Mailer] Resend HTTP fallback error:", e.message);
    }
  }

  if (!user || !pass) {
    console.warn("[Mailer Warning] Cannot send email. SMTP_USER or SMTP_PASS environment variables are missing.");
    return false;
  }

  // 2. Try SMTP ports in sequence: 465 (Direct SSL), 587 (TLS), 2525 (Alt SMTP), 25
  const portsToTry = [
    { port: 465, secure: true },
    { port: 587, secure: false },
    { port: 2525, secure: false },
    { port: 25, secure: false }
  ];

  let lastError = null;

  for (const config of portsToTry) {
    try {
      const transporter = nodemailer.createTransport({
        host: host.toLowerCase().includes("gmail") ? "smtp.gmail.com" : host,
        port: config.port,
        secure: config.secure,
        family: 4, // Force IPv4 to prevent ENETUNREACH
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 7000,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      });

      const info = await transporter.sendMail(mailOptions);
      console.log(`[Mailer Success] Email sent to "${mailOptions.to}" via port ${config.port}. Message ID: ${info.messageId}`);
      return true;
    } catch (err) {
      lastError = err;
      console.warn(`[Mailer Port ${config.port} failed]: ${err.message}`);
    }
  }

  console.error(`[Mailer Error] All SMTP ports (465, 587, 2525, 25) timed out or failed for "${mailOptions.to}":`, lastError ? lastError.message : "Connection timeout");
  return false;
}

/**
 * Send via Resend HTTP API over HTTPS 443 (Backup for cloud servers with total SMTP blocks)
 */
function sendViaResendHttp(mailOptions) {
  return new Promise((resolve) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return resolve(false);

    const postData = JSON.stringify({
      from: mailOptions.from || "3Folks Media <onboarding@resend.dev>",
      to: [mailOptions.to],
      subject: mailOptions.subject,
      html: mailOptions.html
    });

    const req = https.request({
      hostname: "api.resend.com",
      path: "/emails",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      },
      timeout: 6000
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[Mailer Resend HTTP Success] Email sent to "${mailOptions.to}" via Resend HTTPS API.`);
          resolve(true);
        } else {
          console.warn(`[Mailer Resend HTTP Failed ${res.statusCode}]: ${body}`);
          resolve(false);
        }
      });
    });

    req.on("error", (e) => {
      console.warn(`[Mailer Resend HTTP Error]: ${e.message}`);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Send Automated Email Notification to Creator with Exact Formatting
 */
async function sendInvoiceStatusEmail({ to, status, invoiceNo, creatorName, campaignName, amount, rejectionReason, utr }) {
  const normEmail = String(to || "").trim();
  if (!normEmail || !normEmail.includes("@")) {
    console.warn(`[Mailer Warning] Cannot send email for Invoice #${invoiceNo}. Creator recipient email is missing or invalid: "${normEmail}".`);
    return false;
  }

  const fromName = (process.env.EMAIL_FROM_NAME || "Team 3Folks Media").trim();
  const fromEmail = (process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || "accounts@3folksmedia.com").trim();
  const name = String(creatorName || "Creator").trim();
  const normStatus = String(status || "").toUpperCase();

  let subject = "";
  let bodyHtml = "";

  if (normStatus === "ACCEPTED" || normStatus === "APPROVED") {
    subject = "Invoice Approved – Payment Timeline";
    bodyHtml = `
      <p>Hi ${name},</p>
      <p>Your invoice has been reviewed and approved.</p>
      <p>Please connect with your campaign manager for details regarding the payment timeline and any further updates.</p>
      <p>Thank you for your cooperation.</p>
      <br/>
      <p>Best regards,<br/><strong>Team 3Folks Media</strong></p>
    `;
  } else if (normStatus === "REJECTED") {
    subject = "Invoice Rejected – Action Required";
    const reasonText = String(rejectionReason || "No specific reason provided.").trim();
    bodyHtml = `
      <p>Hi ${name},</p>
      <p>Your invoice has been reviewed and rejected due to the following reason:</p>
      <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 6px; margin: 14px 0;">
        <strong style="color: #991b1b; font-size: 12px; text-transform: uppercase;">Reason:</strong><br/>
        <span style="color: #b91c1c; font-weight: 700; font-size: 15px;">${reasonText}</span>
      </div>
      <p>Please make the necessary corrections and resubmit the revised invoice to your campaign manager for further processing.</p>
      <br/>
      <p>Best regards,<br/><strong>Team 3Folks Media</strong></p>
    `;
  } else if (normStatus === "PAID" || normStatus === "PAYMENT COMPLETED") {
    subject = "Payment Processed";
    const utrHtml = utr ? `<div style="background: #ecfdf5; border-left: 4px solid #059669; padding: 12px 16px; border-radius: 6px; margin: 14px 0;"><strong style="color: #065f46; font-size: 11px; text-transform: uppercase;">Bank UTR Reference Number:</strong><br/><span style="font-family: monospace; font-size: 15px; font-weight: 800; color: #047857;">${utr}</span></div>` : "";
    bodyHtml = `
      <p>Hi ${name},</p>
      <p>Your payment has been successfully processed. The amount should be credited to your registered bank account within the next 24 hours.</p>
      ${utrHtml}
      <p>Please contact your campaign manager in case you do not receive the payment within this timeline.</p>
      <br/>
      <p>Best regards,<br/><strong>Team 3Folks Media</strong></p>
    `;
  } else {
    subject = `Invoice Update - #${invoiceNo}`;
    bodyHtml = `
      <p>Hi ${name},</p>
      <p>Your invoice <strong>#${invoiceNo}</strong> has been updated to <strong>${normStatus}</strong>.</p>
      <br/>
      <p>Best regards,<br/><strong>Team 3Folks Media</strong></p>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #334155; }
        .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .header { background: #0f172a; padding: 24px 28px; text-align: left; }
        .header img { max-height: 40px; width: auto; }
        .body { padding: 32px 28px; font-size: 15px; line-height: 1.6; color: #1e293b; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div style="font-size: 18px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px;">3Folks Media</div>
        </div>
        <div class="body">
          ${bodyHtml}
        </div>
        <div class="footer">
          © ${new Date().getFullYear()} 3Folks Media. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendMailWithFallback({
    from: `"${fromName}" <${fromEmail}>`,
    to: normEmail,
    subject,
    html
  });
}

module.exports = {
  sendInvoiceStatusEmail
};
