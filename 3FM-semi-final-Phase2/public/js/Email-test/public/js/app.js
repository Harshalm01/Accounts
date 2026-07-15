// ===== State =====
let userEmail = '';
let userName = '';
let countdownInterval = null;

// ===== DOM References =====
const stepSignup = document.getElementById('step-signup');
const stepVerify = document.getElementById('step-verify');
const stepSuccess = document.getElementById('step-success');

// ===== Send OTP =====
async function sendOTP() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const errorEl = document.getElementById('error-signup');
    const btn = document.getElementById('btn-send-otp');

    errorEl.textContent = '';

    if (!name) {
        errorEl.textContent = 'Please enter your name';
        return;
    }
    if (!email || !email.includes('@')) {
        errorEl.textContent = 'Please enter a valid email';
        return;
    }

    userName = name;
    userEmail = email;

    btn.disabled = true;
    btn.classList.add('loading');

    try {
        const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name }),
        });

        const data = await res.json();

        if (data.success) {
            showStep('verify');
            document.getElementById('display-email').textContent = email;
            startCountdown();
            // Focus first OTP input
            document.querySelector('.otp-digit[data-index="0"]').focus();
        } else {
            errorEl.textContent = data.message || 'Failed to send OTP';
        }
    } catch (err) {
        errorEl.textContent = 'Network error. Is the server running?';
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}

// ===== Verify OTP =====
async function verifyOTP() {
    const otpDigits = document.querySelectorAll('.otp-digit');
    const otp = Array.from(otpDigits).map(d => d.value).join('');
    const errorEl = document.getElementById('error-verify');
    const btn = document.getElementById('btn-verify');

    errorEl.textContent = '';

    if (otp.length !== 6) {
        errorEl.textContent = 'Please enter all 6 digits';
        return;
    }

    btn.disabled = true;
    btn.classList.add('loading');

    try {
        const res = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail, otp }),
        });

        const data = await res.json();

        if (data.success) {
            document.getElementById('display-name').textContent = data.name || userName;
            showStep('success');
            clearInterval(countdownInterval);
        } else {
            errorEl.textContent = data.message || 'Invalid OTP';
            // Shake the OTP inputs
            document.getElementById('otp-inputs').style.animation = 'none';
            setTimeout(() => {
                document.getElementById('otp-inputs').style.animation = 'shake 0.4s ease';
            }, 10);
        }
    } catch (err) {
        errorEl.textContent = 'Network error. Please try again.';
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}

// ===== Resend OTP =====
async function resendOTP() {
    const btn = document.getElementById('btn-resend');
    const errorEl = document.getElementById('error-verify');
    errorEl.textContent = '';

    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        const res = await fetch('/api/auth/resend-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail, name: userName }),
        });

        const data = await res.json();

        if (data.success) {
            // Clear OTP inputs
            document.querySelectorAll('.otp-digit').forEach(d => { d.value = ''; d.classList.remove('filled'); });
            document.querySelector('.otp-digit[data-index="0"]').focus();
            startCountdown();
        } else {
            errorEl.textContent = data.message || 'Failed to resend';
        }
    } catch (err) {
        errorEl.textContent = 'Network error.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Resend OTP';
    }
}

// ===== Countdown Timer =====
function startCountdown() {
    let seconds = 30;
    const timerEl = document.getElementById('timer');
    const countdownEl = document.getElementById('countdown');
    const resendBtn = document.getElementById('btn-resend');

    timerEl.classList.remove('hidden');
    resendBtn.classList.add('hidden');

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        seconds--;
        countdownEl.textContent = seconds;

        if (seconds <= 0) {
            clearInterval(countdownInterval);
            timerEl.classList.add('hidden');
            resendBtn.classList.remove('hidden');
        }
    }, 1000);
}

// ===== Step Navigation =====
function showStep(step) {
    stepSignup.classList.add('hidden');
    stepVerify.classList.add('hidden');
    stepSuccess.classList.add('hidden');

    if (step === 'signup') stepSignup.classList.remove('hidden');
    if (step === 'verify') stepVerify.classList.remove('hidden');
    if (step === 'success') stepSuccess.classList.remove('hidden');
}

function goBack() {
    clearInterval(countdownInterval);
    // Clear OTP inputs
    document.querySelectorAll('.otp-digit').forEach(d => { d.value = ''; d.classList.remove('filled'); });
    showStep('signup');
}

// ===== OTP Input Behavior =====
document.addEventListener('DOMContentLoaded', () => {
    const otpDigits = document.querySelectorAll('.otp-digit');

    otpDigits.forEach((input, index) => {
        // Move to next on input
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            if (value.length === 1) {
                input.classList.add('filled');
                if (index < 5) otpDigits[index + 1].focus();
            }
        });

        // Handle backspace
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                otpDigits[index - 1].focus();
                otpDigits[index - 1].value = '';
                otpDigits[index - 1].classList.remove('filled');
            }
        });

        // Handle paste (paste full OTP)
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (pasted.length === 6) {
                otpDigits.forEach((d, i) => {
                    d.value = pasted[i];
                    d.classList.add('filled');
                });
                otpDigits[5].focus();
            }
        });

        // Allow only digits
        input.addEventListener('keypress', (e) => {
            if (!/\d/.test(e.key)) e.preventDefault();
        });
    });

    // Enter key to submit on signup
    document.getElementById('email').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendOTP();
    });
    document.getElementById('name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('email').focus();
    });
});

// ===== Shake Animation (added via JS for OTP error) =====
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-8px); }
        40% { transform: translateX(8px); }
        60% { transform: translateX(-6px); }
        80% { transform: translateX(6px); }
    }
`;
document.head.appendChild(style);

// ===== Tab Switching =====
function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab');
    const tabOtp = document.getElementById('tab-otp');
    const tabNotify = document.getElementById('tab-notify');

    tabs.forEach(t => t.classList.remove('active'));

    if (tab === 'otp') {
        tabs[0].classList.add('active');
        tabOtp.classList.remove('hidden');
        tabNotify.classList.add('hidden');
    } else {
        tabs[1].classList.add('active');
        tabOtp.classList.add('hidden');
        tabNotify.classList.remove('hidden');
    }
}

// ===== Send Personalized Notification =====
async function sendNotification() {
    const name = document.getElementById('notify-name').value.trim();
    const email = document.getElementById('notify-email').value.trim();
    const subject = document.getElementById('notify-subject').value.trim();
    const message = document.getElementById('notify-message').value.trim();
    const ctaText = document.getElementById('notify-cta-text').value.trim();
    const ctaLink = document.getElementById('notify-cta-link').value.trim();
    const errorEl = document.getElementById('error-notify');
    const successEl = document.getElementById('success-notify');
    const btn = document.getElementById('btn-send-notify');

    errorEl.textContent = '';
    successEl.textContent = '';
    successEl.classList.add('hidden');

    if (!email || !email.includes('@')) {
        errorEl.textContent = 'Please enter a valid email address';
        return;
    }
    if (!subject) {
        errorEl.textContent = 'Please enter a subject';
        return;
    }
    if (!message) {
        errorEl.textContent = 'Please enter a message';
        return;
    }
    if ((ctaText && !ctaLink) || (!ctaText && ctaLink)) {
        errorEl.textContent = 'Provide both button text and link, or leave both empty';
        return;
    }

    btn.disabled = true;
    btn.classList.add('loading');

    try {
        const res = await fetch('/api/notify/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, subject, message, ctaText, ctaLink }),
        });

        const data = await res.json();

        if (data.success) {
            successEl.textContent = `✅ Notification sent to ${email}!`;
            successEl.classList.remove('hidden');
            // Clear form
            document.getElementById('notify-message').value = '';
            document.getElementById('notify-subject').value = '';
            document.getElementById('notify-cta-text').value = '';
            document.getElementById('notify-cta-link').value = '';
        } else {
            errorEl.textContent = data.message || 'Failed to send';
        }
    } catch (err) {
        errorEl.textContent = 'Network error. Is the server running?';
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
}
