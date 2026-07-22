/**
 * 3Folks Media - Real-Time Live Sync & Native Desktop Notifications
 */

(function () {
  // Initialize Socket.IO Client if available
  let socket = null;
  if (typeof io !== 'undefined') {
    socket = io();
  }

  // Request Native Browser Desktop Notification Permissions
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          console.log('🔔 Desktop Notifications enabled for 3Folks Media.');
        }
      });
    }
  }

  // Send Native Desktop Notification
  window.sendDesktopNotification = function (title, body, iconUrl, targetUrl) {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      try {
        const notification = new Notification(title, {
          body: body || 'Real-time update from 3Folks Media Accounts Ledger',
          icon: iconUrl || '/public/logo.png',
          badge: '/public/logo.png',
          tag: '3fm-notification-' + Date.now(),
          renotify: true
        });

        notification.onclick = function () {
          window.focus();
          if (targetUrl) {
            window.location.href = targetUrl;
          }
          notification.close();
        };
      } catch (err) {
        console.warn('Desktop Notification error:', err);
      }
    } else if (Notification.permission === 'default') {
      requestNotificationPermission();
    }
  };

  // Play Notification Audio Ping
  function playNotificationAudio() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio context fallback
    }
  }

  // In-App Toast Banner Notification
  window.showInAppToast = function (title, message, targetUrl) {
    playNotificationAudio();

    let toastContainer = document.getElementById('appToastContainer');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'appToastContainer';
      toastContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      `;
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: #0f172a;
      color: #ffffff;
      padding: 14px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      border-left: 4px solid #7c3aed;
      min-width: 280px;
      max-width: 380px;
      font-size: 13px;
      font-family: system-ui, -apple-system, sans-serif;
      pointer-events: auto;
      cursor: pointer;
      opacity: 0;
      transform: translateX(40px);
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;

    toast.innerHTML = `
      <div style="font-weight: 800; font-size: 13px; color: #a78bfa; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
        <span>🔔 ${title}</span>
        <span style="font-size: 10px; color: #94a3b8;">Just Now</span>
      </div>
      <div style="color: #e2e8f0; line-height: 1.4;">${message}</div>
    `;

    if (targetUrl) {
      toast.onclick = () => window.location.href = targetUrl;
    }

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  };

  // Connect Socket.IO Listeners
  if (socket) {
    socket.on('connect', () => {
      console.log('⚡ Socket.IO Live-Sync connected.');
    });

    // Event 1: New Invoice Submitted
    socket.on('new-invoice', (data) => {
      const title = '📄 New Invoice Submitted';
      const body = `Invoice #${data.invoice_no || data.id} from ${data.creator_name || 'Creator'} (${data.campaign_name || 'Campaign'})`;
      const url = data.id ? `/admin/invoices/${data.id}` : '/admin/dashboard';
      
      window.sendDesktopNotification(title, body, '/public/logo.png', url);
      window.showInAppToast(title, body, url);
    });

    // Event 2: Invoice Status Change (Accepted / Rejected)
    socket.on('invoice-status-updated', (data) => {
      const title = `🔔 Invoice #${data.invoice_no || data.id} Updated`;
      const body = `Status changed to: ${data.status || 'Updated'}`;
      const url = data.id ? `/admin/invoices/${data.id}` : '/admin/dashboard';

      window.sendDesktopNotification(title, body, '/public/logo.png', url);
      window.showInAppToast(title, body, url);
    });

    // Event 3: General System Notification
    socket.on('notification', (data) => {
      const title = '📢 3Folks Media Alert';
      const body = data.message || 'New activity logged on accounts portal.';
      const url = data.invoice_id ? `/admin/invoices/${data.invoice_id}` : '/admin/dashboard';

      window.sendDesktopNotification(title, body, '/public/logo.png', url);
      window.showInAppToast(title, body, url);
    });
  }

  // Auto-request notification permission on user interaction
  document.addEventListener('click', function initNotifyPermission() {
    requestNotificationPermission();
    document.removeEventListener('click', initNotifyPermission);
  });
})();
