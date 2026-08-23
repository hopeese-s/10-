// ============================================================
// sync.js — Real-Time Cloud Sync, Auth & Live Calendar Feed Module
// Multi-User Data Isolation & WebCal Sync
// ============================================================

const CloudSync = (function () {
  'use strict';

  // Dynamic host determination: always use current origin
  const BASE_URL = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://daily-study-dashboard-production.up.railway.app';
  const SYNC_API = `${BASE_URL}/api/sync`;
  const AUTH_API = `${BASE_URL}/api/auth`;
  const CAL_API  = `${BASE_URL}/api/calendar`;
  const PUB_API  = `${BASE_URL}/api/public`;
  const SHARE_API = `${BASE_URL}/api/share`;

  const PUSH_DEBOUNCE_MS = 20;     // 20ms ultra-fast push
  const POLL_INTERVAL_MS = 1500;   // Poll every 1.5 seconds for multi-device sync

  let authToken    = localStorage.getItem('sd-auth-token') || '';
  let currentUser  = null;
  try {
    const savedUser = localStorage.getItem('sd-current-user');
    if (savedUser && authToken) currentUser = JSON.parse(savedUser);
  } catch (_) {}
  let syncKey      = localStorage.getItem('sd-sync-key') || (currentUser ? currentUser.id : '1');
  let syncStatus   = currentUser ? 'synced' : 'local';
  let lastSyncTime = parseInt(localStorage.getItem('sd-last-sync-time') || '0', 10);
  let rememberMe   = localStorage.getItem('sd-remember-me') === 'true';

  let isPushing       = false;
  let isPulling       = false;
  let pendingPushData = null;
  let pushDebounceId  = null;
  let pollTimer       = null;

  let _onRemoteUpdate = null;

  // BroadcastChannel (cross-tab same device, 0ms)
  let bc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('egbe-sync');
    }
  } catch (_) {}

  // ─── Authentication API ──────────────────────────────────────
  async function register(username, password, displayName) {
    try {
      const res = await fetch(`${AUTH_API}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('sd-auth-token', authToken);
        localStorage.setItem('sd-current-user', JSON.stringify(currentUser));
        setSyncKey(currentUser.id);
        updateUIStatus();
        return { ok: true, user: currentUser };
      } else {
        return { ok: false, error: data.error || 'สมัครสมาชิกไม่สำเร็จ' };
      }
    } catch (e) {
      return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' };
    }
  }

  async function login(username, password) {
    try {
      const res = await fetch(`${AUTH_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('sd-auth-token', authToken);
        localStorage.setItem('sd-current-user', JSON.stringify(currentUser));
        setSyncKey(currentUser.id);
        updateUIStatus();
        return { ok: true, user: currentUser };
      } else {
        return { ok: false, error: data.error || 'เข้าสู่ระบบไม่สำเร็จ' };
      }
    } catch (e) {
      return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' };
    }
  }

  async function checkAuth() {
    if (!authToken) return null;
    try {
      const res = await fetch(`${AUTH_API}/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        localStorage.setItem('sd-current-user', JSON.stringify(currentUser));
        setSyncKey(currentUser.id);
        updateUIStatus();
        return currentUser;
      } else {
        // Token expired — clear it
        authToken = '';
        currentUser = null;
        localStorage.removeItem('sd-auth-token');
        localStorage.removeItem('sd-current-user');
        updateUIStatus();
        return null;
      }
    } catch (_) {
      // Network error — if we already have currentUser from localStorage, keep it
      if (currentUser) {
        return currentUser;
      }
      return null;
    }
  }

  function setRememberMe(val) {
    rememberMe = !!val;
    localStorage.setItem('sd-remember-me', rememberMe ? 'true' : 'false');
  }

  function getRememberMe() {
    return rememberMe;
  }

  async function logout() {
    if (authToken) {
      try {
        await fetch(`${AUTH_API}/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      } catch (_) {}
    }
    authToken = '';
    currentUser = null;
    localStorage.removeItem('sd-auth-token');
    localStorage.removeItem('sd-current-user');
    setSyncKey('1');
    updateUIStatus();
  }

  // ─── Public Hub API (For External Sharing) ───────────────────
  async function getPublicHub() {
    try {
      const res = await fetch(`${PUB_API}/hub?t=${Date.now()}`);
      if (res.ok) return await res.json();
    } catch (_) {}
    return null;
  }

  // ─── Token-Based Share Bundles (select files/folders) ───────
  async function createShareBundle(resourceIds, folders, label) {
    try {
      const res = await fetch(`${SHARE_API}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          'X-Sync-Key': syncKey || '1'
        },
        body: JSON.stringify({ resourceIds: resourceIds || [], folders: folders || [], label: label || '' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { ok: true, token: data.token };
      }
      return { ok: false, error: (data && data.error) || 'สร้างลิงก์แชร์ไม่สำเร็จ' };
    } catch (_) {
      return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' };
    }
  }

  async function fetchShareBundle(token) {
    try {
      const res = await fetch(`${SHARE_API}/${encodeURIComponent(token)}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (_) {}
    return null;
  }

  // ─── Public Getters & Setters ───────────────────────────────
  function getCurrentUser()  { return currentUser; }
  function getSyncKey()      { return syncKey; }
  function getLastSyncTime() { return lastSyncTime; }

  function getCalendarFeedUrl(routines = false, study = true, classes = true) {
    const key = currentUser ? currentUser.calendarKey : (syncKey === '1' ? 'default' : syncKey);
    let qs = [];
    if (routines) qs.push('routines=1');
    if (!study) qs.push('study=0');
    if (!classes) qs.push('class=0');
    const suffix = qs.length > 0 ? '?' + qs.join('&') : '';
    const httpsUrl = `${CAL_API}/${key}/feed.ics${suffix}`;
    const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://');
    return { httpsUrl, webcalUrl, key };
  }

  function setSyncKey(key) {
    syncKey = (key || '').trim();
    if (syncKey) {
      localStorage.setItem('sd-sync-key', syncKey);
      syncStatus = 'synced';
    } else {
      localStorage.removeItem('sd-sync-key');
      syncStatus = 'local';
    }
    updateUIStatus();
    if (bc) {
      try { bc.postMessage({ type: 'KEY_CHANGED', syncKey }); } catch (_) {}
    }
  }

  // ─── Push (Queued & Real-Time) ──────────────────────────────
  let pushResolvers = [];
  function pushToCloud(data) {
    const cleanData = _sanitize(data);

    if (bc) {
      try {
        bc.postMessage({
          type: 'DATA_UPDATED',
          data: cleanData
        });
      } catch (_) {}
    }

    if (!syncKey) return Promise.resolve({ ok: false, reason: 'no-key' });

    pendingPushData = cleanData;
    clearTimeout(pushDebounceId);

    return new Promise(resolve => {
      pushResolvers.push(resolve);
      pushDebounceId = setTimeout(async () => {
        const res = await _executePush();
        const currentResolvers = pushResolvers;
        pushResolvers = [];
        currentResolvers.forEach(r => r(res));
      }, PUSH_DEBOUNCE_MS);
    });
  }

  async function _executePush() {
    if (isPushing) return { ok: false, reason: 'queued' };
    if (!pendingPushData) return { ok: true };

    const dataToSend = pendingPushData;
    pendingPushData = null;

    isPushing = true;
    syncStatus = 'syncing';
    updateUIStatus();

    const payload = JSON.stringify(dataToSend);
    let ok = false;
    let serverUpdatedAt = null;

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(`${SYNC_API}/${encodeURIComponent(syncKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: payload,
        signal: ctrl.signal
      });
      clearTimeout(tid);

      if (res.ok) {
        ok = true;
        const json = await res.json();
        serverUpdatedAt = json.updatedAt;
      }
    } catch (_) {
      ok = false;
    }

    isPushing = false;

    if (ok) {
      lastSyncTime = Date.now();
      localStorage.setItem('sd-last-sync-time', String(lastSyncTime));
      syncStatus = 'synced';
    } else {
      syncStatus = 'error';
    }
    updateUIStatus();

    if (pendingPushData) {
      _executePush();
    }

    return { ok, updatedAt: serverUpdatedAt };
  }

  // ─── Pull (Polling & Manual Sync) ───────────────────────────
  async function pullFromCloud(isBackground = false) {
    if (!syncKey) return { ok: false, reason: 'no-key' };
    if (isPulling) return { ok: false, reason: 'busy' };

    isPulling = true;
    if (!isBackground) {
      syncStatus = 'syncing';
      updateUIStatus();
    }

    let result = { ok: false };

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`${SYNC_API}/${encodeURIComponent(syncKey)}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        signal: ctrl.signal
      });
      clearTimeout(tid);

      if (res.status === 200) {
        const cloudData = await res.json();
        lastSyncTime = Date.now();
        localStorage.setItem('sd-last-sync-time', String(lastSyncTime));
        syncStatus = 'synced';
        result = { ok: true, data: cloudData };
      } else if (res.status === 404) {
        syncStatus = 'synced';
        result = { ok: false, notFound: true };
      } else {
        syncStatus = 'error';
      }
    } catch (_) {
      syncStatus = 'error';
    }

    isPulling = false;
    updateUIStatus();
    return result;
  }

  // ─── Auto Sync (Real-Time Polling + Event Wakeup) ────────────
  function startAutoSync(onRemoteUpdate) {
    _onRemoteUpdate = onRemoteUpdate;

    if (bc) {
      bc.onmessage = (event) => {
        if (!event.data) return;
        if (event.data.type === 'DATA_UPDATED' && event.data.data) {
          if (typeof _onRemoteUpdate === 'function') {
            _onRemoteUpdate(event.data.data);
          }
        }
      };
    }

    // Check auth on boot
    checkAuth().then(user => {
      pullFromCloud(true).then(res => {
        if (res && res.ok && res.data && typeof _onRemoteUpdate === 'function') {
          _onRemoteUpdate(res.data);
        }
      });
    });

    // Smart polling
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (document.hidden || isPushing || !syncKey) return;
      const res = await pullFromCloud(true);
      if (res.ok && res.data && typeof _onRemoteUpdate === 'function') {
        _onRemoteUpdate(res.data);
      }
    }, POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && syncKey) {
        pullFromCloud(true).then(res => {
          if (res.ok && res.data && typeof _onRemoteUpdate === 'function') {
            _onRemoteUpdate(res.data);
          }
        });
      }
    });

    window.addEventListener('online', () => {
      if (syncKey) pullFromCloud(false);
    });
  }

  // ─── UI Status Updates ──────────────────────────────────────
  function updateUIStatus() {
    const btn = document.getElementById('cloud-sync-btn');
    const authBtn = document.getElementById('auth-user-btn');
    const modalBadge = document.getElementById('modal-sync-status');

    let displayUserText = currentUser ? (currentUser.role === 'admin' ? `👑 ${currentUser.displayName}` : `👤 ${currentUser.displayName}`) : '👤 บัญชีผู้ใช้';

    if (authBtn) {
      authBtn.innerHTML = displayUserText;
    }

    const states = {
      local:   { icon: '☁️', label: currentUser ? currentUser.displayName : 'Sync Key', tip: 'คลิกเพื่อตั้งค่า Cloud Sync', badge: '⚪ ข้อมูลในเครื่องนี้เท่านั้น' },
      syncing: { icon: '🔄', label: 'Syncing…', tip: 'กำลังซิงค์ข้อมูล…', badge: '🔄 กำลังซิงค์ข้อมูล…' },
      synced:  { icon: '☁️', label: currentUser ? currentUser.displayName : 'Synced', tip: `เชื่อมต่อ Cloud แล้ว (${currentUser ? currentUser.username : syncKey})`, badge: `✅ เชื่อมต่อ Cloud แล้ว (${currentUser ? 'บัญชี: ' + currentUser.displayName : 'Key: ' + syncKey})` },
      error:   { icon: '⚠️', label: 'Offline', tip: 'ออฟไลน์ชั่วคราว — จะซิงค์ใหม่อัตโนมัติเมื่อออนไลน์', badge: '⚠️ ออฟไลน์ (บันทึกลงเครื่องแล้ว)' },
    };

    const s = states[syncStatus] || states.local;
    if (btn) { btn.innerHTML = `${s.icon} ${s.label}`; btn.title = s.tip; }
    if (modalBadge) {
      modalBadge.textContent = s.badge;
      modalBadge.className   = syncStatus === 'synced' ? 'status-badge home' : syncStatus === 'syncing' ? 'status-badge dorm' : 'status-badge';
    }
  }

  function _sanitize(data) {
    return {
      version:      data.version      || 0,
      updatedAt:    data.updatedAt    || new Date().toISOString(),
      checklist:    data.checklist    || {},
      subjects:     data.subjects     || {},
      customBlocks: data.customBlocks || {},
      curriculum:   data.curriculum   || [],
      studyFolders: data.studyFolders || [],
      studyLinks:   data.studyLinks   || [],
      courseGrades: data.courseGrades || {}
    };
  }

  return {
    register,
    login,
    checkAuth,
    logout,
    getPublicHub,
    createShareBundle,
    fetchShareBundle,
    getCurrentUser,
    getSyncKey,
    setSyncKey,
    getLastSyncTime,
    getCalendarFeedUrl,
    pushToCloud,
    pullFromCloud,
    startAutoSync,
    updateUIStatus,
    setRememberMe,
    getRememberMe
  };
})();

window.CloudSync = CloudSync;
