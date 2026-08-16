// ============================================================
// sync.js — Real-Time Cloud Sync Module (Passcode / Sync Key)
// Ultra Fast Real-Time Sync: Cached Active Endpoints, BroadcastChannel,
// Push Queuing, Fast Polling & Instant Refresh
// ============================================================

const CloudSync = (function() {
  'use strict';

  // BroadcastChannel for instant 0ms cross-tab sync on same device
  let syncChannel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      syncChannel = new BroadcastChannel('egbe-realtime-sync');
    }
  } catch (e) {}

  let syncKey = localStorage.getItem('sd-sync-key') || '';
  let syncStatus = syncKey ? 'synced' : 'local'; // 'local' | 'synced' | 'syncing' | 'error'
  let autoSyncTimer = null;
  let lastSyncTime = parseInt(localStorage.getItem('sd-last-sync-time') || '0', 10);
  
  let isPushing = false;
  let hasPendingPush = false;
  let pendingData = null;
  let cachedWorkingBaseUrl = null;
  let isPulling = false;

  function getSyncKey() { return syncKey; }
  function getLastSyncTime() { return lastSyncTime; }

  function setSyncKey(key) {
    syncKey = (key || '').trim();
    cachedWorkingBaseUrl = null; // reset cache on key change
    if (syncKey) {
      localStorage.setItem('sd-sync-key', syncKey);
      syncStatus = 'synced';
    } else {
      localStorage.removeItem('sd-sync-key');
      syncStatus = 'local';
    }
    updateUIStatus();

    // Broadcast key change to other tabs
    if (syncChannel) {
      syncChannel.postMessage({ type: 'SYNC_KEY_CHANGED', syncKey });
    }
  }

  // Get candidate URLs for current sync key
  function getCandidateBaseUrls() {
    const urls = [];
    if (cachedWorkingBaseUrl) {
      urls.push(cachedWorkingBaseUrl);
    }
    if (window.location.protocol.startsWith('http')) {
      const originUrl = `${window.location.origin}/api/sync`;
      if (!urls.includes(originUrl)) urls.push(originUrl);
    }
    const local1 = 'http://localhost:3000/api/sync';
    const local2 = 'http://127.0.0.1:3000/api/sync';
    const cloud1 = 'https://daily-study-dashboard-production.up.railway.app/api/sync';

    if (!urls.includes(local1)) urls.push(local1);
    if (!urls.includes(local2)) urls.push(local2);
    if (!urls.includes(cloud1)) urls.push(cloud1);

    return urls;
  }

  // Push local state to Cloud with Queuing & Immediate Tab Broadcast
  async function pushToCloud(data) {
    // 1. Broadcast locally to all other tabs on this device immediately (0ms)
    if (syncChannel) {
      try {
        syncChannel.postMessage({
          type: 'REMOTE_DATA_UPDATED',
          data: {
            checklist: data.checklist || {},
            subjects: data.subjects || {},
            customBlocks: data.customBlocks || {},
            studyLinks: data.studyLinks || [],
            updatedAt: new Date().toISOString()
          }
        });
      } catch (e) {}
    }

    if (!syncKey) return { ok: false, reason: 'no-key' };

    // Queue push if already in progress
    if (isPushing) {
      hasPendingPush = true;
      pendingData = data;
      return { ok: true, queued: true };
    }

    isPushing = true;
    syncStatus = 'syncing';
    updateUIStatus();

    const payload = JSON.stringify({
      checklist: data.checklist || {},
      subjects: data.subjects || {},
      customBlocks: data.customBlocks || {},
      studyLinks: data.studyLinks || [],
      updatedAt: new Date().toISOString()
    });

    const candidateUrls = getCandidateBaseUrls();
    let success = false;
    let lastError = null;

    for (const baseUrl of candidateUrls) {
      try {
        const targetUrl = `${baseUrl}/${encodeURIComponent(syncKey)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          success = true;
          cachedWorkingBaseUrl = baseUrl;
          lastSyncTime = Date.now();
          localStorage.setItem('sd-last-sync-time', String(lastSyncTime));
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    isPushing = false;

    if (success) {
      syncStatus = 'synced';
      updateUIStatus();
    } else {
      syncStatus = 'error';
      updateUIStatus();
    }

    // Process queued push if another modification occurred while pushing
    if (hasPendingPush && pendingData) {
      hasPendingPush = false;
      const nextData = pendingData;
      pendingData = null;
      return pushToCloud(nextData);
    }

    return success ? { ok: true } : { ok: false, error: lastError };
  }

  // Pull data from Cloud with Active Endpoint Caching
  async function pullFromCloud(isBackground = false) {
    if (!syncKey) return { ok: false, reason: 'no-key' };
    if (isPulling) return { ok: false, reason: 'pull-in-progress' };

    if (!isBackground) {
      syncStatus = 'syncing';
      updateUIStatus();
    }
    isPulling = true;

    const candidateUrls = getCandidateBaseUrls();
    let foundData = null;
    let is404 = false;
    let lastError = null;

    for (const baseUrl of candidateUrls) {
      try {
        const targetUrl = `${baseUrl}/${encodeURIComponent(syncKey)}?t=${Date.now()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(targetUrl, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.status === 404) {
          is404 = true;
          cachedWorkingBaseUrl = baseUrl;
          break;
        }

        if (res.ok) {
          foundData = await res.json();
          cachedWorkingBaseUrl = baseUrl;
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    isPulling = false;

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
      btn.title = 'กำลังซิงค์ข้อมูลกับ Cloud...';
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
      btn.title = 'เชื่อมต่อแบบออฟไลน์ชั่วคราว (จะซิงค์ใหม่อัตโนมัติเมื่อออนไลน์)';
      if (modalBadge) {
        modalBadge.className = 'status-badge';
        modalBadge.style.background = 'rgba(239,68,68,0.12)';
        modalBadge.style.color = '#dc2626';
        modalBadge.textContent = '⚠️ ออฟไลน์ (บันทึกข้อมูลลงเครื่องนี้เรียบร้อย)';
      }
    }
  }

  // Fast Real-Time Auto Sync (2.5s Polling + Visibility + Focus + BroadcastChannel)
  function startAutoSync(onRemoteUpdate) {
    if (autoSyncTimer) clearInterval(autoSyncTimer);

    // 1. Listen for instant local updates across tabs (0ms)
    if (syncChannel) {
      syncChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'REMOTE_DATA_UPDATED' && event.data.data) {
          if (onRemoteUpdate) onRemoteUpdate(event.data.data);
        } else if (event.data && event.data.type === 'SYNC_KEY_CHANGED') {
          syncKey = event.data.syncKey;
          updateUIStatus();
        }
      };
    }

    // 2. Poll every 2.5 seconds if tab is visible
    autoSyncTimer = setInterval(async () => {
      if (syncKey && document.visibilityState === 'visible' && !isPushing) {
        const result = await pullFromCloud(true);
        if (result.ok && result.data && onRemoteUpdate) {
          onRemoteUpdate(result.data);
        }
      }
    }, 2500);

    // 3. Instant pull when user switches to tab or focuses window
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && syncKey) {
        const result = await pullFromCloud(true);
        if (result.ok && result.data && onRemoteUpdate) {
          onRemoteUpdate(result.data);
        }
      }
    });

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
