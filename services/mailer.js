const nodemailer = require("nodemailer");

function getTransporter() {
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || "").trim();
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_PASS || process.env.EMAIL_PASS || "").trim();

  if (!user || !pass) {
    return null;
  }

  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();

  // For Gmail / Google Workspace accounts, service: 'gmail' is standard & reliable
  if (host.toLowerCase().includes("gmail")) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });
  }

  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

/**
 * Send Automated Email Notification to Creator with Exact Formatting
 * @param {Object} opts
 * @param {string} opts.to - Creator Email Address
 * @param {string} opts.status - Invoice Status ('APPROVED' / 'ACCEPTED', 'REJECTED', 'PAID' / 'PAYMENT COMPLETED')
 * @param {string} opts.invoiceNo - Invoice Number
 * @param {string} opts.creatorName - Creator Full Name
 * @param {string} opts.campaignName - Campaign Name
 * @param {number|string} opts.amount - Amount (₹)
 * @param {string} [opts.rejectionReason] - Reason if REJECTED
 * @param {string} [opts.utr] - UTR reference if payment processed
 */
async function sendInvoiceStatusEmail({ to, status, invoiceNo, creatorName, campaignName, amount, rejectionReason, utr }) {
  const normEmail = String(to || "").trim();
  if (!normEmail || !normEmail.includes("@")) {
    console.warn(`[Mailer Warning] Cannot send email for Invoice #${invoiceNo}. Creator recipient email is missing or invalid: "${normEmail}".`);
    return false;
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[Mailer Warning] Cannot send email. SMTP_USER or SMTP_PASS environment variables are missing on the server.");
    return false;
  }

  const fromName = (process.env.EMAIL_FROM_NAME || "Team 3Folks Media").trim();
  const fromEmail = (process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || "").trim();
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

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: normEmail,
      subject,
      html
    });
    console.log(`[Mailer Success] Email sent to "${normEmail}" for Invoice #${invoiceNo} (${subject}). Message ID: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`[Mailer Error] Failed sending email to "${normEmail}":`, err.message);
    return false;
  }
}

module.exports = {
  sendInvoiceStatusEmail
};
