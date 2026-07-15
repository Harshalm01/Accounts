const nodemailer = require('nodemailer');

// Create Gmail SMTP transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Verify connection on startup
transporter.verify()
    .then(() => console.log('✅ Email transporter is ready'))
    .catch((err) => console.error('❌ Email config error:', err.message));

/**
 * Send an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 */
async function sendEmail(to, subject, html) {
    const mailOptions = {
        from: `"3 Folks Media" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📨 Email sent to ${to} | Message ID: ${info.messageId}`);
    return info;
}

module.exports = { sendEmail };
