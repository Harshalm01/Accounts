// In-memory OTP store: { email: { otp, expiresAt, name } }
const otpStore = new Map();

/**
 * Generate a 6-digit OTP
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP with expiry
 * @param {string} email
 * @param {string} otp
 * @param {string} name - User's name (for personalization)
 */
function storeOTP(email, otp, name = '') {
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
    const expiresAt = Date.now() + expiryMinutes * 60 * 1000;

    otpStore.set(email.toLowerCase(), { otp, expiresAt, name });
    console.log(`🔑 OTP stored for ${email} (expires in ${expiryMinutes} min)`);
}

/**
 * Verify OTP
 * @param {string} email
 * @param {string} otp
 * @returns {{ valid: boolean, message: string, name?: string }}
 */
function verifyOTP(email, otp) {
    const record = otpStore.get(email.toLowerCase());

    if (!record) {
        return { valid: false, message: 'No OTP found. Please request a new one.' };
    }

    if (Date.now() > record.expiresAt) {
        otpStore.delete(email.toLowerCase());
        return { valid: false, message: 'OTP has expired. Please request a new one.' };
    }

    if (record.otp !== otp) {
        return { valid: false, message: 'Invalid OTP. Please try again.' };
    }

    // OTP is valid — remove it (one-time use)
    const name = record.name;
    otpStore.delete(email.toLowerCase());
    return { valid: true, message: 'OTP verified successfully!', name };
}

module.exports = { generateOTP, storeOTP, verifyOTP };
