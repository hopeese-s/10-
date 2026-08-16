// ============================================================
// sync.js — Real-Time Cloud Sync Module (Passcode / Sync Key)
// Uses KV storage REST API with local fallback
// ============================================================

const CloudSync = (function() {
  'use strict';

  // Free high-availability public KV endpoint for seamless sync
  const API_ENDPOINT = 'https://kvdb.io/4y9nQeN8zS8yK7hP5kZ2wQ'; 

  let syncKey = localStorage.getItem('sd-sync-key') || '';
  let syncStatus = 'local'; // 'local' | 'synced' | 'syncing' | 'error'
  let autoSyncTimer = null;

  function getSyncKey() { return syncKey; }

  function setSyncKey(key) {
    syncKey = key.trim();
    if (syncKey) {
      localStorage.setItem('sd-sync-key', syncKey);
    } else {
      localStorage.removeItem('sd-sync-key');
    }
    updateUIStatus();
  }

  // Push local state to Cloud
  async function pushToCloud(data) {
    if (!syncKey) return false;
    syncStatus = 'syncing';
    updateUIStatus();

    try {
      const payload = JSON.stringify({
        checklist: data.checklist || {},
        subjects: data.subjects || {},
        customBlocks: data.customBlocks || {},
        updatedAt: new Date().toISOString()
      });

      const res = await fetch(`${API_ENDPOINT}/${encodeURIComponent(syncKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      if (res.ok) {
        syncStatus = 'synced';
        updateUIStatus();
        return true;
      } else {
        syncStatus = 'error';
        updateUIStatus();
        return false;
      }
    } catch (err) {
      console.warn('CloudSync Push Error:', err);
      syncStatus = 'error';
      updateUIStatus();
      return false;
    }
  }

  // Pull data from Cloud
  async function pullFromCloud() {
    if (!syncKey) return null;
    syncStatus = 'syncing';
    updateUIStatus();

    try {
      const res = await fetch(`${API_ENDPOINT}/${encodeURIComponent(syncKey)}?t=${Date.now()}`);
      if (res.status === 404) {
        // Key doesn't exist yet on cloud, create it
        syncStatus = 'synced';
        updateUIStatus();
        return null;
      }
      if (!res.ok) throw new Error('Fetch failed');

      const cloudData = await res.json();
      syncStatus = 'synced';
      updateUIStatus();
      return cloudData;
    } catch (err) {
      console.warn('CloudSync Pull Error:', err);
      syncStatus = 'error';
      updateUIStatus();
      return null;
    }
  }

  function updateUIStatus() {
    const btn = document.getElementById('cloud-sync-btn');
    const badge = document.getElementById('cloud-sync-badge');
    const modalBadge = document.getElementById('modal-sync-status');

    if (!btn) return;

    if (!syncKey) {
      btn.innerHTML = '☁️ Off';
      btn.title = 'ไม่ได้เชื่อมต่อ Cloud (ใช้งานแบบ Local)';
      if (modalBadge) modalBadge.className = 'status-badge'; modalBadge.textContent = '⚪ ข้อมูลเก็บในเครื่องนี้เท่านั้น';
    } else if (syncStatus === 'syncing') {
      btn.innerHTML = '🔄 Sync...';
      if (modalBadge) modalBadge.className = 'status-badge dorm'; modalBadge.textContent = '🔄 กำลังซิงค์ข้อมูล...';
    } else if (syncStatus === 'synced') {
      btn.innerHTML = '☁️ Synced';
      btn.title = `เชื่อมต่อแล้ว (Key: ${syncKey})`;
      if (modalBadge) modalBadge.className = 'status-badge home'; modalBadge.textContent = `✅ เชื่อมต่อแล้ว (Key: ${syncKey})`;
    } else if (syncStatus === 'error') {
      btn.innerHTML = '⚠️ Offline';
      btn.title = 'เชื่อมต่อแบบออฟไลน์ (จะซิงค์ใหม่อัตโนมัติเมื่อออนไลน์)';
      if (modalBadge) modalBadge.className = 'status-badge'; modalBadge.textContent = '⚠️ ออฟไลน์ (บันทึกลงเครื่องชั่วคราว)';
    }
  }

  function startAutoSync(onRemoteUpdate) {
    if (autoSyncTimer) clearInterval(autoSyncTimer);

    // Poll every 10 seconds if syncKey is set
    autoSyncTimer = setInterval(async () => {
      if (syncKey && document.visibilityState === 'visible') {
        const cloudData = await pullFromCloud();
        if (cloudData && onRemoteUpdate) {
          onRemoteUpdate(cloudData);
        }
      }
    }, 10000);

    // Pull when tab gets focus
    window.addEventListener('focus', async () => {
      if (syncKey) {
        const cloudData = await pullFromCloud();
        if (cloudData && onRemoteUpdate) {
          onRemoteUpdate(cloudData);
        }
      }
    });
  }

  return {
    getSyncKey,
    setSyncKey,
    pushToCloud,
    pullFromCloud,
    startAutoSync,
    updateUIStatus
  };
})();
