// ============================================================
// js/push.js — Web Push Client for Class Reminders
// ============================================================

const PushClient = (() => {
  let isPushSupported = false;
  let swRegistration = null;
  let isSubscribed = false;

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

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

  async function syncCurrentSubscription() {
    try {
      if (!swRegistration) {
        swRegistration = await navigator.serviceWorker.ready;
      }
      const pushManager = (swRegistration && swRegistration.pushManager) || window.pushManager;
      if (!pushManager) return null;

      const subscription = await pushManager.getSubscription();
      if (!subscription) {
        isSubscribed = false;
        return null;
      }

      isSubscribed = true;
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
        const data = await subRes.json();
        return { ok: true, deviceCount: data.deviceCount };
      }
    } catch (e) {
      console.warn('Subscription sync notice:', e);
    }
    return null;
  }

  async function init() {
    if (!('serviceWorker' in navigator)) {
      isPushSupported = false;
      return false;
    }

    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      isPushSupported = ('PushManager' in window) || ('pushManager' in swRegistration);

      if (isPushSupported && swRegistration.pushManager) {
        const subscription = await swRegistration.pushManager.getSubscription();
        isSubscribed = (subscription !== null);
        if (subscription) {
          syncCurrentSubscription();
        }
      }
      return true;
    } catch (e) {
      console.warn('Service worker registration failed:', e);
      return false;
    }
  }

  async function subscribe() {
    // 1. iOS Specific Guard: Safari requires Add to Home Screen (PWA mode) for Push Notifications
    if (isIOS() && !isStandalone()) {
      return {
        ok: false,
        isIOSPrompt: true,
        error: 'บน iPhone จำเป็นต้องกดแชร์ ➔ "เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen) ก่อน แล้วเปิดแอปจากหน้าจอโฮมเพื่อรับการแจ้งเตือนครับ 📲'
      };
    }

    if (!('serviceWorker' in navigator)) {
      return { ok: false, error: 'เบราว์เซอร์ของคุณไม่รองรับ Service Worker' };
    }

    try {
      if (!swRegistration) {
        swRegistration = await navigator.serviceWorker.register('./sw.js');
      }
      const readyRegistration = await navigator.serviceWorker.ready;

      // 2. Request Notification Permission
      if (!('Notification' in window)) {
        return { ok: false, error: 'อุปกรณ์นี้ไม่รองรับระบบการแจ้งเตือน Web Notifications' };
      }

      let permission = Notification.permission;
      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        return { ok: false, error: 'กรุณากดอนุญาต (Allow) การแจ้งเตือนในการตั้งค่าของอุปกรณ์' };
      }

      // 3. Fetch VAPID key from backend
      const res = await fetch('/api/push/vapid-key');
      const data = await res.json();
      if (!res.ok || !data.publicKey) {
        return { ok: false, error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า VAPID Key' };
      }

      // 4. Subscribe to Push Manager
      const applicationServerKey = urlBase64ToUint8Array(data.publicKey);
      const pushManager = readyRegistration.pushManager || window.pushManager;

      if (!pushManager) {
        return { ok: false, error: 'ไม่พบ PushManager บนเบราว์เซอร์นี้' };
      }

      // Unsubscribe stale subscription to ensure alignment with active server VAPID key
      try {
        const oldSub = await pushManager.getSubscription();
        if (oldSub) {
          await oldSub.unsubscribe();
        }
      } catch (_) {}

      const subscription = await pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      // 5. Send subscription to server
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
        const subData = await subRes.json();
        return { ok: true, deviceCount: subData.deviceCount };
      } else {
        return { ok: false, error: 'บันทึกการแจ้งเตือนไปยังเซิร์ฟเวอร์ไม่สำเร็จ' };
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
      if (res.ok && data.success) {
        return { ok: true, sent: data.sent, totalDevices: data.totalDevices };
      }
      return { ok: false, error: (data && data.error) || 'ส่งแจ้งเตือนไม่สำเร็จ' };
    } catch (e) {
      return { ok: false, error: e.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' };
    }
  }

  function getStatus() {
    return {
      supported: isPushSupported,
      subscribed: isSubscribed,
      isIOS: isIOS(),
      isStandalone: isStandalone(),
      permission: ('Notification' in window) ? Notification.permission : 'unsupported'
    };
  }

  return {
    init,
    subscribe,
    syncCurrentSubscription,
    testNotification,
    getStatus,
    isIOS,
    isStandalone
  };
})();

window.PushClient = PushClient;
