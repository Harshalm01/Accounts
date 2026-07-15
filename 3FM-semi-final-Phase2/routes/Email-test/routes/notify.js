const express = require('express');
const router = express.Router();
const { sendEmail } = require('../config/email');
const { notificationTemplate } = require('../utils/emailTemplates');

/**
 * POST /api/notify/send
 * Body: { email, name, subject, message, ctaText?, ctaLink? }
 * Sends a personalized email notification
 */
router.post('/send', async (req, res) => {
    try {
        const { email, name, subject, message, ctaText, ctaLink } = req.body;

        if (!email || !subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'Email, subject, and message are required',
            });
        }

        const html = notificationTemplate(name, subject, message, ctaText, ctaLink);
        await sendEmail(email, `${subject} | 3 Folks Media`, html);

        console.log(`📬 Notification sent to ${email} — Subject: "${subject}"`);

        res.json({
            success: true,
            message: `Notification sent to ${email}`,
        });

    } catch (error) {
        console.error('❌ Notification Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to send notification.',
            error: error.message,
        });
    }
});

/**
 * POST /api/notify/bulk
 * Body: { recipients: [{ email, name }], subject, message, ctaText?, ctaLink? }
 * Sends personalized notifications to multiple recipients
 */
router.post('/bulk', async (req, res) => {
    try {
        const { recipients, subject, message, ctaText, ctaLink } = req.body;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Recipients array is required',
            });
        }

        if (!subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'Subject and message are required',
            });
        }

        const results = [];
        for (const recipient of recipients) {
            try {
                const personalizedMsg = message.replace(/{{name}}/g, recipient.name || 'there');
                const html = notificationTemplate(recipient.name, subject, personalizedMsg, ctaText, ctaLink);
                await sendEmail(recipient.email, `${subject} | 3 Folks Media`, html);
                results.push({ email: recipient.email, status: 'sent' });
            } catch (err) {
                results.push({ email: recipient.email, status: 'failed', error: err.message });
            }
        }

        const sent = results.filter(r => r.status === 'sent').length;
        console.log(`📬 Bulk notification: ${sent}/${recipients.length} sent`);

        res.json({
            success: true,
            message: `Sent ${sent} of ${recipients.length} notifications`,
            results,
        });

    } catch (error) {
        console.error('❌ Bulk Notification Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to send bulk notifications.',
        });
    }
});

module.exports = router;
