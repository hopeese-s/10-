// ============================================================
// sync.js — Cloud Sync Module  (Key: "1")
// ============================================================

const CloudSync = (function () {
  'use strict';

  const API = 'https://daily-study-dashboard-production.up.railway.app/api/sync';
  const PUSH_DEBOUNCE_MS = 1200;   // batch rapid saves into one push
  const POLL_INTERVAL_MS = 8000;   // poll every 8s (was 2.5s — too aggressive)
  const PUSH_COOL_MS     = 3000;   // skip pull for 3s after we pushed (avoid echo)
  const TS_TOLERANCE_MS  = 500;    // treat timestamps within 500ms as equal

  let syncKey      = localStorage.getItem('sd-sync-key') || '1';
  let syncStatus   = syncKey ? 'synced' : 'local';
  let lastSyncTime = parseInt(localStorage.getItem('sd-last-sync-time') || '0', 10);

  let isPushing      = false;
  let isPulling      = false;
  let pushDebounceId = null;
  let lastPushAt     = 0;          // timestamp of last successful push
  let pollTimer      = null;
  let listenersAdded = false;      // guard: add DOM listeners only once

  let _onRemoteUpdate = null;

  // BroadcastChannel (same-device cross-tab, 0ms)
  let bc = null;
  try { if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel('egbe-sync'); } catch (_) {}

  // ─── Public API ─────────────────────────────────────────────
  function getSyncKey()     { return syncKey; }
  function getLastSyncTime(){ return lastSyncTime; }

  function setSyncKey(key) {
    syncKey = (key || '').trim();
    if (syncKey) { localStorage.setItem('sd-sync-key', syncKey); syncStatus = 'synced'; }
    else         { localStorage.removeItem('sd-sync-key');         syncStatus = 'local'; }
    updateUIStatus();
    if (bc) try { bc.postMessage({ type: 'KEY_CHANGED', syncKey }); } catch (_) {}
  }

  // ─── Push (debounced) ───────────────────────────────────────
  function pushToCloud(data) {
    // Broadcast to other tabs instantly (0ms)
    if (bc) {
      try {
        bc.postMessage({
          type: 'DATA_UPDATED',
          data: _sanitize(data)
        });
      } catch (_) {}
    }

    if (!syncKey) return Promise.resolve({ ok: false, reason: 'no-key' });

    // Debounce: cancel previous pending push and restart timer
    clearTimeout(pushDebounceId);
    return new Promise(resolve => {
      pushDebounceId = setTimeout(() => _doPush(data).then(resolve), PUSH_DEBOUNCE_MS);
    });
  }

  async function _doPush(data) {
    if (isPushing) return { ok: false, reason: 'busy' };
    isPushing = true;
    syncStatus = 'syncing';
    updateUIStatus();

    const payload = JSON.stringify(_sanitize(data));
    let ok = false;

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`${API}/${encodeURIComponent(syncKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: ctrl.signal
      });
      clearTimeout(tid);
      ok = res.ok;
    } catch (_) {}

    isPushing = false;

    if (ok) {
      lastPushAt   = Date.now();
      lastSyncTime = lastPushAt;
      localStorage.setItem('sd-last-sync-time', String(lastSyncTime));
      syncStatus = 'synced';
    } else {
      syncStatus = 'error';
    }
    updateUIStatus();
    return { ok };
  }

  // ─── Pull ───────────────────────────────────────────────────
  async function pullFromCloud(isBackground = false) {
    if (!syncKey) return { ok: false, reason: 'no-key' };
    if (isPulling) return { ok: false, reason: 'busy' };

    // Skip pull if we just pushed (avoid echo-loop)
    if (isBackground && (Date.now() - lastPushAt) < PUSH_COOL_MS) {
      return { ok: false, reason: 'just-pushed' };
    }

    isPulling = true;
    if (!isBackground) { syncStatus = 'syncing'; updateUIStatus(); }

    let foundData = null;
    let is404 = false;

    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`${API}/${encodeURIComponent(syncKey)}?t=${Date.now()}`, {
        signal: ctrl.signal
      });
      clearTimeout(tid);

      if (res.status === 404) { is404 = true; }
      else if (res.ok)        { foundData = await res.json(); }
    } catch (_) {}

    isPulling = false;

    if (foundData) {
      lastSyncTime = Date.now();
      localStorage.setItem('sd-last-sync-time', String(lastSyncTime));
      syncStatus = 'synced';
      updateUIStatus();
      return { ok: true, data: foundData };
    } else if (is404) {
      syncStatus = 'synced';
      updateUIStatus();
      return { ok: true, notFound: true, data: null };
    } else {
      if (!isBackground) { syncStatus = 'error'; updateUIStatus(); }
      return { ok: false, data: null };
    }
  }

  // ─── Auto Sync ──────────────────────────────────────────────
  function startAutoSync(onRemoteUpdate) {
    _onRemoteUpdate = onRemoteUpdate;

    // BroadcastChannel handler (other tabs on same device)
    if (bc) {
      bc.onmessage = (e) => {
        if (!e.data) return;
        if (e.data.type === 'DATA_UPDATED' && e.data.data && _onRemoteUpdate) {
          _onRemoteUpdate(e.data.data);
        } else if (e.data.type === 'KEY_CHANGED') {
          syncKey = e.data.syncKey;
          updateUIStatus();
        }
      };
    }

    // Register DOM listeners only once to prevent stacking
    if (!listenersAdded) {
      listenersAdded = true;

      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && syncKey) {
          const r = await pullFromCloud(true);
          if (r.ok && r.data && _onRemoteUpdate) _onRemoteUpdate(r.data);
        }
      });

      window.addEventListener('focus', async () => {
        if (syncKey) {
          const r = await pullFromCloud(true);
          if (r.ok && r.data && _onRemoteUpdate) _onRemoteUpdate(r.data);
        }
      });
    }

    // Background poll
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!syncKey || document.visibilityState !== 'visible' || isPushing) return;
      const r = await pullFromCloud(true);
      if (r.ok && r.data && _onRemoteUpdate) _onRemoteUpdate(r.data);
    }, POLL_INTERVAL_MS);
  }

  // ─── UI ─────────────────────────────────────────────────────
  function updateUIStatus() {
    const btn        = document.getElementById('cloud-sync-btn');
    const modalBadge = document.getElementById('modal-sync-status');
    const timeEl     = document.getElementById('modal-sync-time');

    if (timeEl && lastSyncTime > 0) {
      const d = new Date(lastSyncTime);
      timeEl.textContent = `ซิงค์ล่าสุด: ${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())} น.`;
    }

    const states = {
      local:   { icon: '☁️', label: 'Sync Key',   tip: 'คลิกเพื่อตั้งค่า Sync Key',             badge: '⚪ ข้อมูลในเครื่องนี้เท่านั้น' },
      syncing: { icon: '🔄', label: 'Syncing…',   tip: 'กำลังซิงค์…',                           badge: '🔄 กำลังซิงค์…' },
      synced:  { icon: '☁️', label: 'Synced',     tip: `เชื่อมต่อแล้ว (Key: ${syncKey})`,      badge: `✅ เชื่อมต่อแล้ว (Key: ${syncKey})` },
      error:   { icon: '⚠️', label: 'Offline',    tip: 'ออฟไลน์ชั่วคราว — จะซิงค์ใหม่อัตโนมัติ', badge: '⚠️ ออฟไลน์ (บันทึกลงเครื่องแล้ว)' },
    };

    const s = states[syncStatus] || states.local;
    if (btn) { btn.innerHTML = `${s.icon} ${s.label}`; btn.title = s.tip; }
    if (modalBadge) {
      modalBadge.textContent = s.badge;
      modalBadge.className   = syncStatus === 'synced' ? 'status-badge home' : syncStatus === 'syncing' ? 'status-badge dorm' : 'status-badge';
    }
  }

  // ─── Helpers ────────────────────────────────────────────────
  function _sanitize(data) {
    return {
      checklist:    data.checklist    || {},
      subjects:     data.subjects     || {},
      customBlocks: data.customBlocks || {},
      studyFolders: data.studyFolders || [],
      studyLinks:   data.studyLinks   || [],
      updatedAt:    data.updatedAt    || new Date().toISOString()
    };
  }

  function _pad(n) { return String(n).padStart(2, '0'); }

  return { getSyncKey, setSyncKey, getLastSyncTime, pushToCloud, pullFromCloud, startAutoSync, updateUIStatus };
})();
