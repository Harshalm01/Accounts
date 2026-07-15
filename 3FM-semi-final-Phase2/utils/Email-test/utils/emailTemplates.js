/**
 * Email templates for OTP and notifications
 * All templates return HTML strings with personalized content
 */

function otpTemplate(name, otp, purpose = 'verify your account') {
    const expiryMinutes = process.env.OTP_EXPIRY_MINUTES || 5;

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }
            .container { max-width: 500px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
            .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px; }
            .body { padding: 30px; text-align: center; }
            .greeting { font-size: 18px; color: #333; margin-bottom: 10px; }
            .message { color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 25px; }
            .otp-box { background: #f8f9fa; border: 2px dashed #667eea; border-radius: 10px; padding: 20px; margin: 20px 0; }
            .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea; margin: 0; }
            .expiry { color: #999; font-size: 12px; margin-top: 10px; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee; }
            .footer p { color: #999; font-size: 12px; margin: 0; }
            .warning { color: #e74c3c; font-size: 12px; margin-top: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>3 Folks Media</h1>
                <p>Email Verification</p>
            </div>
            <div class="body">
                <p class="greeting">Hi ${name || 'there'}! 👋</p>
                <p class="message">
                    We received a request to ${purpose}. 
                    Use the OTP below to complete the process:
                </p>
                <div class="otp-box">
                    <p class="otp-code">${otp}</p>
                    <p class="expiry">Valid for ${expiryMinutes} minutes</p>
                </div>
                <p class="warning">⚠️ Do not share this code with anyone.</p>
            </div>
            <div class="footer">
                <p>© 2026 3 Folks Media. All rights reserved.</p>
                <p>If you didn't request this, please ignore this email.</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

function welcomeTemplate(name) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }
            .container { max-width: 500px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
            .body { padding: 30px; text-align: center; }
            .emoji { font-size: 48px; margin-bottom: 15px; }
            .greeting { font-size: 22px; color: #333; margin-bottom: 10px; font-weight: bold; }
            .message { color: #666; font-size: 15px; line-height: 1.8; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee; }
            .footer p { color: #999; font-size: 12px; margin: 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Welcome to 3 Folks Media!</h1>
            </div>
            <div class="body">
                <p class="emoji">🎉</p>
                <p class="greeting">Hey ${name}!</p>
                <p class="message">
                    Your account has been verified successfully!<br><br>
                    We're thrilled to have you on board. Your journey with 
                    <strong>3 Folks Media</strong> starts now.<br><br>
                    If you have any questions, feel free to reach out to our team anytime.
                </p>
            </div>
            <div class="footer">
                <p>© 2026 3 Folks Media. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

function notificationTemplate(name, subject, message, ctaText = '', ctaLink = '') {
    const ctaButton = ctaText && ctaLink ? `
        <a href="${ctaLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; margin-top: 20px;">${ctaText}</a>
    ` : '';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }
            .container { max-width: 540px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
            .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 13px; }
            .body { padding: 30px; }
            .greeting { font-size: 18px; color: #333; margin-bottom: 15px; }
            .content { color: #555; font-size: 15px; line-height: 1.8; white-space: pre-line; }
            .cta { text-align: center; margin-top: 25px; }
            .divider { border: none; border-top: 1px solid #eee; margin: 25px 0; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee; }
            .footer p { color: #999; font-size: 12px; margin: 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>3 Folks Media</h1>
                <p>${subject}</p>
            </div>
            <div class="body">
                <p class="greeting">Hi ${name || 'there'},</p>
                <div class="content">${message}</div>
                ${ctaButton ? `<div class="cta">${ctaButton}</div>` : ''}
                <hr class="divider">
                <p style="color: #999; font-size: 13px;">This email was sent to you by <strong>3 Folks Media</strong>. If you believe this was sent by mistake, please ignore it.</p>
            </div>
            <div class="footer">
                <p>&copy; 2026 3 Folks Media. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

module.exports = { otpTemplate, welcomeTemplate, notificationTemplate };
