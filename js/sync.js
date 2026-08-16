// ============================================================
// sync.js — Real-Time Cloud Sync Module (Passcode / Sync Key)
// Multi-Tier Sync: Local Server, Production Cloud Backend, & Offline Fallback
// ============================================================

const CloudSync = (function() {
  'use strict';

  // Primary API endpoints to try
  function getApiEndpoints(key) {
    const encodedKey = encodeURIComponent(key.trim());
    const endpoints = [];

    // 1. Current Origin if served over HTTP/HTTPS
    if (window.location.protocol.startsWith('http')) {
      endpoints.push(`${window.location.origin}/api/sync/${encodedKey}`);
    }

    // 2. Local Node dev server
    endpoints.push(`http://localhost:3000/api/sync/${encodedKey}`);
    endpoints.push(`http://127.0.0.1:3000/api/sync/${encodedKey}`);

    // 3. Fallback Cloud Production Gateway (Railway / Public Backend)
    endpoints.push(`https://daily-study-dashboard-production.up.railway.app/api/sync/${encodedKey}`);

    return endpoints;
  }

  let syncKey = localStorage.getItem('sd-sync-key') || '';
  let syncStatus = syncKey ? 'synced' : 'local'; // 'local' | 'synced' | 'syncing' | 'error'
  let autoSyncTimer = null;
  let lastSyncTime = parseInt(localStorage.getItem('sd-last-sync-time') || '0', 10);
  let isSyncing = false;

  function getSyncKey() { return syncKey; }
  function getLastSyncTime() { return lastSyncTime; }

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
  }

  // Push local state to Cloud
  async function pushToCloud(data) {
    if (!syncKey || isSyncing) return { ok: false, reason: 'no-key-or-busy' };
    syncStatus = 'syncing';
    isSyncing = true;
    updateUIStatus();

    const payload = JSON.stringify({
      checklist: data.checklist || {},
      subjects: data.subjects || {},
      customBlocks: data.customBlocks || {},
      studyLinks: data.studyLinks || [],
      updatedAt: new Date().toISOString()
    });

    const endpoints = getApiEndpoints(syncKey);
    let success = false;
    let lastError = null;

    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          success = true;
          syncStatus = 'synced';
          lastSyncTime = Date.now();
          localStorage.setItem('sd-last-sync-time', String(lastSyncTime));
          break;
        }
      } catch (err) {
        lastError = err;
        // Continue trying fallback endpoint
      }
    }

    isSyncing = false;
    if (success) {
      syncStatus = 'synced';
      updateUIStatus();
      return { ok: true };
    } else {
      syncStatus = 'error';
      updateUIStatus();
      return { ok: false, error: lastError };
    }
  }

  // Pull data from Cloud
  async function pullFromCloud(isBackground = false) {
    if (!syncKey) return { ok: false, reason: 'no-key' };
    if (isSyncing) return { ok: false, reason: 'busy' };

    if (!isBackground) {
      syncStatus = 'syncing';
      updateUIStatus();
    }
    isSyncing = true;

    const endpoints = getApiEndpoints(syncKey);
    let foundData = null;
    let is404 = false;
    let lastError = null;

    for (const baseUrl of endpoints) {
      try {
        const url = `${baseUrl}?t=${Date.now()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.status === 404) {
          is404 = true;
          break;
        }

        if (res.ok) {
          foundData = await res.json();
          break;
        }
      } catch (err) {
        lastError = err;
        // Continue trying fallback endpoint
      }
    }

    isSyncing = false;

    if (foundData) {
      syncStatus = 'synced';
      lastSyncTime = Date.now();
      localStorage.setItem('sd-last-sync-time', String(lastSyncTime));
      updateUIStatus();
      return { ok: true, data: foundData };
    } else if (is404) {
      syncStatus = 'synced';
      updateUIStatus();
      return { ok: true, notFound: true, data: null };
    } else {
      syncStatus = 'error';
      updateUIStatus();
      return { ok: false, error: lastError, data: null };
    }
  }

  function updateUIStatus() {
    const btn = document.getElementById('cloud-sync-btn');
    const modalBadge = document.getElementById('modal-sync-status');
    const timeDisplay = document.getElementById('modal-sync-time');

    if (timeDisplay && lastSyncTime > 0) {
      const d = new Date(lastSyncTime);
      timeDisplay.textContent = `ซิงค์ล่าสุด: ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')} น.`;
    }

    if (!btn) return;

    if (!syncKey) {
      btn.innerHTML = '☁️ Sync Key';
      btn.title = 'คลิกเพื่อตั้งค่า Sync Key (ซิงค์ข้ามเครื่อง)';
      if (modalBadge) {
        modalBadge.className = 'status-badge';
        modalBadge.textContent = '⚪ ข้อมูลเก็บในเครื่องนี้เท่านั้น (ยังไม่ได้เชื่อมต่อ Cloud)';
      }
    } else if (syncStatus === 'syncing') {
      btn.innerHTML = '🔄 Syncing...';
      btn.title = 'กำลังส่งข้อมูลไปยัง Cloud...';
      if (modalBadge) {
        modalBadge.className = 'status-badge dorm';
        modalBadge.textContent = '🔄 กำลังซิงค์ข้อมูลกับ Cloud...';
      }
    } else if (syncStatus === 'synced') {
      btn.innerHTML = '☁️ Synced';
      btn.title = `เชื่อมต่อแล้ว (Key: ${syncKey}) · คลิกเพื่อซิงค์ทันที`;
      if (modalBadge) {
        modalBadge.className = 'status-badge home';
        modalBadge.textContent = `✅ เชื่อมต่อแล้ว (Key: ${syncKey})`;
      }
    } else if (syncStatus === 'error') {
      btn.innerHTML = '⚠️ Offline';
      btn.title = 'ไม่สามารถเชื่อมต่อ Cloud ได้ชั่วคราว (จะซิงค์ใหม่อัตโนมัติเมื่อออนไลน์)';
      if (modalBadge) {
        modalBadge.className = 'status-badge';
        modalBadge.style.background = 'rgba(239,68,68,0.12)';
        modalBadge.style.color = '#dc2626';
        modalBadge.textContent = '⚠️ ออฟไลน์ (บันทึกข้อมูลลงเครื่องนี้เรียบร้อย)';
      }
    }
  }

  function startAutoSync(onRemoteUpdate) {
    if (autoSyncTimer) clearInterval(autoSyncTimer);

    // Poll every 8 seconds silently if syncKey is set
    autoSyncTimer = setInterval(async () => {
      if (syncKey && document.visibilityState === 'visible') {
        const result = await pullFromCloud(true);
        if (result.ok && result.data && onRemoteUpdate) {
          onRemoteUpdate(result.data);
        }
      }
    }, 8000);

    // Pull when window gets focused
    window.addEventListener('focus', async () => {
      if (syncKey) {
        const result = await pullFromCloud(true);
        if (result.ok && result.data && onRemoteUpdate) {
          onRemoteUpdate(result.data);
        }
      }
    });
  }

  return {
    getSyncKey,
    setSyncKey,
    getLastSyncTime,
    pushToCloud,
    pullFromCloud,
    startAutoSync,
    updateUIStatus
  };
})();
