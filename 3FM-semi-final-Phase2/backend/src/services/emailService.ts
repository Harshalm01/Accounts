import nodemailer from 'nodemailer';

// ─── Transporter (eager init — matches Email-test pattern) ──────────────
const _email = process.env.EMAIL_USER;
const _pass = (process.env.EMAIL_PASS || '').replace(/\s/g, '');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: _email, pass: _pass },
});

// Verify connection on startup (non-blocking)
// Don't await this - if email fails, it shouldn't crash the server
transporter.verify()
  .then(() => console.log('✅ Email transporter is ready'))
  .catch((err: Error) => {
    console.error('⚠️  Email config error (non-critical):', err.message);
    console.log('💡 Email sending will be skipped. Check EMAIL_USER and EMAIL_PASS environment variables.');
  });

// ─── Generic send ───────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!_email || !_pass) {
    console.warn('[EmailService] EMAIL_USER / EMAIL_PASS not configured — email skipped');
    return;
  }
  const info = await transporter.sendMail({
    from: `"3 Folks Media" <${_email}>`,
    to,
    subject,
    html,
  });
  console.log(`📨 Email sent to ${to} | Message ID: ${info.messageId}`);
}

// ─── Shared template wrapper ────────────────────────────────────────────
function wrap(body: string): string {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 24px 32px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">3Folks Media</h1>
      </div>
      <div style="padding: 32px;">
        ${body}
      </div>
      <div style="padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">This is an automated notification from 3FM. Please do not reply to this email.</p>
      </div>
    </div>
  `;
}

// ─── Invoice Approved ───────────────────────────────────────────────────
export async function sendInvoiceApprovedEmail(
  recipientEmail: string,
  recipientName: string,
  invoiceOriginalName: string,
  folder: string,
): Promise<void> {
  const html = wrap(`
    <p style="color: #111827; font-size: 15px; line-height: 1.6;">Hi <strong>${recipientName}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">Your invoice <strong>"${invoiceOriginalName}"</strong> has been <span style="color: #059669; font-weight: 600;">approved</span> and saved to the folder: <strong>${folder}</strong>.</p>
    <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">You can view the invoice details in the Invoice section of your 3FM dashboard.</p>
  `);
  await sendEmail(recipientEmail, `Invoice Approved — ${invoiceOriginalName}`, html);
}

// ─── Invoice Rejected ───────────────────────────────────────────────────
export async function sendInvoiceRejectedEmail(
  recipientEmail: string,
  recipientName: string,
  invoiceOriginalName: string,
): Promise<void> {
  const html = wrap(`
    <p style="color: #111827; font-size: 15px; line-height: 1.6;">Hi <strong>${recipientName}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">Your invoice <strong>"${invoiceOriginalName}"</strong> has been <span style="color: #dc2626; font-weight: 600;">rejected</span>.</p>
    <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Please review the invoice and re-upload a corrected version if needed.</p>
  `);
  await sendEmail(recipientEmail, `Invoice Rejected — ${invoiceOriginalName}`, html);
}

// ─── Campaign Assignment ────────────────────────────────────────────────
export async function sendCampaignAssignmentEmail(
  recipientEmail: string,
  recipientName: string,
  campaignName: string,
  assignerName: string,
): Promise<void> {
  const html = wrap(`
    <p style="color: #111827; font-size: 15px; line-height: 1.6;">Hi <strong>${recipientName}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;"><strong>${assignerName}</strong> has assigned you to the campaign: <strong>"${campaignName}"</strong>.</p>
    <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Log in to your 3FM dashboard to view the assignment details and take action.</p>
  `);
  await sendEmail(recipientEmail, `New Campaign Assignment — ${campaignName}`, html);
}

// ─── Payment Reminder ───────────────────────────────────────────────────
export async function sendPaymentReminderEmail(
  recipientEmail: string,
  recipientName: string,
  title: string,
  body: string,
): Promise<void> {
  const html = wrap(`
    <p style="color: #111827; font-size: 15px; line-height: 1.6;">Hi <strong>${recipientName}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6; font-weight: 600;">${title}</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">${body}</p>
    <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Please log in to the Accounts section to review pending payments.</p>
  `);
  await sendEmail(recipientEmail, title, html);
}

// ─── Magic Link (Creator Invoice Portal) ────────────────────────────────
export async function sendMagicLinkEmail(
  creatorEmail: string,
  creatorName: string | null,
  campaignName: string,
  magicLink: string,
): Promise<void> {
  const name = creatorName || 'Creator';
  const html = wrap(`
    <p style="color: #111827; font-size: 15px; line-height: 1.6;">Hi <strong>${name}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      Your access request for the campaign <strong>"${campaignName}"</strong> has been approved.
      Click the button below to fill and submit your invoice.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${magicLink}" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block;">
        Submit My Invoice
      </a>
    </div>
    <p style="color: #6b7280; font-size: 13px; margin-top: 8px;">
      Or copy this link: <a href="${magicLink}" style="color: #4f46e5;">${magicLink}</a>
    </p>
    <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This link is valid for 30 days.</p>
  `);
  await sendEmail(creatorEmail, `Your invoice link for ${campaignName} — 3Folks Media`, html);
}

// ─── Invoice Rejection (Creator Portal) ─────────────────────────────────
export async function sendCreatorInvoiceRejectionEmail(
  creatorEmail: string,
  creatorName: string | null,
  campaignName: string,
  comment: string,
  magicLink: string,
): Promise<void> {
  const name = creatorName || 'Creator';
  const html = wrap(`
    <p style="color: #111827; font-size: 15px; line-height: 1.6;">Hi <strong>${name}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      Your invoice for <strong>"${campaignName}"</strong> has been <span style="color: #dc2626; font-weight: 600;">rejected</span>.
    </p>
    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; border-radius: 4px; margin: 20px 0;">
      <p style="color: #7f1d1d; font-size: 14px; margin: 0; font-weight: 600;">Reason:</p>
      <p style="color: #374151; font-size: 14px; margin: 8px 0 0;">${comment}</p>
    </div>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      Please correct the issues and resubmit using the button below.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${magicLink}" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block;">
        Resubmit Invoice
      </a>
    </div>
    <p style="color: #6b7280; font-size: 13px;">
      Or copy this link: <a href="${magicLink}" style="color: #4f46e5;">${magicLink}</a>
    </p>
  `);
  await sendEmail(creatorEmail, `Invoice update for ${campaignName} — Action required`, html);
}
