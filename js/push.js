// ============================================================
// js/push.js — Web Push Client for Class Reminders
// ============================================================

const PushClient = (() => {
  let isPushSupported = false;
  let swRegistration = null;
  let isSubscribed = false;

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      isPushSupported = false;
      return false;
    }
    isPushSupported = true;

    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js');
      const subscription = await swRegistration.pushManager.getSubscription();
      isSubscribed = (subscription !== null);
      return true;
    } catch (e) {
      console.warn('Service worker registration failed:', e);
      return false;
    }
  }

  async function subscribe() {
    if (!isPushSupported || !swRegistration) {
      return { ok: false, error: 'เบราว์เซอร์ของคุณไม่รองรับ Web Push Notifications' };
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { ok: false, error: 'กรุณาอนุญาต (Allow) การแจ้งเตือนในเบราว์เซอร์' };
      }

      // Fetch VAPID key
      const res = await fetch('/api/push/vapid-key');
      const data = await res.json();
      if (!res.ok || !data.publicKey) {
        return { ok: false, error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า VAPID Key' };
      }

      const applicationServerKey = urlBase64ToUint8Array(data.publicKey);
      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      // Send to server
      const syncKey = (window.CloudSync && CloudSync.getSyncKey()) || '1';
      const authToken = localStorage.getItem('sd-auth-token') || '';

      const subRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          'X-Sync-Key': syncKey
        },
        body: JSON.stringify({ subscription, syncKey })
      });

      if (subRes.ok) {
        isSubscribed = true;
        return { ok: true };
      } else {
        return { ok: false, error: 'บันทึกการแจ้งเตือนไม่สำเร็จ' };
      }
    } catch (e) {
      console.error('Push subscribe error:', e);
      return { ok: false, error: e.message || 'เกิดข้อผิดพลาดในการเปิดการแจ้งเตือน' };
    }
  }

  async function testNotification() {
    const syncKey = (window.CloudSync && CloudSync.getSyncKey()) || '1';
    const authToken = localStorage.getItem('sd-auth-token') || '';

    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          'X-Sync-Key': syncKey
        },
        body: JSON.stringify({ syncKey })
      });
      const data = await res.json();
      return { ok: res.ok, sent: data.sent };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function getStatus() {
    return {
      supported: isPushSupported,
      subscribed: isSubscribed,
      permission: ('Notification' in window) ? Notification.permission : 'unsupported'
    };
  }

  return {
    init,
    subscribe,
    testNotification,
    getStatus
  };
})();

window.PushClient = PushClient;
