const nodemailer = require("nodemailer");
const https = require("https");
const dns = require("dns");

// Force Node.js DNS resolution to prioritize IPv4 globally (prevents ENETUNREACH IPv6 errors)
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch (_) {}
}

const customIpv4Lookup = (hostname, options, callback) => {
  return dns.lookup(hostname, { family: 4 }, callback);
};

/**
 * Multi-provider Email Delivery Engine with Brevo HTTPS API First Priority
 */
async function sendMailWithFallback(mailOptions) {
  // 1. If Brevo / Sendinblue HTTP API Key is provided, send via HTTPS Port 443 FIRST (Never blocked)
  if (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY) {
    try {
      const brevoRes = await sendViaBrevoHttp(mailOptions);
      if (brevoRes) return true;
    } catch (e) {
      console.warn("[Mailer] Brevo HTTP error:", e.message);
    }
  }

  // 2. If Resend HTTP API Key is provided, send via HTTPS Port 443
  if (process.env.RESEND_API_KEY) {
    try {
      const resendRes = await sendViaResendHttp(mailOptions);
      if (resendRes) return true;
    } catch (e) {
      console.warn("[Mailer] Resend HTTP error:", e.message);
    }
  }

  // 3. If Gmail credentials are provided, attempt IPv4 Gmail connection profiles
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || "").trim();
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_PASS || process.env.EMAIL_PASS || "").trim();

  if (user && pass) {
    const gmailSuccess = await sendViaGmailModes(mailOptions, user, pass);
    if (gmailSuccess) return true;
  } else {
    console.warn("[Mailer Warning] Cannot send email. SMTP_USER, SMTP_PASS, or BREVO_API_KEY environment variables are missing on your server host.");
  }

  console.error(`[Mailer Error] Failed to deliver email to "${mailOptions.to}". Please verify your BREVO_API_KEY or Gmail App Password.`);
  return false;
}

/**
 * Sends email specifically using your Organisation Gmail Account credentials with strict IPv4 resolution
 */
async function sendViaGmailModes(mailOptions, user, pass) {
  const modes = [
    {
      name: "smtp.gmail.com Port 587 (IPv4 TLS)",
      options: {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        requireTLS: true,
        family: 4,
        lookup: customIpv4Lookup,
        auth: { user, pass },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000,
        tls: { rejectUnauthorized: false }
      }
    },
    {
      name: "smtp.gmail.com Port 465 (IPv4 Direct SSL)",
      options: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        family: 4,
        lookup: customIpv4Lookup,
        auth: { user, pass },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000,
        tls: { rejectUnauthorized: false }
      }
    },
    {
      name: "Gmail Service Engine (IPv4)",
      options: {
        service: "gmail",
        family: 4,
        lookup: customIpv4Lookup,
        auth: { user, pass },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 12000,
        tls: { rejectUnauthorized: false }
      }
    }
  ];

  for (const m of modes) {
    try {
      console.log(`[Mailer] Attempting email send via ${m.name} to ${mailOptions.to}...`);
      const transporter = nodemailer.createTransport(m.options);
      const info = await transporter.sendMail(mailOptions);
      console.log(`[Mailer Success] Email delivered to "${mailOptions.to}" via ${m.name}! Message ID: ${info.messageId}`);
      return true;
    } catch (err) {
      console.warn(`[Mailer ${m.name} Failed]: ${err.message}`);
    }
  }

  return false;
}

/**
 * Send via Brevo (Sendinblue) HTTP API over HTTPS 443 (300 free emails/day)
 */
function sendViaBrevoHttp(mailOptions) {
  return new Promise((resolve) => {
    const apiKey = (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || "").trim();
    if (!apiKey) return resolve(false);

    // Uses BREVO_SENDER_EMAIL or SMTP_USER or fallback to noreply@3fm.co (Brevo verified sender)
    const senderEmail = (process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || "noreply@3fm.co").trim();
    const senderName = (process.env.EMAIL_FROM_NAME || "Team 3Folks Media").trim();

    const postData = JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: mailOptions.to }],
      subject: mailOptions.subject,
      htmlContent: mailOptions.html
    });

    const req = https.request({
      hostname: "api.brevo.com",
      path: "/v3/smtp/email",
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      },
      timeout: 10000
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[Mailer Brevo HTTP Success] Email sent to "${mailOptions.to}" via Brevo HTTPS API (Sender: ${senderEmail}).`);
          resolve(true);
        } else {
          console.warn(`[Mailer Brevo HTTP Failed ${res.statusCode}]: ${body}`);
          resolve(false);
        }
      });
    });

    req.on("error", (e) => {
      console.warn(`[Mailer Brevo HTTP Error]: ${e.message}`);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Send via Resend HTTP API over HTTPS 443
 */
function sendViaResendHttp(mailOptions) {
  return new Promise((resolve) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return resolve(false);

    const postData = JSON.stringify({
      from: mailOptions.from || "Team 3Folks Media <onboarding@resend.dev>",
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
      timeout: 10000
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
  const fromEmail = (process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || "noreply@3fm.co").trim();
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
        .header { background: #0f172a; padding: 24px 28px; text-align: left; border-bottom: 3px solid #7c3aed; }
        .header img { max-height: 48px; width: auto; display: block; }
        .body { padding: 32px 28px; font-size: 15px; line-height: 1.6; color: #1e293b; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://invoices.3folks.com/public/logo.png" alt="3Folks Media" />
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
