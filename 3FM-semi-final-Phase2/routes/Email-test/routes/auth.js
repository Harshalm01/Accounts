const express = require('express');
const router = express.Router();
const { generateOTP, storeOTP, verifyOTP } = require('../utils/otp');
const { sendEmail } = require('../config/email');
const { otpTemplate, welcomeTemplate } = require('../utils/emailTemplates');

/**
 * POST /api/auth/send-otp
 * Body: { email, name }
 * Generates OTP, stores it, and sends it via email
 */
router.post('/send-otp', async (req, res) => {
    try {
        const { email, name } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Generate & store OTP
        const otp = generateOTP();
        storeOTP(email, otp, name);

        // Send OTP email with personalized template
        const html = otpTemplate(name, otp, 'verify your account');
        await sendEmail(email, `${otp} — Your Verification Code | 3 Folks Media`, html);

        res.json({
            success: true,
            message: `OTP sent to ${email}`,
        });

    } catch (error) {
        console.error('❌ Send OTP Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP. Check your email configuration.',
            error: error.message,
        });
    }
});

/**
 * POST /api/auth/verify-otp
 * Body: { email, otp }
 * Verifies the OTP entered by the user
 */
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email and OTP are required' });
        }

        const result = verifyOTP(email, otp);

        if (result.valid) {
            // Send welcome email after successful verification
            try {
                const html = welcomeTemplate(result.name || 'User');
                await sendEmail(email, `Welcome to 3 Folks Media! 🎉`, html);
            } catch (e) {
                console.log('Welcome email skipped:', e.message);
            }

            return res.json({
                success: true,
                message: result.message,
                name: result.name,
            });
        }

        res.status(400).json({
            success: false,
            message: result.message,
        });

    } catch (error) {
        console.error('❌ Verify OTP Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Verification failed. Please try again.',
        });
    }
});

/**
 * POST /api/auth/resend-otp
 * Body: { email, name }
 * Resends a new OTP (invalidates the old one)
 */
router.post('/resend-otp', async (req, res) => {
    try {
        const { email, name } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const otp = generateOTP();
        storeOTP(email, otp, name);

        const html = otpTemplate(name, otp, 'verify your account');
        await sendEmail(email, `${otp} — Your New Verification Code | 3 Folks Media`, html);

        res.json({
            success: true,
            message: `New OTP sent to ${email}`,
        });

    } catch (error) {
        console.error('❌ Resend OTP Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to resend OTP.',
        });
    }
});

module.exports = router;
