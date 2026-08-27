// ============================================================
// server.js — Multi-User Auth, Live iCalendar Feed & Sync API
// Daily Routine & Study Dashboard for BME Mahidol 2026
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'sync_store.json');
const DB_BACKUP_FILE = path.join(__dirname, 'sync_store.backup.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_BODY_SIZE = 25 * 1024 * 1024; // 25MB limit

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT) || Boolean(process.env.RENDER);
const STRICT_CLOUD_MODE = process.env.STRICT_CLOUD_MODE === 'true';
const APP_BASE_URL = (process.env.APP_BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://e-calen.up.railway.app')).replace(/\/$/, '');
let activeOmniLoadUrl = (process.env.OMNILOAD_API_URL || (IS_PRODUCTION ? 'http://12.railway.internal:8000' : 'http://127.0.0.1:8000')).replace(/\/$/, '');

async function probeOmniLoadUrl() {
  const candidates = [
    process.env.OMNILOAD_API_URL,
    activeOmniLoadUrl,
    'http://12.railway.internal:8000',
    'http://12.railway.internal:8080',
    'http://omniload.railway.internal:8000',
    'http://omniload.railway.internal:8080',
    'http://127.0.0.1:8000',
    'http://localhost:8000'
  ].filter(Boolean).map(u => u.replace(/\/$/, ''));

  const unique = Array.from(new Set(candidates));
  for (const targetUrl of unique) {
    try {
      const r = await fetch(`${targetUrl}/api/system-status`, { signal: AbortSignal.timeout(2500) });
      if (r.ok) {
        const data = await r.json();
        activeOmniLoadUrl = targetUrl;
        return { connected: true, url: targetUrl, data };
      }
    } catch (_) {}
  }
  return { connected: false, url: activeOmniLoadUrl, data: null };
}

// ─── Cloudflare R2 S3 Storage Adapter ─────────────────────────
let r2Client = null;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN || '';
const hasR2 = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);

if (hasR2) {
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
    });
    console.log('✅ Cloudflare R2 Storage Adapter connected (Bucket: ' + R2_BUCKET_NAME + ')');
  } catch (e) {
    console.error('❌ Cloudflare R2 initialization error:', e.message);
  }
}

// ─── Supabase PostgreSQL Database Adapter ─────────────────────
let supabase = null;
let rawSupaUrl = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/['"]/g, '').trim() : '';
if (rawSupaUrl.includes('/rest/v1')) {
  rawSupaUrl = rawSupaUrl.split('/rest/v1')[0];
}
const SUPABASE_URL = rawSupaUrl.replace(/\/$/, '') || null;
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').replace(/['"]/g, '').trim();
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

if (hasSupabase) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase PostgreSQL Database Adapter connected (' + SUPABASE_URL + ')');
  } catch (e) {
    console.error('❌ Supabase initialization error:', e.message);
  }
}

// ─── Production Fail-Loudly Warnings ──────────────────────────
if (IS_PRODUCTION && (!hasR2 || !hasSupabase)) {
  console.error('\n' + '='.repeat(72));
  console.error('🚨 [CRITICAL CONFIG WARNING] RUNNING ON EPHEMERAL HOSTING WITHOUT CLOUD!');
  console.error('='.repeat(72));
  if (!hasR2) {
    console.error('❌ Cloudflare R2: NOT CONFIGURED');
    console.error('   -> Uploaded files stored in /uploads/ will be WIPED on every container redeploy!');
  }
  if (!hasSupabase) {
    console.error('❌ Supabase PostgreSQL: NOT CONFIGURED');
    console.error('   -> User accounts and sync data stored in sync_store.json will be WIPED on redeploy!');
  }
  console.error('💡 Solution: Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and R2_* in Railway Variables.');
  console.error('='.repeat(72) + '\n');

  if (STRICT_CLOUD_MODE) {
    console.error('🛑 STRICT_CLOUD_MODE is ON. Halting startup to prevent data loss.');
    process.exit(1);
  }
}

// ─── Web Push Notifications VAPID Setup ───────────────────────
let webpush = null;
try {
  webpush = require('web-push');
} catch (_) {}

// ─── LINE Messaging API & LIFF Setup ─────────────────────────
const LINE_CHANNEL_ACCESS_TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').replace(/['"]/g, '').trim();
const LINE_CHANNEL_SECRET = (process.env.LINE_CHANNEL_SECRET || '').replace(/['"]/g, '').trim();
const LINE_LIFF_ID = (process.env.LINE_LIFF_ID || '').replace(/['"]/g, '').trim();
const hasLine = Boolean(LINE_CHANNEL_ACCESS_TOKEN && LINE_CHANNEL_SECRET);

if (hasLine) {
  console.log('✅ LINE Messaging API configured for Push & Webhook');
} else {
  console.log('ℹ️ LINE Messaging API not configured (LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET missing)');
}

// ─── Google Gemini AI Client Setup ────────────────────────────
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').replace(/['"]/g, '').trim();
const hasGemini = Boolean(GEMINI_API_KEY);
if (hasGemini) {
  console.log('✨ Google Gemini AI configured for Multimodal Vision, Audio & Smart NLP');
} else {
  console.log('ℹ️ Gemini API key not set (Natural Language fallback NLP will be used)');
}

// In-memory store + file persistence
let store = {
  _users: {},             // { [username]: { id, username, displayName, passwordHash, salt, calendarKey, role, createdAt } }
  _sessions: {},          // { [token]: { userId, username, role, expiresAt } }
  _calKeys: {},           // { [calendarKey]: userId }
  _shares: {},            // { [shareToken]: { title, resources, folders, createdAt } }
  _pushSubscriptions: {}, // { [userId]: [subscriptionObjects] }
  _lineUsers: {},         // { [lineUserId]: userId }
  _userLine: {},          // { [userId]: lineUserId }
  _vapid: null
};

try {
  if (fs.existsSync(DB_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    store = {
      _users: loaded._users || {},
      _sessions: loaded._sessions || {},
      _calKeys: loaded._calKeys || {},
      _shares: loaded._shares || {},
      _pushSubscriptions: loaded._pushSubscriptions || {},
      _lineUsers: loaded._lineUsers || {},
      _userLine: loaded._userLine || {},
      _vapid: loaded._vapid || null,
      ...loaded
    };
    // Ensure index mapping for calKeys
    Object.values(store._users).forEach(u => {
      if (u && u.calendarKey && u.id) {
        store._calKeys[u.calendarKey] = u.id;
      }
    });
  }
} catch (e) {
  console.error('Error loading DB file:', e);
}

// Ensure VAPID keys are initialized
let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || ''
};

function configureWebPush() {
  if (webpush && vapidKeys && vapidKeys.publicKey && vapidKeys.privateKey) {
    try {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@e-calendar.app',
        vapidKeys.publicKey,
        vapidKeys.privateKey
      );
      console.log('✅ Web Push Notification Service active (Key: ' + vapidKeys.publicKey.substring(0, 10) + '...)');
    } catch (e) {
      console.warn('⚠️ Web Push configuration failed:', e.message);
    }
  }
}

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  if (store._vapid && store._vapid.publicKey && store._vapid.privateKey) {
    vapidKeys = store._vapid;
  } else if (webpush) {
    vapidKeys = webpush.generateVAPIDKeys();
    store._vapid = vapidKeys;
    try { fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2)); } catch (_) {}
  }
}

configureWebPush();

// Async save to avoid blocking
let saveQueue = Promise.resolve();
function saveStore() {
  saveQueue = saveQueue.then(() => {
    return new Promise((resolve) => {
      try {
        if (fs.existsSync(DB_FILE)) {
          try { fs.copyFileSync(DB_FILE, DB_BACKUP_FILE); } catch (_) {}
        }
        fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
        if (typeof dbAdapter !== 'undefined' && dbAdapter.saveSystemAuth) {
          dbAdapter.saveSystemAuth();
        }
      } catch (e) {
        console.error('Error saving DB file:', e);
        try { fs.writeFileSync(DB_BACKUP_FILE, JSON.stringify(store, null, 2)); } catch (_) {}
      }
      resolve();
    });
  });
}

// ─── Unified Database Adapter (Supabase PostgreSQL + In-Memory Fallback) ───
const dbAdapter = {
  async getUserData(userId) {
    if (!userId) return null;
    const uid = String(userId).trim();
    const altUid = uid.startsWith('u_') ? uid.substring(2) : `u_${uid}`;
    const isTest4 = uid === 'u_test4' || uid === 'test4' || altUid === 'u_test4' || altUid === 'test4';

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('user_sync_data')
          .select('*')
          .in('user_id', [uid, altUid])
          .order('updated_at', { ascending: false })
          .limit(1);
        if (!error && data && data.length > 0 && data[0].data) {
          const res = {
            ...data[0].data,
            version: data[0].version || data[0].data.version || 0,
            updatedAt: data[0].updated_at || data[0].data.updatedAt || new Date().toISOString()
          };
          if (isTest4 && (!res.curriculum || !Array.isArray(res.curriculum) || res.curriculum.length === 0)) {
            res.curriculum = typeof TEST4_CURRICULUM !== 'undefined' ? TEST4_CURRICULUM : [];
            res.isBme = false;
          }
          return res;
        }
      } catch (err) {
        console.warn('⚠️ Supabase getUserData error:', err.message);
      }
    }

    const localData = store[uid] || store[altUid] || null;
    if (isTest4) {
      if (!localData || !localData.curriculum || !Array.isArray(localData.curriculum) || localData.curriculum.length === 0) {
        const t4Data = {
          version: 2,
          updatedAt: new Date().toISOString(),
          isBme: false,
          checklist: {},
          subjects: {},
          customBlocks: {},
          curriculum: typeof TEST4_CURRICULUM !== 'undefined' ? TEST4_CURRICULUM : [],
          studyFolders: [],
          studyLinks: [],
          files: {}
        };
        store[uid] = t4Data;
        store[altUid] = t4Data;
        return t4Data;
      }
    }
    return localData;
  },

  async saveUserData(userId, payload) {
    if (!userId) return;
    const uid = String(userId).trim();
    const altUid = uid.startsWith('u_') ? uid.substring(2) : `u_${uid}`;

    // 1. In-memory & local store update for both keys
    store[uid] = payload;
    store[altUid] = payload;
    saveStore();

    // 2. Persistent Supabase PostgreSQL write
    if (supabase) {
      const record = {
        user_id: uid,
        data: payload,
        version: parseInt(payload.version, 10) || 0,
        updated_at: payload.updatedAt || new Date().toISOString()
      };

      try {
        let { error: upsertErr } = await supabase
          .from('user_sync_data')
          .upsert(record, { onConflict: 'user_id' });

        // If it failed because columns don't exist, try minimal record
        if (upsertErr && upsertErr.message && upsertErr.message.includes('column')) {
          delete record.version;
          delete record.updated_at;
          const retry = await supabase.from('user_sync_data').upsert(record, { onConflict: 'user_id' });
          upsertErr = retry.error;
        }

        if (upsertErr) {
          console.warn(`⚠️ Supabase saveUserData upsert notice for [${uid}]:`, upsertErr.message);
          await supabase.from('user_sync_data').delete().eq('user_id', uid);
          await supabase.from('user_sync_data').insert(record);
        }
      } catch (err) {
        console.error(`❌ Supabase saveUserData exception for [${uid}]:`, err.message);
      }
    }
  },

  async savePushSubscription(userId, subscription) {
    if (!store._pushSubscriptions) store._pushSubscriptions = {};
    if (!store._pushSubscriptions[userId]) store._pushSubscriptions[userId] = [];
    const endpoint = subscription.endpoint;

    // Remove this endpoint from all users to prevent duplicate stale associations
    Object.keys(store._pushSubscriptions).forEach(uid => {
      store._pushSubscriptions[uid] = (store._pushSubscriptions[uid] || []).filter(s => s && s.endpoint !== endpoint);
    });

    if (!store._pushSubscriptions[userId]) store._pushSubscriptions[userId] = [];
    store._pushSubscriptions[userId].push(subscription);
    saveStore();

    // 1. Permanently backup to Supabase user_sync_data under __system_auth__
    await this.saveSystemAuth();

    // 2. Persist to Supabase push_subscriptions table
    if (supabase) {
      try {
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
        const pushRecord = {
          user_id: String(userId),
          endpoint: endpoint,
          subscription_data: subscription,
          created_at: new Date().toISOString()
        };
        const { error: insErr } = await supabase.from('push_subscriptions').insert(pushRecord);
        if (insErr && insErr.message && insErr.message.includes('column')) {
          delete pushRecord.created_at;
          await supabase.from('push_subscriptions').insert(pushRecord);
        }
      } catch (err) {
        console.warn('⚠️ Supabase savePushSubscription error:', err.message);
      }
    }
    console.log(`📱 Push subscription saved for user [${userId}], total on this user: ${store._pushSubscriptions[userId].length}`);
  },

  async getPushSubscriptions(userId) {
    const subsMap = new Map();

    // 1. Fetch from Supabase push_subscriptions table
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('subscription_data')
          .eq('user_id', String(userId));
        if (!error && data && data.length > 0) {
          data.forEach(r => {
            if (r && r.subscription_data && r.subscription_data.endpoint) {
              subsMap.set(r.subscription_data.endpoint, r.subscription_data);
            }
          });
        }
      } catch (err) {
        console.warn('⚠️ Supabase getPushSubscriptions error:', err.message);
      }
    }

    // 2. Fetch from store._pushSubscriptions (loaded from __system_auth__)
    const memSubs = (store._pushSubscriptions && store._pushSubscriptions[userId]) || [];
    memSubs.forEach(s => {
      if (s && s.endpoint) {
        subsMap.set(s.endpoint, s);
      }
    });

    // 3. Fallback: If only 1 user exists or for admin, also check default '1'
    if (subsMap.size === 0 && userId !== '1') {
      const defSubs = (store._pushSubscriptions && store._pushSubscriptions['1']) || [];
      defSubs.forEach(s => {
        if (s && s.endpoint) subsMap.set(s.endpoint, s);
      });
    }

    return Array.from(subsMap.values());
  },

  async loadSystemAuth() {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('user_sync_data')
          .select('data')
          .eq('user_id', '__system_auth__')
          .limit(1);
        if (!error && data && data.length > 0 && data[0].data) {
          const authData = data[0].data;
          store._users = { ...store._users, ...(authData._users || {}) };
          store._sessions = { ...store._sessions, ...(authData._sessions || {}) };
          store._calKeys = { ...store._calKeys, ...(authData._calKeys || {}) };
          store._shares = { ...store._shares, ...(authData._shares || {}) };
          store._pushSubscriptions = { ...store._pushSubscriptions, ...(authData._pushSubscriptions || {}) };
          store._lineUsers = { ...store._lineUsers, ...(authData._lineUsers || {}) };
          store._userLine = { ...store._userLine, ...(authData._userLine || {}) };
          if (authData._vapid && authData._vapid.publicKey && authData._vapid.privateKey) {
            vapidKeys = authData._vapid;
            store._vapid = authData._vapid;
            configureWebPush();
          }
          // Purge explicitly requested obsolete test users
          const purgeList = ['test', 'test1', 'test1.1', 'test1.2', 'test2', 'test3'];
          let purgedCount = 0;
          for (const username of purgeList) {
            const clean = username.toLowerCase();
            const uid = 'u_' + clean;
            if (store._users[clean] || Object.values(store._users).some(u => u.username && u.username.toLowerCase() === clean)) {
              delete store._users[clean];
              delete store[clean];
              delete store[uid];
              if (store._calKeys) {
                Object.keys(store._calKeys).forEach(k => {
                  if (store._calKeys[k] === uid || store._calKeys[k] === clean) delete store._calKeys[k];
                });
              }
              if (store._sessions) {
                Object.keys(store._sessions).forEach(tok => {
                  if (store._sessions[tok]?.username?.toLowerCase() === clean || store._sessions[tok]?.userId === uid) {
                    delete store._sessions[tok];
                  }
                });
              }
              if (store._lineUsers) {
                Object.keys(store._lineUsers).forEach(lId => {
                  if (store._lineUsers[lId] === uid || store._lineUsers[lId] === clean) delete store._lineUsers[lId];
                });
              }
              purgedCount++;
            }
          }

          if (purgedCount > 0) {
            console.log(`🧹 Purged ${purgedCount} obsolete test user(s) permanently from Supabase & memory.`);
            const userIdsToDelete = purgeList.flatMap(u => [u, 'u_' + u]);
            try {
              await supabase.from('user_sync_data').delete().in('user_id', userIdsToDelete);
            } catch (_) {}
            await dbAdapter.saveSystemAuth();
            saveStore();
          }

          console.log(`✅ Loaded ${Object.keys(store._users).length} User Account(s) & System Config permanently from Supabase`);
        } else if (error) {
          console.warn('⚠️ Supabase loadSystemAuth notice:', error.message);
        }
      } catch (err) {
        console.warn('⚠️ Supabase loadSystemAuth exception:', err.message);
      }
    }
  },

  async deleteUser(usernameOrId) {
    if (!usernameOrId) return false;
    const target = String(usernameOrId).toLowerCase().trim();
    const targetUid = target.startsWith('u_') ? target : `u_${target}`;
    const cleanUsername = target.startsWith('u_') ? target.substring(2) : target;

    const userObj = store._users[cleanUsername] || Object.values(store._users || {}).find(u => u.id === targetUid || (u.username && u.username.toLowerCase() === cleanUsername));
    const uid = userObj ? userObj.id : targetUid;
    const calKey = userObj ? userObj.calendarKey : null;

    delete store._users[cleanUsername];
    if (userObj && userObj.username) delete store._users[userObj.username.toLowerCase()];
    if (calKey && store._calKeys) delete store._calKeys[calKey];
    if (store._calKeys) {
      Object.keys(store._calKeys).forEach(k => {
        if (store._calKeys[k] === uid || store._calKeys[k] === target || store._calKeys[k] === targetUid) delete store._calKeys[k];
      });
    }
    if (store._sessions) {
      Object.keys(store._sessions).forEach(tok => {
        if (store._sessions[tok]?.userId === uid || store._sessions[tok]?.username?.toLowerCase() === cleanUsername) {
          delete store._sessions[tok];
        }
      });
    }
    if (store._lineUsers) {
      Object.keys(store._lineUsers).forEach(lId => {
        if (store._lineUsers[lId] === uid || store._lineUsers[lId] === target || store._lineUsers[lId] === targetUid) delete store._lineUsers[lId];
      });
    }
    if (store._userLine) {
      delete store._userLine[uid];
      delete store._userLine[targetUid];
      delete store._userLine[cleanUsername];
    }
    delete store[uid];
    delete store[targetUid];
    delete store[cleanUsername];

    saveStore();

    if (supabase) {
      try {
        await supabase.from('user_sync_data').delete().in('user_id', [uid, targetUid, cleanUsername, target]);
        await dbAdapter.saveSystemAuth();
        console.log(`🗑️ Successfully deleted user [${cleanUsername}] (${uid}) permanently from Supabase`);
      } catch (err) {
        console.error(`❌ Error deleting user [${cleanUsername}] from Supabase:`, err.message);
      }
    }
    return true;
  },

  async saveSystemAuth() {
    if (supabase) {
      const payload = {
        _users: store._users || {},
        _sessions: store._sessions || {},
        _calKeys: store._calKeys || {},
        _shares: store._shares || {},
        _pushSubscriptions: store._pushSubscriptions || {},
        _lineUsers: store._lineUsers || {},
        _userLine: store._userLine || {},
        _vapid: store._vapid || vapidKeys
      };

      try {
        const record = {
          user_id: '__system_auth__',
          data: payload,
          version: 1,
          updated_at: new Date().toISOString()
        };
        let { error: upsertErr } = await supabase
          .from('user_sync_data')
          .upsert(record, { onConflict: 'user_id' });

        if (upsertErr && upsertErr.message && upsertErr.message.includes('column')) {
          console.warn('⚠️ Supabase missing columns for system_auth, using minimal schema.');
          delete record.version;
          delete record.updated_at;
          const retry = await supabase.from('user_sync_data').upsert(record, { onConflict: 'user_id' });
          upsertErr = retry.error;
        }

        if (upsertErr) {
          console.warn('⚠️ Supabase saveSystemAuth upsert error, trying fallback delete+insert:', upsertErr.message);
          await supabase.from('user_sync_data').delete().eq('user_id', '__system_auth__');
          const { error: insertErr } = await supabase.from('user_sync_data').insert(record);
          if (insertErr) {
            console.error('❌ Supabase saveSystemAuth fallback insert error:', insertErr.message);
          } else {
            console.log('✅ Supabase saveSystemAuth saved via fallback insert');
          }
        }
      } catch (err) {
        console.error('❌ Supabase saveSystemAuth exception:', err.message);
      }
    }
  }
};

// Initialize system auth from Supabase on launch
if (supabase) {
  dbAdapter.loadSystemAuth();
}

// Password helpers
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function generateCalendarKey() {
  return 'cal_' + crypto.randomBytes(12).toString('hex');
}

function generateShareToken() {
  return 'sh_' + crypto.randomBytes(9).toString('hex');
}

// Sanitize display name to prevent XSS
function sanitizeDisplayName(name) {
  return String(name || '')
    .replace(/[<>]/g, '')
    .replace(/&/g, '&')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;')
    .slice(0, 50);
}

// Validate URL to prevent javascript: XSS
function isValidUrl(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol);
  } catch (_) {
    return false;
  }
}

// MIME Types for Static Serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.pdf':  'application/pdf',
  '.ics':  'text/calendar; charset=utf-8',
};

// Default Official BME Curriculum Fallback
const DEFAULT_BME_CURRICULUM = [
  { code: 'SCPY161', name: 'General Physics I', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'L2-002', schedule: 'จันทร์ 09:30 - 12:30', day: 'monday', start: '09:30', end: '12:30', classroomUrl: 'https://classroom.google.com/u/6/c/ODcxMTQzMDA0NzAw', driveUrl: '', desc: 'กลศาสตร์ การเคลื่อนที่ งานและพลังงาน โมเมนตัม การหมุน และคลื่นกล' },
  { code: 'EGBI122', name: 'Computer Programming', credits: '3 (2-2-5)', type: 'บรรยาย + ปฏิบัติการ', room: 'R335/1, R335/2', schedule: 'จันทร์ 13:30 - 17:30', day: 'monday', start: '13:30', end: '17:30', classroomUrl: 'https://classroom.google.com', driveUrl: '', desc: 'หลักการเขียนโปรแกรม โครงสร้างข้อมูล และการประยุกต์ใช้ในงานวิศวกรรมชีวแพทย์' },
  { code: 'LAEN182', name: 'English for General Academic Purposes', credits: '2 (2-0-4)', type: 'บรรยาย', room: 'Room 320', schedule: 'อังคาร 08:30 - 10:30', day: 'tuesday', start: '08:30', end: '10:30', classroomUrl: 'https://classroom.google.com', driveUrl: '', desc: 'ภาษาอังกฤษเพื่อการสื่อสารเชิงวิชาการ ทักษะการอ่าน เขียน และการนำเสนอ' },
  { code: 'SCBE102', name: 'General Biology Laboratory 1', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'Lab SC', schedule: 'อังคาร 13:30 - 16:30', day: 'tuesday', start: '13:30', end: '16:30', classroomUrl: 'https://classroom.google.com/u/6/c/ODY3NjU2OTgwNDEz', driveUrl: '', desc: 'ปฏิบัติการชีววิทยาทั่วไป กล้องจุลทรรศน์ โครงสร้างเซลล์และเนื้อเยื่อ' },
  { code: 'EGBI100', name: 'BME in the Real World', credits: '1 (1-0-2)', type: 'บรรยาย', room: 'R238', schedule: 'อังคาร 17:40 - 18:40', day: 'tuesday', start: '17:40', end: '18:40', classroomUrl: 'https://classroom.google.com/u/6/c/ODcwMzEwOTI0OTg2', driveUrl: '', desc: 'บทนำสู่วิศวกรรมชีวแพทย์ เครื่องมือแพทย์ และระบบสาธารณสุขในโลกจริง' },
  { code: 'SCMA101', name: 'Mathematics I', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC1-152', schedule: 'พุธ 09:00 - 11:00', day: 'wednesday', start: '09:00', end: '11:00', classroomUrl: 'https://classroom.google.com/u/6/c/ODcxNjY1MDM2MTY2', driveUrl: '', desc: 'แคลคูลัส อนุพันธ์ อินทิกรัล และการประยุกต์ใช้ในทางวิศวกรรมศาสตร์' },
  { code: 'SCSL190', name: 'Wonderful Life (Biology)', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC3-303', schedule: 'พฤหัสบดี 09:30 - 12:30', day: 'thursday', start: '09:30', end: '12:30', classroomUrl: 'https://classroom.google.com/u/6/c/Nzk4Mzk2MTI3MDI1', driveUrl: '', desc: 'ชีววิทยาของสิ่งมีชีวิต วิวัฒนาการ และความหลากหลายทางชีวภาพ' },
  { code: 'SCCH161', name: 'General Chemistry', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC2-323', schedule: 'พฤหัสบดี 13:30 - 16:30', day: 'thursday', start: '13:30', end: '16:30', classroomUrl: 'https://classroom.google.com/u/6/c/ODcwMjc5NzAyMjcy', driveUrl: '', desc: 'เคมีทั่วไป โครงสร้างอะตอม พันธะเคมี จลนศาสตร์ และสมดุลเคมี' },
  { code: 'SCPY111', name: 'Physics Laboratory I', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'Lab SC', schedule: 'ศุกร์ 09:30 - 12:30', day: 'friday', start: '09:30', end: '12:30', classroomUrl: 'https://classroom.google.com/u/6/c/ODU1NzE4MDAyNzE5', driveUrl: '', desc: 'การทดลองฟิสิกส์พื้นฐาน การวัด ค่าความคลาดเคลื่อน และการวิเคราะห์ผล' },
  { code: 'SCCH169', name: 'Chemistry Laboratory', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'L2-201', schedule: 'ศุกร์ 13:30 - 16:30', day: 'friday', start: '13:30', end: '16:30', classroomUrl: 'https://classroom.google.com', driveUrl: '', desc: 'ปฏิบัติการเคมี การไตเตรท การสังเคราะห์สาร และการทดสอบคุณสมบัติ' }
];

// Special Timetable for test4
const TEST4_CURRICULUM = [
  // Monday
  { code: 'SCBE101', name: 'SCBE 101', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'L2-001 (SCME,SCCT)', schedule: 'จันทร์ 09:30 - 12:30', day: 'monday', start: '09:30', end: '12:30', classroomUrl: '', driveUrl: '', desc: 'SCBE 101 ห้อง L2-001 (SCME,SCCT)' },
  { code: 'PRPR102', name: 'PRPR 102', credits: '2 (2-0-4)', type: 'บรรยาย', room: 'SC2-323 (SCME)', schedule: 'จันทร์ 13:30 - 15:30', day: 'monday', start: '13:30', end: '15:30', classroomUrl: '', driveUrl: '', desc: 'PRPR 102 ห้อง SC2-323 (SCME)' },
  // Tuesday
  { code: 'LAEN180', name: 'LAEN 180', credits: '2 (2-0-4)', type: 'บรรยาย', room: 'Sec 1 : SC2-323 (SCCT)', schedule: 'อังคาร 08:30 - 10:30', day: 'tuesday', start: '08:30', end: '10:30', classroomUrl: '', driveUrl: '', desc: 'LAEN 180 Sec 1 ห้อง SC2-323 (SCCT)' },
  { code: 'SCIN102', name: 'SCIN 102', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC1-158', schedule: 'อังคาร 10:30 - 13:30', day: 'tuesday', start: '10:30', end: '13:30', classroomUrl: '', driveUrl: '', desc: 'SCIN 102 ห้อง SC1-158' },
  { code: 'SCBE102', name: 'LAB-SCBE 102 (เรียนรวม)', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'เรียนรวม', schedule: 'อังคาร 13:30 - 16:30', day: 'tuesday', start: '13:30', end: '16:30', classroomUrl: '', driveUrl: '', desc: 'LAB-SCBE 102 (เรียนรวม)' },
  // Wednesday
  { code: 'SCIN103', name: 'SCIN 103', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC1-158', schedule: 'พุธ 09:00 - 12:00', day: 'wednesday', start: '09:00', end: '12:00', classroomUrl: '', driveUrl: '', desc: 'SCIN 103 ห้อง SC1-158' },
  { code: 'ACTIVITIES', name: 'Reserved for student activities & academic clinic', credits: '0 (0-3-0)', type: 'กิจกรรม', room: '-', schedule: 'พุธ 13:30 - 16:30', day: 'wednesday', start: '13:30', end: '16:30', classroomUrl: '', driveUrl: '', desc: 'Reserved for student activities & academic clinic' },
  // Thursday
  { code: 'SCGI103', name: 'SCGI 103', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC2-314 (SCBE)', schedule: 'พฤหัสบดี 09:30 - 12:30', day: 'thursday', start: '09:30', end: '12:30', classroomUrl: '', driveUrl: '', desc: 'SCGI 103 ห้อง SC2-314 (SCBE)' },
  { code: 'SCCH161', name: 'SCCH 161 (Section 1)', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC1-152 (SCBM,SCME)', schedule: 'พฤหัสบดี 13:30 - 16:30', day: 'thursday', start: '13:30', end: '16:30', classroomUrl: '', driveUrl: '', desc: 'SCCH 161 Section 1 ห้อง SC1-152 (SCBM,SCME)' },
  // Friday
  { code: 'SCPY111', name: 'LAB-SCPY 111', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'SCME,SCCT,EGCG,EGII,EGBI,ENNM', schedule: 'ศุกร์ 09:30 - 12:30', day: 'friday', start: '09:30', end: '12:30', classroomUrl: '', driveUrl: '', desc: 'LAB-SCPY 111 (SCME,SCCT,EGCG,EGII,EGBI,ENNM)' },
  { code: 'SCCH189', name: 'LAB-SCCH 189', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'SC1-152 (SCBM,SCME)', schedule: 'ศุกร์ 13:30 - 16:30', day: 'friday', start: '13:30', end: '16:30', classroomUrl: '', driveUrl: '', desc: 'LAB-SCCH 189 Lab brief (13:30-14:20/SC1-152) (SCBM,SCME)' }
];

const DEFAULT_BME_STUDY_LINKS = [
  { id: 'gc-1', title: 'SCCH161 General Chemistry', sub: 'EGBI/EGCG/EGII Year 1 - 1/2026', type: 'classroom', url: 'https://classroom.google.com/u/6/c/ODcwMjc5NzAyMjcy', desc: 'Google Classroom วิชาเคมีทั่วไป (SCCH161)', isShared: true },
  { id: 'gc-2', title: 'SCPY111/114/115-(2026-1) Physics Laboratory I', sub: 'EGBI, EGCG, EGII...', type: 'classroom', url: 'https://classroom.google.com/u/6/c/ODU1NzE4MDAyNzE5', desc: 'Google Classroom ปฏิบัติการฟิสิกส์ 1 (SCPY111)', isShared: true },
  { id: 'gc-3', title: 'SCMA101 Mathematics I', sub: 'SECTION 2', type: 'classroom', url: 'https://classroom.google.com/u/6/c/ODcxNjY1MDM2MTY2', desc: 'Google Classroom วิชาคณิตศาสตร์ 1 (SCMA101 Sec 2)', isShared: true },
  { id: 'gc-4', title: 'SCSL 190 Wonderful Life (Biology)', sub: 'EGBI', type: 'classroom', url: 'https://classroom.google.com/u/6/c/Nzk4Mzk2MTI3MDI1', desc: 'Google Classroom วิชา Wonderful Life (SCSL190)', isShared: true },
  { id: 'gc-5', title: '2026/27_EGBI 100 Biomedical Engineering in the Real World', sub: 'EGBI Year 1', type: 'classroom', url: 'https://classroom.google.com/u/6/c/ODcwMzEwOTI0OTg2', desc: 'Google Classroom วิชา BME in the Real World (EGBI100)', isShared: true },
  { id: 'gc-6', title: 'SCPY 161 General Physics I', sub: 'EGBI Year 1 - 1/2026', type: 'classroom', url: 'https://classroom.google.com/u/6/c/ODcxMTQzMDA0NzAw', desc: 'Google Classroom วิชาฟิสิกส์ทั่วไป 1 (SCPY161)', isShared: true }
];

// Default Schedule & Study Blocks Data for iCalendar Feed Generation
const DEFAULT_BME_STUDY_BLOCKS = [
  // Monday
  { day: 'MO', dayNum: 1, start: '19:00', end: '20:00', title: 'Study Block 1 — GenPhy / CompPro', sub: 'ทบทวนวิชาที่ 1 (60 นาที)', type: 'study', isStudyBlock: true },
  { day: 'MO', dayNum: 1, start: '20:30', end: '21:30', title: 'Study Block 2 — เคลียร์การบ้าน / ทบทวน', sub: 'ทบทวนวิชาที่ 2 (60 นาที)', type: 'study', isStudyBlock: true },
  // Tuesday
  { day: 'TU', dayNum: 2, start: '19:30', end: '20:30', title: 'Study Block 3 — Bio Lab / English', sub: 'ทบทวนวิชาที่ 3 (60 นาที)', type: 'study', isStudyBlock: true },
  { day: 'TU', dayNum: 2, start: '20:45', end: '21:45', title: 'Study Block 4 — สรุปเนื้อหา BME Real World', sub: 'ทบทวนวิชาที่ 4 (60 นาที)', type: 'study', isStudyBlock: true },
  // Wednesday
  { day: 'WE', dayNum: 3, start: '13:30', end: '14:30', title: 'Study Block 5 — ทบทวน Calculus / Math', sub: 'ฝึกทำโจทย์คณิตศาสตร์ (60 นาที)', type: 'study', isStudyBlock: true },
  // Thursday
  { day: 'TH', dayNum: 4, start: '19:30', end: '20:30', title: 'Study Block 6 — General Chemistry ทบทวน', sub: 'สรุปสูตรและโจทย์เคมี (60 นาที)', type: 'study', isStudyBlock: true },
  { day: 'TH', dayNum: 4, start: '20:45', end: '21:45', title: 'Study Block 7 — Wonderful Life สรุปชีวะ', sub: 'ทบทวนวิชาชีววิทยา (60 นาที)', type: 'study', isStudyBlock: true },
  // Friday
  { day: 'FR', dayNum: 5, start: '19:30', end: '20:30', title: 'Study Block 8 — เคลียร์ Lab Report & การบ้าน', sub: 'เขียนรายงานแล็ปฟิสิกส์/เคมี (60 นาที)', type: 'study', isStudyBlock: true },
  // Saturday
  { day: 'SA', dayNum: 6, start: '10:00', end: '11:30', title: 'Study Block 9 — ทบทวนภาพรวมประจำสัปดาห์ (Weekly Review)', sub: 'เก็บตกทุกวิชาและเตรียมตัวล่วงหน้า (90 นาที)', type: 'study', isStudyBlock: true }
];

const DEFAULT_BME_ROUTINE_EVENTS = [
  ...DEFAULT_BME_STUDY_BLOCKS,
  // Prayers & Daily Routine events
  { day: 'MO', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ + อ่านอัซการเช้า', type: 'prayer' },
  { day: 'MO', start: '18:45', end: '19:00', title: 'ละหมาดมัฆริบ', type: 'prayer' },
  { day: 'MO', start: '20:00', end: '20:30', title: 'พักเบรกยาว + ละหมาดอีชาอ์', type: 'prayer' },
  { day: 'TU', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ + อ่านอัซการเช้า', type: 'prayer' },
  { day: 'TU', start: '18:45', end: '19:00', title: 'ละหมาดมัฆริบ', type: 'prayer' },
  { day: 'TU', start: '20:30', end: '20:45', title: 'ละหมาดอีชาอ์ + พักเบรก', type: 'prayer' },
  { day: 'WE', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ + อ่านอัซการเช้า', type: 'prayer' },
  { day: 'TH', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ + อ่านอัซการเช้า', type: 'prayer' },
  { day: 'TH', start: '18:45', end: '19:00', title: 'ละหมาดมัฆริบ', type: 'prayer' },
  { day: 'TH', start: '20:00', end: '20:30', title: 'พักเบรกยาว + ละหมาดอีชาอ์', type: 'prayer' },
  { day: 'FR', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ + อ่านอัซการเช้า', type: 'prayer' },
  { day: 'FR', start: '12:30', end: '13:30', title: 'พักกลางวัน + ละหมาดวันศุกร์ 🕌', type: 'prayer' },
  { day: 'SA', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ', type: 'prayer' },
  { day: 'SU', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ', type: 'prayer' }
];

// Helper: Format date for iCalendar RFC 5545
function formatIcsDateTime(dateStr, timeStr) {
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '') + '00';
  return cleanDate + 'T' + cleanTime;
}

// Generate RFC 5545 .ics Feed with real-time curriculum data adapted to each specific user
async function generateIcsCalendar(userId, includeRoutines = false, includeStudy = true, includeClass = true) {
  const baseDates = {
    MO: '2026-08-17',
    TU: '2026-08-18',
    WE: '2026-08-19',
    TH: '2026-08-20',
    FR: '2026-08-21',
    SA: '2026-08-22',
    SU: '2026-08-23'
  };

  const userObj = Object.values(store._users || {}).find(u => u.id === userId || (u.username && u.username.toLowerCase() === userId.toLowerCase()));
  const userCustom = (await dbAdapter.getUserData(userId)) || store[userId] || {};
  const customBlocks = userCustom.customBlocks || {};
  
  const isTest4 = (userObj && userObj.username && userObj.username.toLowerCase() === 'test4') || userId === 'u_test4' || userId === 'test4';

  // Determine if this user is a BME student
  const isBme = isTest4 ? false : (userCustom.isBme !== undefined
    ? !!userCustom.isBme
    : (userObj ? userObj.isBme !== false : (userId === '1' || userId === 'default')));

  // User curriculum: use their custom curriculum if set, or if test4 fallback to TEST4_CURRICULUM, or if BME fallback to DEFAULT_BME_CURRICULUM
  let curriculum = [];
  if (userCustom.curriculum && Array.isArray(userCustom.curriculum) && userCustom.curriculum.length > 0) {
    curriculum = userCustom.curriculum;
  } else if (isTest4) {
    curriculum = TEST4_CURRICULUM;
  } else if (isBme) {
    curriculum = DEFAULT_BME_CURRICULUM;
  }

  const calName = userObj ? `E-Calendar (${userObj.displayName || userObj.username})` : 'E-Calendar (Study & Schedule)';
  const calDesc = isBme ? 'BME Mahidol 2026 Study Blocks and Class Schedule' : 'Personal Study Blocks and Class Schedule';

  let ics = [];
  ics.push('BEGIN:VCALENDAR');
  ics.push('VERSION:2.0');
  ics.push('PRODID:-//E-Calendar//Study Dashboard 2026//TH');
  ics.push('CALSCALE:GREGORIAN');
  ics.push('METHOD:PUBLISH');
  ics.push(`X-WR-CALNAME:${calName}`);
  ics.push('X-WR-TIMEZONE:Asia/Bangkok');
  ics.push(`X-WR-CALDESC:${calDesc}`);

  ics.push('BEGIN:VTIMEZONE');
  ics.push('TZID:Asia/Bangkok');
  ics.push('BEGIN:STANDARD');
  ics.push('DTSTART:19700101T000000');
  ics.push('TZOFFSETFROM:+0700');
  ics.push('TZOFFSETTO:+0700');
  ics.push('TZNAME:+07');
  ics.push('END:STANDARD');
  ics.push('END:VTIMEZONE');

  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // Build events
  const events = [];
  
  // 1. Classes
  if (includeClass) {
    curriculum.forEach((course) => {
      if (!course.schedule && (!course.start || !course.end)) return;
      if (!course.day) return;
      const dayMap = {
        monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU',
        mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA', sun: 'SU'
      };
      const dayCode = dayMap[course.day.toLowerCase()] || course.day.toUpperCase();
      if (!dayCode || !baseDates[dayCode]) return;
      
      let startTime = course.start;
      let endTime = course.end;
      if ((!startTime || !endTime) && course.schedule) {
        const match = course.schedule.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
        if (match) {
          startTime = match[1];
          endTime = match[2];
        }
      }
      
      events.push({
        day: dayCode,
        start: startTime || '09:00',
        end: endTime || '10:00',
        title: `${course.code || ''} ${course.name || ''}`.trim() || 'Class',
        sub: course.room ? `ห้อง ${course.room}` : '',
        type: 'class',
        isClass: true
      });
    });
  }

  // 2. Study Blocks (9 blocks per week for BME users)
  if (includeStudy && isBme) {
    DEFAULT_BME_STUDY_BLOCKS.forEach(ev => {
      events.push({ ...ev });
    });
  }

  // 3. Daily Routines & Prayer (only if includeRoutines is checked and user is BME)
  if (includeRoutines && isBme) {
    DEFAULT_BME_ROUTINE_EVENTS.forEach(ev => {
      if (ev.type === 'prayer' || (!ev.isStudyBlock && !ev.isClass && ev.type !== 'study' && ev.type !== 'class')) {
        events.push({ ...ev });
      }
    });
  }

  // 4. Custom User Blocks (strictly check category filters)
  Object.entries(customBlocks).forEach(([day, blocks]) => {
    const dayMap = {
      monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU',
      mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA', sun: 'SU'
    };
    const dayCode = dayMap[day.toLowerCase()];
    if (!dayCode || !Array.isArray(blocks)) return;
    blocks.forEach((block) => {
      if (!block.start || !block.end) return;
      const isStudy = block.isStudyBlock || block.tag === 'study';
      const isClass = block.isClass || block.tag === 'class';
      const isRoutine = !isStudy && !isClass;

      if (isStudy && !includeStudy) return;
      if (isClass && !includeClass) return;
      if (isRoutine && !includeRoutines) return;

      events.push({
        day: dayCode,
        start: block.start,
        end: block.end,
        title: block.title || 'Custom Block',
        sub: block.notes || block.subtitle || '',
        type: block.tag || (isStudy ? 'study' : isClass ? 'class' : 'routine'),
        isStudyBlock: isStudy,
        isClass: isClass
      });
    });
  });

  // Deduplicate events by title+day+start
  const seen = new Set();
  const deduped = [];
  events.forEach(ev => {
    const key = `${ev.day}|${ev.start}|${ev.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(ev);
    }
  });
  events.length = 0;
  events.push(...deduped);

  events.forEach((ev, idx) => {
    const baseDate = baseDates[ev.day];
    if (!baseDate) return;

    const dtStart = formatIcsDateTime(baseDate, ev.start);
    const dtEnd = formatIcsDateTime(baseDate, ev.end);
    const uid = `ecal-${userId || 'default'}-${ev.day}-${idx}-${ev.start.replace(':', '')}@daily-study.app`;

    const isStudy = ev.isStudyBlock || ev.type === 'study';
    const isClass = ev.isClass || ev.type === 'class';

    const icon = isStudy ? '📚 ' : isClass ? '🎓 ' : '🗓️ ';
    const summary = icon + ev.title;
    const classDesc = isBme ? '\nวิชาเรียน BME Mahidol' : '\nวิชาเรียนของคุณ';
    const desc = (ev.sub || '') + (isStudy ? '\nระบบเตือนความจำจาก E-Calendar: อย่าลืมเตรียมชีทสรุปและเริ่มอ่านหนังสือ!' : classDesc);

    ics.push('BEGIN:VEVENT');
    ics.push(`UID:${uid}`);
    ics.push(`DTSTAMP:${nowStamp}`);
    ics.push(`DTSTART;TZID=Asia/Bangkok:${dtStart}`);
    ics.push(`DTEND;TZID=Asia/Bangkok:${dtEnd}`);
    ics.push(`RRULE:FREQ=WEEKLY;BYDAY=${ev.day};UNTIL=20261231T235959Z`);
    ics.push(`SUMMARY:${summary}`);
    if (ev.sub && isClass) {
      ics.push(`LOCATION:${ev.sub}`);
    }
    ics.push(`DESCRIPTION:${desc}`);
    ics.push('STATUS:CONFIRMED');

    ics.push('BEGIN:VALARM');
    ics.push('ACTION:DISPLAY');
    ics.push(`DESCRIPTION:เตือนความจำ: อีก 15 นาทีจะถึง ${summary}`);
    ics.push('TRIGGER:-PT15M');
    ics.push('END:VALARM');

    if (isStudy) {
      ics.push('BEGIN:VALARM');
      ics.push('ACTION:DISPLAY');
      ics.push(`DESCRIPTION:ถึงเวลาแล้ว! เริ่ม ${summary}`);
      ics.push('TRIGGER:-PT0M');
      ics.push('END:VALARM');
    }

    ics.push('END:VEVENT');
  });

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

// ─── LINE Messaging API Client & Flex Message Builders ────────
async function sendLineReply(replyToken, messages) {
  if (!hasLine || !replyToken) {
    console.warn('⚠️ Cannot send LINE reply: hasLine =', hasLine, 'replyToken =', Boolean(replyToken));
    return false;
  }
  try {
    const msgs = (Array.isArray(messages) ? messages : [messages]).map(m => typeof m === 'string' ? { type: 'text', text: m } : m);
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({ replyToken, messages: msgs })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ LINE Reply Error (HTTP ${res.status}):`, errText);
    } else {
      console.log('✅ LINE reply delivered successfully');
    }
    return res.ok;
  } catch (e) {
    console.error('❌ LINE sendLineReply exception:', e.message);
    return false;
  }
}

async function sendLinePush(toUserId, messages) {
  if (!hasLine || !toUserId) {
    console.warn('⚠️ Cannot send LINE push: hasLine =', hasLine, 'toUserId =', Boolean(toUserId));
    return { ok: false, status: 400, error: 'LINE_CHANNEL_ACCESS_TOKEN หรือ toUserId ไม่ถูกต้อง' };
  }
  try {
    const msgs = (Array.isArray(messages) ? messages : [messages]).map(m => typeof m === 'string' ? { type: 'text', text: m } : m);
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({ to: toUserId, messages: msgs })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ LINE Push Error (HTTP ${res.status}):`, errText);
      return { ok: false, status: res.status, error: errText };
    }
    return { ok: true, status: 200 };
  } catch (e) {
    console.error('❌ LINE sendLinePush exception:', e.message);
    return { ok: false, status: 500, error: e.message };
  }
}

async function getLineMessageContent(messageId) {
  if (!hasLine || !messageId) return null;
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });
    if (!res.ok) {
      console.warn(`⚠️ Failed to download LINE content ${messageId}: HTTP ${res.status}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.warn('⚠️ Error downloading LINE message content:', err.message);
    return null;
  }
}

// ─── Open-Meteo Salaya Weather Integration (Zero Config & Free API) ────────
let weatherCache = { data: null, timestamp: 0 };
async function fetchSalayaWeather() {
  const now = Date.now();
  if (weatherCache.data && (now - weatherCache.timestamp) < 30 * 60 * 1000) {
    return weatherCache.data;
  }
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=13.79&longitude=100.32&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&hourly=precipitation_probability&timezone=Asia%2FBangkok', {
      headers: { 'User-Agent': 'ECalendar-App/2.0' }
    });
    if (!res.ok) return null;
    const json = await res.json();
    const current = json.current || {};
    const hourly = json.hourly || {};
    const currentHourIndex = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getHours();
    const rainProb = (hourly.precipitation_probability && hourly.precipitation_probability[currentHourIndex]) || 0;
    const weatherCode = current.weather_code || 0;
    let weatherText = 'ท้องฟ้าแจ่มใส ☀️';
    if (weatherCode >= 1 && weatherCode <= 3) weatherText = 'มีเมฆเป็นส่วนมาก ⛅';
    else if (weatherCode >= 51 && weatherCode <= 67) weatherText = 'มีฝนตกปรอยๆ 🌦️';
    else if (weatherCode >= 80 && weatherCode <= 82) weatherText = 'ฝนตกปานกลาง 🌧️';
    else if (weatherCode >= 95) weatherText = 'ฝนฟ้าคะนอง ⛈️';

    const result = {
      temp: current.temperature_2m ? `${Math.round(current.temperature_2m)}°C` : '32°C',
      humidity: current.relative_humidity_2m ? `${current.relative_humidity_2m}%` : '70%',
      rainProb: `${rainProb}%`,
      isRainLikely: rainProb >= 40 || (current.precipitation && current.precipitation > 0),
      summary: weatherText,
      alert: rainProb >= 40 ? `🌧️ มีโอกาสฝนตก ${rainProb}% ในแถบศาลายา แนะนำพกร่มและเผื่อเวลาเดินทางครับ` : null
    };

    weatherCache = { data: result, timestamp: now };
    return result;
  } catch (err) {
    console.warn('⚠️ Weather fetch warning:', err.message);
    return null;
  }
}

// ─── Unified Media & File Storage Adapter ─────────────────────
async function saveMediaFileToStorage(buffer, originalFilename, ext, contentType, ownerId) {
  const fileId = crypto.randomBytes(8).toString('hex');
  const safeExt = ext || '.bin';
  const filename = `${fileId}${safeExt}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  
  try {
    fs.writeFileSync(filePath, buffer);
  } catch (fsErr) {
    console.warn('⚠️ File write error:', fsErr.message);
  }

  const size = buffer ? buffer.length : 0;
  let fileUrl = `${APP_BASE_URL}/uploads/${filename}`;
  let uploadedToR2 = false;

  if (r2Client) {
    try {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: filename,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream'
      }));
      uploadedToR2 = true;
    } catch (r2Err) {
      console.warn('⚠️ Cloudflare R2 upload warning from LINE media:', r2Err.message);
    }
  }

  const ownerData = (await dbAdapter.getUserData(ownerId)) || {};
  if (!ownerData.files) ownerData.files = {};
  const fileRecord = {
    id: fileId,
    name: originalFilename || filename,
    url: `/uploads/${filename}`,
    fullUrl: fileUrl,
    size,
    uploadedToR2,
    uploadedAt: new Date().toISOString()
  };
  ownerData.files[fileId] = fileRecord;

  // Also register into Study Resources / Documents list for instant visibility on web
  if (!ownerData.studyLinks) ownerData.studyLinks = [];
  const fileType = safeExt === '.pdf' ? 'pdf' : (['.png', '.jpg', '.jpeg', '.webp'].includes(safeExt)) ? 'image' : 'file';
  const studyEntry = {
    id: `file-${fileId}`,
    title: originalFilename || filename,
    sub: `LINE Upload (${(size / 1024).toFixed(1)} KB)`,
    type: fileType,
    url: `/uploads/${filename}`,
    desc: `อัปโหลดผ่าน LINE Bot เมื่อ ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    folderId: 'f-uploads',
    createdAt: new Date().toISOString()
  };
  ownerData.studyLinks.unshift(studyEntry);
  ownerData.version = (parseInt(ownerData.version, 10) || 0) + 1;
  ownerData.updatedAt = new Date().toISOString();

  await dbAdapter.saveUserData(ownerId, ownerData);
  store[ownerId] = ownerData;
  saveStore();

  return fileRecord;
}

// ─── Google Gemini AI Client Helpers ─────────────────────────
function formatGeminiContents(contents) {
  if (!Array.isArray(contents)) return contents;
  return contents.map(c => {
    if (!c || !Array.isArray(c.parts)) return c;
    return {
      ...c,
      parts: c.parts.map(p => {
        if (p.inlineData || p.inline_data) {
          const raw = p.inlineData || p.inline_data;
          const mime = raw.mimeType || raw.mime_type || 'image/jpeg';
          const data = raw.data || '';
          return {
            inline_data: {
              mime_type: mime,
              data: data
            }
          };
        }
        return p;
      })
    };
  });
}

async function callGeminiApi(contents, systemInstruction = '') {
  if (!hasGemini) return null;
  const models = [
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash-8b'
  ];

  const formattedContents = formatGeminiContents(contents);

  for (const m of models) {
    // Attempt 1: with JSON responseMimeType
    // Attempt 2: with standard text response (fallback if JSON mode is unsupported on image/audio)
    for (const withJsonMode of [true, false]) {
      try {
        const payload = {
          contents: formattedContents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            ...(withJsonMode ? { responseMimeType: 'application/json', response_mime_type: 'application/json' } : {})
          }
        };
        if (systemInstruction) {
          payload.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`⚠️ Gemini API error on model ${m} (withJsonMode=${withJsonMode}, HTTP ${res.status}):`, errText);
          if (withJsonMode && (res.status === 400 || errText.includes('response_mime_type') || errText.includes('responseMimeType') || errText.includes('Invalid JSON payload'))) {
            continue; // Retry next attempt without responseMimeType!
          }
          break; // Move to next model
        }

        const json = await res.json();
        const candidate = json.candidates && json.candidates[0];
        if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
          if (candidate && candidate.finishReason) {
            console.warn(`⚠️ Gemini model ${m} finished with reason:`, candidate.finishReason);
          }
          continue;
        }

        const textOut = candidate.content.parts[0].text;
        if (!textOut) continue;

        let cleaned = textOut.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
        else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
        cleaned = cleaned.trim();

        // Extract JSON object if embedded in surrounding response
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
            return parsed;
          } catch (e) {
            // continue
          }
        }

        try {
          return JSON.parse(cleaned);
        } catch (pe) {
          console.warn('⚠️ Gemini JSON parse warning, using text structure');
          return {
            type: 'general',
            title: 'AI วิเคราะห์ข้อมูล',
            summary: cleaned,
            solution: cleaned,
            text: cleaned
          };
        }
      } catch (err) {
        console.warn(`⚠️ Gemini API call failed on ${m} (withJsonMode=${withJsonMode}):`, err.message);
      }
    }
  }
  return null;
}

async function extractScheduleWithGemini(userText) {
  if (!hasGemini) return null;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayDay = days[now.getDay()];

  const prompt = `User message in Thai/English: "${userText}"
Current Reference: ${todayDay}, ${now.toISOString().slice(0, 10)}. Year: 2026.
Extract schedule events, appointments, tasks, or notes.
Return a JSON object matching this schema:
{
  "summary": "Short Thai summary",
  "events": [
    {
      "title": "Title in Thai",
      "day": "monday|tuesday|wednesday|thursday|friday|saturday|sunday",
      "date": "YYYY-MM-DD",
      "start": "HH:MM",
      "end": "HH:MM",
      "location": "Location if specified",
      "notes": "Extra details"
    }
  ],
  "tasks": [
    {
      "title": "Task title in Thai",
      "dueDate": "Due date/time string"
    }
  ],
  "notes": [
    "Note text"
  ]
}`;

  return await callGeminiApi([
    {
      parts: [{ text: prompt }]
    }
  ], 'You are an expert bilingual NLP assistant for college students. Always output valid JSON.');
}

async function analyzeImageWithGemini(imageBuffer, mimeType = 'image/jpeg') {
  if (!hasGemini) return null;
  const base64Data = imageBuffer.toString('base64');
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayDay = days[now.getDay()];

  const prompt = `จงวิเคราะห์และอธิบายรูปภาพนี้อย่างละเอียดและเป็นประโยชน์ที่สุดสำหรับนักศึกษา:
1. หากเป็นโจทย์คำนวณ / ฟิสิกส์ / คณิตศาสตร์ / วิศวกรรม / เคมี: แสดงวิธีทำทีละขั้นตอน (Step-by-step) อย่างละเอียด ชัดเจน พร้อมสรุปคำตอบสุดท้าย
2. หากเป็นสไลด์เรียน / ชีท / เอกสาร / โน้ต: สรุปใจความสำคัญ ประเด็นหลัก และสูตรหรือทฤษฎีที่ปรากฏในภาพ
3. หากเป็นตารางเรียน / กำหนดการ / วันสอบ: ดึงข้อมูลกิจกรรม (วัน, เวลา, สถานที่, หัวข้อ)
4. หากเป็นรูปภาพทั่วไป: อธิบายสิ่งที่เห็นในภาพอย่างละเอียด ชัดเจน และน่าสนใจ

Current Reference Time: ${todayDay}, ${now.toISOString().slice(0, 10)}. Year: 2026.
ตอบกลับเป็น JSON ตามโครงสร้างนี้:
{
  "type": "math_solution|lecture_notes|schedule|task_list|summary|general",
  "title": "หัวข้อสรุปภาพภาษาไทยที่กระชับและตรงประเด็น (ความยาว 5-15 คำ)",
  "summary": "คำอธิบายรายละเอียด หรือขั้นตอนวิธีทำคำนวณอย่างชัดเจนเป็นภาษาไทย",
  "solution": "วิธีคำนวณหรือขั้นตอนเฉลยแบบละเอียด (ถ้ามี)",
  "events": [
    {
      "title": "ชื่อวิชา/กิจกรรมภาษาไทย",
      "day": "monday|tuesday|wednesday|thursday|friday|saturday|sunday",
      "date": "YYYY-MM-DD",
      "start": "HH:MM",
      "end": "HH:MM",
      "location": "ห้องเรียน/สถานที่",
      "notes": "หมายเหตุ"
    }
  ],
  "tasks": [
    {
      "title": "การบ้านหรืองานที่ต้องทำภาษาไทย",
      "dueDate": "กำหนดส่ง (ถ้ามี)"
    }
  ],
  "notes": [
    "โน้ตหรือข้อควรจำ"
  ]
}`;

  return await callGeminiApi([
    {
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }
  ], 'คุณคือผู้ช่วย AI อัจฉริยะประจำ E-Calendar ทำหน้าที่ช่วยนักศึกษาเฉลยโจทย์คำนวณ สรุปบทเรียน และวิเคราะห์ภาพเป็นภาษาไทยอย่างละเอียด ถูกต้อง และเป็นมิตร');
}

async function transcribeAudioWithGemini(audioBuffer, mimeType = 'audio/mp4') {
  if (!hasGemini) return null;
  const base64Data = audioBuffer.toString('base64');
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayDay = days[now.getDay()];

  const prompt = `Listen to this voice audio (Thai or English).
1. Transcribe the user speech accurately word-for-word.
2. If the user asks a question, calculation, or math problem, solve and provide the answer.
3. If the user mentions appointments, schedules, tasks, or memos, extract them into the structured fields.

Current Reference Time: ${todayDay}, ${now.toISOString().slice(0, 10)}. Year: 2026.
Return a JSON object matching this schema:
{
  "transcript": "Full Thai/English transcription",
  "response": "Helpful AI answer or conversation response if the user asked a question",
  "summary": "Short Thai summary",
  "events": [
    {
      "title": "Title in Thai",
      "day": "monday|tuesday|wednesday|thursday|friday|saturday|sunday",
      "date": "YYYY-MM-DD",
      "start": "HH:MM",
      "end": "HH:MM",
      "location": "Room or Place",
      "notes": "Important details"
    }
  ],
  "tasks": [
    {
      "title": "Task title in Thai",
      "dueDate": "Due date / time string"
    }
  ],
  "notes": [
    "Quick note text"
  ]
}`;

  const audioMimes = [mimeType, 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/mp4'];
  for (const m of audioMimes) {
    const res = await callGeminiApi([
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: m, data: base64Data } }
        ]
      }
    ], 'You are an intelligent Thai & English voice assistant. Accurately transcribe audio and extract events, tasks, or answer questions.');
    if (res && (res.transcript || res.summary || res.response)) {
      return res;
    }
  }
  return null;
}

// ─── Local Rule-Based NLP Appointment Parser (Fallback) ────────
function parseThaiNaturalAppointment(text) {
  if (!text) return null;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const daysMap = {
    'อาทิตย์': 'sunday', 'จันทร์': 'monday', 'อังคาร': 'tuesday', 'พุธ': 'wednesday',
    'พฤหัส': 'thursday', 'พฤหัสบดี': 'thursday', 'ศุกร์': 'friday', 'เสาร์': 'saturday'
  };

  let targetDay = null;
  if (/พรุ่งนี้/i.test(text)) {
    const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    targetDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getDay()];
  } else if (/วันนี้/i.test(text)) {
    targetDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
  } else {
    for (const [thDay, engDay] of Object.entries(daysMap)) {
      if (text.includes(thDay)) {
        targetDay = engDay;
        break;
      }
    }
  }

  // Extract time
  let startTime = '09:00';
  let endTime = '10:00';

  const timeRangeMatch = text.match(/(\d{1,2}[:.]\d{2})\s*[-–ถึง]\s*(\d{1,2}[:.]\d{2})/);
  const singleTimeMatch = text.match(/(\d{1,2}[:.]\d{2})\s*(น\.|นาฬิกา)?/);
  const thaiWordTimeMatch = text.match(/(บ่าย\s*([1-5|โมง|สอง|สาม|สี่|ห้า]+)|([1-9]|1[0-2])\s*โมง(เช้า|เย็น)?|([1-5])\s*ทุ่ม|เที่ยง)/i);

  if (timeRangeMatch) {
    startTime = timeRangeMatch[1].replace('.', ':');
    endTime = timeRangeMatch[2].replace('.', ':');
  } else if (singleTimeMatch) {
    startTime = singleTimeMatch[1].replace('.', ':');
    const [h, m] = startTime.split(':').map(Number);
    endTime = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } else if (thaiWordTimeMatch) {
    const raw = thaiWordTimeMatch[0];
    if (raw.includes('บ่าย')) {
      const num = raw.includes('สอง') ? 2 : raw.includes('สาม') ? 3 : raw.includes('สี่') ? 4 : raw.includes('ห้า') ? 5 : (parseInt((raw.match(/\d+/) || [1])[0], 10));
      startTime = `${12 + num}:00`;
    } else if (raw.includes('ทุ่ม')) {
      const num = parseInt((raw.match(/\d+/) || [1])[0], 10);
      startTime = `${18 + num}:00`;
    } else if (raw.includes('โมง')) {
      const num = parseInt((raw.match(/\d+/) || [9])[0], 10);
      startTime = `${String(num).padStart(2, '0')}:00`;
    } else if (raw.includes('เที่ยง')) {
      startTime = '12:00';
    }
    const [h, m] = startTime.split(':').map(Number);
    endTime = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Extract location
  let location = '';
  const locMatch = text.match(/(ที่|ณ|ห้อง)\s*([a-zA-Z0-9ก-๙\-_\s]+?)(?=\s+(เวลา|ส่ง|กำหนด|$))/i);
  if (locMatch) {
    location = locMatch[2].trim();
  }

  // Clean title
  let title = text
    .replace(/^(นัด|นัดหมาย|มีตติ้ง|meeting|ประชุม|ซ้อม|ติว)\s*/i, '')
    .replace(/(พรุ่งนี้|วันนี้|วัน[จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์]+)/g, '')
    .replace(/(\d{1,2}[:.]\d{2}\s*[-–ถึง]?\s*\d{0,2}[:.]?\d{0,2}\s*(น\.|นาฬิกา)?)/g, '')
    .replace(/(บ่าย\s*([1-5|โมง|สอง|สาม|สี่|ห้า]+)|([1-9]|1[0-2])\s*โมง(เช้า|เย็น)?|([1-5])\s*ทุ่ม|เที่ยง)/g, '')
    .replace(/(ที่|ณ|ห้อง)\s*([a-zA-Z0-9ก-๙\-_\s]+)/g, '')
    .trim();

  if (!title) title = 'นัดหมายใหม่';

  return {
    title,
    day: targetDay || ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()],
    start: startTime,
    end: endTime,
    location,
    notes: ''
  };
}

function safeLineUri(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return APP_BASE_URL || 'https://e-calen.up.railway.app';
  let trimmed = rawUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('line://') && !trimmed.startsWith('tel:')) {
    trimmed = `${APP_BASE_URL || 'https://e-calen.up.railway.app'}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
  }
  try {
    return encodeURI(trimmed);
  } catch (_) {
    return trimmed;
  }
}

function buildScheduleFlex(dayTitle, dateStr, classesList, routineList) {
  const contents = [];
  
  if (classesList && classesList.length > 0) {
    contents.push({
      type: 'text',
      text: '🎓 คาบเรียน',
      weight: 'bold',
      color: '#C45A1B',
      size: 'sm',
      margin: 'md'
    });
    
    classesList.forEach(cls => {
      contents.push({
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFF8F3',
        cornerRadius: 'md',
        paddingAll: '10px',
        margin: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: `${cls.start} - ${cls.end} น.`, size: 'xs', color: '#888888', flex: 0 },
              { type: 'text', text: cls.room ? `ห้อง ${cls.room}` : '', size: 'xs', color: '#C45A1B', align: 'end' }
            ]
          },
          {
            type: 'text',
            text: `${cls.code} ${cls.name}`,
            weight: 'bold',
            size: 'sm',
            color: '#1a1a1a',
            wrap: true,
            margin: 'xs'
          }
        ]
      });
    });
  } else {
    contents.push({
      type: 'text',
      text: '🎉 วันนี้ไม่มีวิชาเรียน พักผ่อนได้เต็มที่!',
      size: 'sm',
      color: '#666666',
      margin: 'md'
    });
  }

  if (routineList && routineList.length > 0) {
    contents.push({
      type: 'separator',
      margin: 'lg'
    });
    contents.push({
      type: 'text',
      text: '📚 บล็อกทบทวน / กิจวัตร',
      weight: 'bold',
      color: '#3b82f6',
      size: 'sm',
      margin: 'md'
    });
    routineList.slice(0, 4).forEach(rt => {
      contents.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          { type: 'text', text: `${rt.start} - ${rt.end}`, size: 'xs', color: '#666666', flex: 2 },
          { type: 'text', text: rt.title, size: 'xs', color: '#222222', flex: 4, wrap: true }
        ]
      });
    });
  }

  return {
    type: 'flex',
    altText: `📅 ตาราง ${dayTitle} (${dateStr})`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#C45A1B',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'E-CALENDAR DASHBOARD', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: `📅 ตาราง ${dayTitle}`, color: '#ffffff', size: 'lg', weight: 'bold' },
          { type: 'text', text: dateStr, color: '#ffffff', size: 'xs', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '🌐 เปิด E-Calendar Dashboard',
              uri: safeLineUri(`${APP_BASE_URL}/?view=dashboard`)
            },
            style: 'primary',
            color: '#C45A1B',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function findCourseMatch(query, curriculum) {
  if (!query) return null;
  const q = query.toLowerCase().trim().replace(/^(วิชา|ห้อง|room)\s*/i, '');
  const cleanQ = q.replace(/[\s\-_]+/g, '');
  const courses = Array.isArray(curriculum) ? curriculum : DEFAULT_BME_CURRICULUM;

  let found = courses.find(c => (c.code || '').toLowerCase() === q || (c.code || '').toLowerCase().replace(/[\s\-_]+/g, '') === cleanQ);
  if (found) return found;

  found = courses.find(c => {
    const cleanCode = (c.code || '').toLowerCase().replace(/[\s\-_]+/g, '');
    return cleanCode.includes(cleanQ) || cleanQ.includes(cleanCode);
  });
  if (found) return found;

  const keywordMap = {
    'ฟิสิกส์': 'SCPY161',
    'ฟิสิก': 'SCPY161',
    'phy': 'SCPY161',
    'physics': 'SCPY161',
    'genphy': 'SCPY161',
    'คอม': 'EGBI122',
    'โปรแกรม': 'EGBI122',
    'comppro': 'EGBI122',
    'อังกฤษ': 'LAEN182',
    'eng': 'LAEN182',
    'english': 'LAEN182',
    'แล็ปชีวะ': 'SCBE102',
    'ชีวะแล็ป': 'SCBE102',
    'biolab': 'SCBE102',
    'bme': 'EGBI100',
    'real world': 'EGBI100',
    'bmereal': 'EGBI100',
    'แคล': 'SCMA101',
    'คณิต': 'SCMA101',
    'math': 'SCMA101',
    'calculus': 'SCMA101',
    'ชีวะ': 'SCSL190',
    'wonderful': 'SCSL190',
    'bio': 'SCSL190',
    'เคมี': 'SCCH161',
    'chem': 'SCCH161',
    'genchem': 'SCCH161',
    'แล็ปฟิสิกส์': 'SCPY111',
    'phylab': 'SCPY111',
    'แล็ปเคมี': 'SCCH169',
    'chemlab': 'SCCH169',
    'ชีววิทยา': 'SCBE101',
    'scbe': 'SCBE101',
    'prpr': 'PRPR102',
    'laen': 'LAEN180',
    'scin': 'SCIN102',
    'scgi': 'SCGI103',
    'scch189': 'SCCH189'
  };

  for (const [kw, code] of Object.entries(keywordMap)) {
    if (q.includes(kw)) {
      const match = courses.find(c => (c.code || '').toLowerCase().replace(/[\s\-_]+/g, '') === code.toLowerCase().replace(/[\s\-_]+/g, ''));
      if (match) return match;
    }
  }

  found = courses.find(c => c.room && c.room.toLowerCase().includes(q));
  if (found) return found;

  found = courses.find(c => (c.name || '').toLowerCase().includes(q));
  return found || null;
}

function buildCourseProfileFlex(course) {
  const dayNamesTH = {
    monday: 'วันจันทร์', tuesday: 'วันอังคาร', wednesday: 'วันพุธ',
    thursday: 'วันพฤหัสบดี', friday: 'วันศุกร์', saturday: 'วันเสาร์', sunday: 'วันอาทิตย์'
  };

  const footerButtons = [];
  if (course.classroomUrl) {
    footerButtons.push({
      type: 'button',
      action: {
        type: 'uri',
        label: '📖 เข้า Google Classroom',
        uri: safeLineUri(course.classroomUrl || 'https://classroom.google.com')
      },
      style: 'primary',
      color: '#10B981',
      height: 'sm'
    });
  }

  footerButtons.push({
    type: 'button',
    action: {
      type: 'uri',
      label: '🌐 เปิดดูชีท & เอกสาร',
      uri: safeLineUri(`${APP_BASE_URL}/?view=study`)
    },
    style: 'secondary',
    height: 'sm'
  });

  return {
    type: 'flex',
    altText: `📚 ข้อมูลรายวิชา: ${course.code} ${course.name}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#C45A1B',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'COURSE INFORMATION', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: `${course.code}`, color: '#ffffff', size: 'xl', weight: 'bold' },
          { type: 'text', text: `${course.name}`, color: '#ffffff', size: 'sm', wrap: true }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '📅 วันเรียน:', size: 'xs', color: '#6B7280', flex: 1 },
              { type: 'text', text: `${dayNamesTH[course.day] || course.day || '-'}`, size: 'xs', weight: 'bold', color: '#1F2937', flex: 3 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '⏰ เวลา:', size: 'xs', color: '#6B7280', flex: 1 },
              { type: 'text', text: `${course.start} - ${course.end} น.`, size: 'xs', weight: 'bold', color: '#1F2937', flex: 3 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '📍 ห้องเรียน:', size: 'xs', color: '#6B7280', flex: 1 },
              { type: 'text', text: course.room ? `ห้อง ${course.room}` : 'ออนไลน์ / ดูรายละเอียด', size: 'xs', weight: 'bold', color: '#C45A1B', flex: 3 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '🎓 หน่วยกิต:', size: 'xs', color: '#6B7280', flex: 1 },
              { type: 'text', text: `${course.credits || '3 หน่วยกิต'} (${course.type || 'บรรยาย'})`, size: 'xs', color: '#1F2937', flex: 3 }
            ]
          },
          ...(course.desc ? [
            { type: 'separator', margin: 'md' },
            {
              type: 'text',
              text: '📝 คำอธิบายรายวิชา:',
              size: 'xs',
              weight: 'bold',
              color: '#374151',
              margin: 'sm'
            },
            {
              type: 'text',
              text: course.desc,
              size: 'xxs',
              color: '#6B7280',
              wrap: true
            }
          ] : [])
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: footerButtons
      }
    }
  };
}

function buildWeeklyScheduleFlex(curriculum) {
  const days = [
    { key: 'monday', title: 'วันจันทร์', color: '#F59E0B' },
    { key: 'tuesday', title: 'วันอังคาร', color: '#EC4899' },
    { key: 'wednesday', title: 'วันพุธ', color: '#10B981' },
    { key: 'thursday', title: 'วันพฤหัสบดี', color: '#F97316' },
    { key: 'friday', title: 'วันศุกร์', color: '#3B82F6' }
  ];

  const bubbles = days.map(d => {
    const dayClasses = (curriculum || DEFAULT_BME_CURRICULUM)
      .filter(c => c.day === d.key)
      .sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));

    const classItems = [];
    if (dayClasses.length === 0) {
      classItems.push({
        type: 'text',
        text: '🌴 ไม่มีคาบเรียน (วันหยุด/อ่านหนังสือ)',
        size: 'xs',
        color: '#9CA3AF',
        margin: 'md'
      });
    } else {
      dayClasses.forEach(c => {
        classItems.push({
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F9FAFB',
          cornerRadius: 'md',
          paddingAll: '8px',
          margin: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: `${c.start} - ${c.end}`, size: 'xxs', color: '#6B7280', flex: 0 },
                { type: 'text', text: c.room ? `ห้อง ${c.room}` : '', size: 'xxs', color: d.color, align: 'end' }
              ]
            },
            {
              type: 'text',
              text: `${c.code} ${c.name}`,
              weight: 'bold',
              size: 'xs',
              color: '#111827',
              wrap: true
            }
          ]
        });
      });
    }

    return {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: d.color,
        paddingAll: '12px',
        contents: [
          { type: 'text', text: `📅 ${d.title}`, color: '#ffffff', weight: 'bold', size: 'md' },
          { type: 'text', text: `${dayClasses.length} คาบเรียน`, color: '#ffffff', size: 'xxs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: classItems
      }
    };
  });

  return {
    type: 'flex',
    altText: '🗓️ ตารางเรียนประจำสัปดาห์ (จันทร์ - ศุกร์)',
    contents: {
      type: 'carousel',
      contents: bubbles
    }
  };
}

function buildClassroomDirectoryFlex(curriculum, studyLinks) {
  const courses = curriculum || DEFAULT_BME_CURRICULUM;
  const links = (studyLinks && studyLinks.length > 0) ? studyLinks : DEFAULT_BME_STUDY_LINKS;

  const cards = courses.map(c => {
    const matchedLink = links.find(l => l.title && l.title.includes(c.code)) || { url: c.classroomUrl || '' };
    const url = c.classroomUrl || matchedLink.url || 'https://classroom.google.com';

    return {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F8FAFC',
      cornerRadius: 'md',
      paddingAll: '10px',
      margin: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: `${c.code}`, weight: 'bold', size: 'sm', color: '#1E293B' },
            { type: 'text', text: c.room ? `ห้อง ${c.room}` : '', size: 'xs', color: '#64748B', align: 'end' }
          ]
        },
        {
          type: 'text',
          text: `${c.name}`,
          size: 'xs',
          color: '#475569',
          wrap: true,
          margin: 'xs'
        },
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '📖 เข้า Google Classroom',
            uri: safeLineUri(url)
          },
          style: 'primary',
          color: '#059669',
          height: 'sm',
          margin: 'sm'
        }
      ]
    };
  });

  return {
    type: 'flex',
    altText: '📚 รวมลิงก์ Google Classroom รายวิชา',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#059669',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'E-CALENDAR STUDY HUB', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '📚 รวมลิงก์ Google Classroom', color: '#ffffff', size: 'md', weight: 'bold' },
          { type: 'text', text: 'คลิกเพื่อเข้าห้องเรียนและส่งงานได้ทันที', color: '#ffffff', size: 'xs', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: cards
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '🌐 คลังความรู้ & ไฟล์ชีททั้งหมด',
              uri: safeLineUri(`${APP_BASE_URL}/?view=study`)
            },
            style: 'secondary',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildTaskAddedFlex(task, totalPending) {
  return {
    type: 'flex',
    altText: `✅ เพิ่มงานเรียบร้อย: ${task.title}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#059669',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'TASK & HOMEWORK MANAGER', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '✅ เพิ่มการบ้านสำเร็จ!', color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'xs',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F0FDF4',
            cornerRadius: 'md',
            paddingAll: '12px',
            contents: [
              { type: 'text', text: `📝 ${task.title}`, weight: 'bold', size: 'sm', color: '#065F46', wrap: true },
              ...(task.dueDate ? [
                { type: 'text', text: `⏰ กำหนดส่ง: ${task.dueDate}`, size: 'xs', color: '#DC2626', margin: 'xs', weight: 'bold' }
              ] : [])
            ]
          },
          { type: 'text', text: `💡 เหลืองานค้างทั้งหมด ${totalPending} รายการ`, size: 'xs', color: '#6B7280', margin: 'sm' }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: { type: 'message', label: '📝 ดูงานค้าง', text: 'งานค้าง' },
            style: 'primary',
            color: '#059669',
            height: 'sm'
          },
          {
            type: 'button',
            action: { type: 'message', label: '📌 ดูโน้ต', text: 'โน้ต' },
            style: 'secondary',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildDDayCountdownFlex() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  
  const events = [
    { title: 'สอบกลางภาค (Midterm Exam)', date: '2026-09-28', desc: 'เตรียมตัวทบทวน 7 สัปดาห์แรก' },
    { title: 'สอบปลายภาค (Final Exam)', date: '2026-11-23', desc: 'สอบวัดผลปลายภาค ภาคการศึกษาที่ 1' }
  ];

  const items = events.map(ev => {
    const target = new Date(ev.date);
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const isPast = diffDays < 0;
    const dayText = isPast ? 'สอบเสร็จแล้ว' : (diffDays === 0 ? '🔥 วันนี้คือวันสอบ!' : `เหลืออีก ${diffDays} วัน`);

    return {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FEF2F2',
      cornerRadius: 'md',
      paddingAll: '12px',
      margin: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: ev.title, weight: 'bold', size: 'xs', color: '#991B1B', flex: 3, wrap: true },
            { type: 'text', text: dayText, weight: 'bold', size: 'xs', color: '#DC2626', flex: 2, align: 'end' }
          ]
        },
        {
          type: 'text',
          text: `📅 กำหนดการ: ${ev.date} — ${ev.desc}`,
          size: 'xxs',
          color: '#7F1D1D',
          margin: 'xs',
          wrap: true
        }
      ]
    };
  });

  return {
    type: 'flex',
    altText: '⏳ D-Day Countdown: นับถอยหลังวันสอบ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#DC2626',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'EXAM COUNTDOWN', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '⏳ นับถอยหลังวันสอบ (D-Day)', color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        contents: items
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'message',
              label: '📚 ดูตารางทบทวนประจำวัน',
              text: 'ตารางวันนี้'
            },
            style: 'primary',
            color: '#DC2626',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildDailyBriefingFlex(dayName, dateStr, classesList, pendingTasks, routineList) {
  return {
    type: 'flex',
    altText: `🌅 สรุปข้อมูลประจำวัน (${dayName} ${dateStr})`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#EA580C',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'DAILY BRIEFING', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: `🌅 สรุปข้อมูล ${dayName}`, color: '#ffffff', size: 'lg', weight: 'bold' },
          { type: 'text', text: dateStr, color: '#ffffff', size: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#FFF7ED',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '🎓 วิชาเรียนวันนี้:', size: 'xs', color: '#9A3412', flex: 3 },
              { type: 'text', text: `${classesList.length} วิชา`, size: 'xs', weight: 'bold', color: '#EA580C', flex: 2, align: 'end' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#FEF2F2',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '📝 การบ้านที่ค้างอยู่:', size: 'xs', color: '#991B1B', flex: 3 },
              { type: 'text', text: `${pendingTasks.length} งาน`, size: 'xs', weight: 'bold', color: '#DC2626', flex: 2, align: 'end' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#EFF6FF',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '📚 บล็อกอ่านหนังสือ:', size: 'xs', color: '#1E40AF', flex: 3 },
              { type: 'text', text: `${routineList.length} บล็อก`, size: 'xs', weight: 'bold', color: '#2563EB', flex: 2, align: 'end' }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: { type: 'message', label: '📅 ดูตารางวันนี้', text: 'ตารางวันนี้' },
            style: 'primary',
            color: '#EA580C',
            height: 'sm'
          },
          {
            type: 'button',
            action: { type: 'message', label: '📝 จัดการงาน', text: 'งานค้าง' },
            style: 'secondary',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildClassReminderFlex(course, timeUntilStr = 'อีก 15 นาที', themeColor = null, weatherInfo = null, notiSettings = null) {
  const is30Min = timeUntilStr.includes('30');
  const headerBg = themeColor || (is30Min ? '#D97706' : '#DC2626');
  const badgeText = is30Min ? '🔔 PRE-CLASS REMINDER (30 MIN)' : '⚡ URGENT: CLASS STARTING';
  const headerTitle = `🚀 คาบเรียนจะเริ่มในอีก ${timeUntilStr}!`;
  const codeColor = is30Min ? '#D97706' : '#DC2626';

  const bodyContents = [
    {
      type: 'text',
      text: `${course.code}`,
      size: 'xs',
      weight: 'bold',
      color: codeColor
    },
    {
      type: 'text',
      text: `${course.name}`,
      size: 'md',
      weight: 'bold',
      color: '#111827',
      wrap: true,
      margin: 'xs'
    },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '⏰ เวลา:', size: 'xs', color: '#6B7280', flex: 1 },
            { type: 'text', text: `${course.start} - ${course.end} น.`, size: 'xs', weight: 'bold', color: '#1F2937', flex: 3 }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '📍 สถานที่:', size: 'xs', color: '#6B7280', flex: 1 },
            { type: 'text', text: course.room ? `ห้อง ${course.room}` : 'ออนไลน์ / ดูรายละเอียด', size: 'xs', weight: 'bold', color: '#1F2937', flex: 3 }
          ]
        }
      ]
    }
  ];

  if (weatherInfo && weatherInfo.alert) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      backgroundColor: '#EFF6FF',
      cornerRadius: 'md',
      paddingAll: '8px',
      margin: 'md',
      contents: [
        {
          type: 'text',
          text: weatherInfo.alert,
          size: 'xxs',
          color: '#1D4ED8',
          wrap: true
        }
      ]
    });
  }

  const mapQuery = encodeURIComponent(`มหาวิทยาลัยมหิดล ศาลายา ${course.room || 'คณะวิศวกรรมศาสตร์'}`);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const liffUrl = LINE_LIFF_ID ? `https://liff.line.me/${LINE_LIFF_ID}` : APP_BASE_URL;
  const eCalenLink = liffUrl.includes('?') ? `${liffUrl}&view=dashboard&subview=timeline` : `${liffUrl}?view=dashboard&subview=timeline`;
  const classroomLink = course.classroomUrl || 'https://classroom.google.com';

  return {
    type: 'flex',
    altText: `⏰ แจ้งเตือนคาบเรียน: ${course.code} ${course.name} (${timeUntilStr})`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: headerBg,
        paddingAll: '14px',
        contents: [
          { type: 'text', text: badgeText, color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: headerTitle, color: '#ffffff', size: 'md', weight: 'bold', margin: 'xs', wrap: true }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: bodyContents
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '⏰ เลื่อน 15 นาที',
                  data: `action=snooze&min=15&code=${encodeURIComponent(course.code)}`,
                  displayText: 'ขอเลื่อนการแจ้งเตือน 15 นาทีครับ'
                },
                style: 'secondary',
                height: 'sm'
              },
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '📖 Classroom',
                  uri: safeLineUri(classroomLink)
                },
                style: 'primary',
                color: headerBg,
                height: 'sm'
              }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '📍 แผนที่/ตึกเรียน',
                  uri: safeLineUri(mapUrl)
                },
                style: 'link',
                height: 'sm',
                color: '#2563EB'
              },
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '📅 เปิด E-Calendar',
                  uri: safeLineUri(eCalenLink)
                },
                style: 'link',
                height: 'sm',
                color: '#C45A1B'
              }
            ]
          }
        ]
      }
    }
  };
}

function buildDailyDigestFlex(type, data) {
  const isMorning = type === 'morning';
  const headerBg = isMorning ? '#EA580C' : '#4F46E5';
  const title = isMorning ? `☀️ Morning Brief: ภาพรวมวันนี้` : `🌙 Evening Wrap-up: สรุปประจำวัน`;
  const sub = isMorning ? `ตารางเรียน & สภาพอากาศประจำวัน (${data.dateStr})` : `ความคืบหน้า & ตารางเรียนวันพรุ่งนี้`;
  const liffUrl = LINE_LIFF_ID ? `https://liff.line.me/${LINE_LIFF_ID}` : APP_BASE_URL;

  const bodyContents = [];

  if (isMorning) {
    if (data.weather) {
      bodyContents.push({
        type: 'box',
        layout: 'horizontal',
        backgroundColor: '#FFF7ED',
        cornerRadius: 'md',
        paddingAll: '10px',
        margin: 'xs',
        contents: [
          { type: 'text', text: `🌡️ ${data.weather.temp} | ${data.weather.summary}`, size: 'xs', weight: 'bold', color: '#9A3412', flex: 3 },
          { type: 'text', text: `🌧️ ฝน ${data.weather.rainProb}`, size: 'xs', color: '#C2410C', align: 'end', flex: 1 }
        ]
      });
      if (data.weather.alert) {
        bodyContents.push({
          type: 'text',
          text: data.weather.alert,
          size: 'xxs',
          color: '#EA580C',
          wrap: true,
          margin: 'xs'
        });
      }
    }

    bodyContents.push({
      type: 'text',
      text: '🎓 คาบเรียนวันนี้',
      weight: 'bold',
      size: 'sm',
      color: '#1F2937',
      margin: 'md'
    });

    if (data.classes && data.classes.length > 0) {
      data.classes.forEach(c => {
        bodyContents.push({
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          contents: [
            { type: 'text', text: `${c.start}-${c.end}`, size: 'xs', color: '#EA580C', weight: 'bold', flex: 2 },
            { type: 'text', text: `${c.code} (${c.room || '-'})`, size: 'xs', color: '#374151', flex: 4, wrap: true }
          ]
        });
      });
    } else {
      bodyContents.push({
        type: 'text',
        text: '🎉 วันนี้ไม่มีวิชาเรียน พักผ่อนหรือทบทวนตามอัธยาศัย!',
        size: 'xs',
        color: '#10B981',
        margin: 'xs'
      });
    }

    if (data.tasks && data.tasks.length > 0) {
      bodyContents.push({
        type: 'separator',
        margin: 'md'
      });
      bodyContents.push({
        type: 'text',
        text: `📝 งานที่ต้องทำ (${data.tasks.length} รายการ)`,
        weight: 'bold',
        size: 'sm',
        color: '#1F2937',
        margin: 'sm'
      });
      data.tasks.slice(0, 3).forEach((t, i) => {
        bodyContents.push({
          type: 'text',
          text: `• ${t.title} ${t.dueDate ? `(ส่ง ${t.dueDate})` : ''}`,
          size: 'xs',
          color: '#4B5563',
          wrap: true,
          margin: 'xs'
        });
      });
    }
  } else {
    // Evening Wrap-up
    bodyContents.push({
      type: 'text',
      text: '🎉 ผลงานวันนี้:',
      weight: 'bold',
      size: 'sm',
      color: '#1F2937'
    });

    if (data.completedTasks && data.completedTasks.length > 0) {
      bodyContents.push({
        type: 'text',
        text: `✅ ทำงานเสร็จแล้ว ${data.completedTasks.length} รายการ เยี่ยมมากครับ!`,
        size: 'xs',
        color: '#10B981',
        margin: 'xs'
      });
    } else {
      bodyContents.push({
        type: 'text',
        text: `วันนี้พักผ่อนเต็มที่ พร้อมลุยต่อในวันพรุ่งนี้ ✨`,
        size: 'xs',
        color: '#6B7280',
        margin: 'xs'
      });
    }

    bodyContents.push({
      type: 'separator',
      margin: 'md'
    });

    bodyContents.push({
      type: 'text',
      text: '🌅 คาบแรกของวันพรุ่งนี้:',
      weight: 'bold',
      size: 'sm',
      color: '#1F2937',
      margin: 'sm'
    });

    if (data.tomorrowClasses && data.tomorrowClasses.length > 0) {
      const firstClass = data.tomorrowClasses[0];
      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#EEF2FF',
        cornerRadius: 'md',
        paddingAll: '10px',
        margin: 'xs',
        contents: [
          { type: 'text', text: `⏰ ${firstClass.start} - ${firstClass.end} น.`, size: 'xs', weight: 'bold', color: '#4F46E5' },
          { type: 'text', text: `${firstClass.code} ${firstClass.name}`, size: 'xs', weight: 'bold', color: '#1F2937', wrap: true },
          { type: 'text', text: `📍 ห้อง ${firstClass.room || '-'}`, size: 'xxs', color: '#6B7280' }
        ]
      });
    } else {
      bodyContents.push({
        type: 'text',
        text: '🌴 พรุ่งนี้ไม่มีคาบเรียน นอนตื่นสายได้!',
        size: 'xs',
        color: '#10B981',
        margin: 'xs'
      });
    }
  }

  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: headerBg,
        paddingAll: '16px',
        contents: [
          { type: 'text', text: isMorning ? 'MORNING BRIEF' : 'EVENING WRAP-UP', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: title, color: '#ffffff', size: 'md', weight: 'bold', margin: 'xs' },
          { type: 'text', text: sub, color: '#ffffff', size: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: bodyContents
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '📅 เปิดดูตารางแบบเต็ม',
              uri: safeLineUri(`${liffUrl}${liffUrl.includes('?') ? '&' : '?'}view=dashboard`)
            },
            style: 'primary',
            color: headerBg,
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildNotiStatusFlex(notiSettings) {
  const isEnabled = notiSettings && notiSettings.enabled === true;
  const offsets = (notiSettings && Array.isArray(notiSettings.offsets) && notiSettings.offsets.length > 0)
    ? notiSettings.offsets
    : [15];
  const offsetText = offsets.map(m => `${m} นาที`).join(', ');
  const statusColor = isEnabled ? '#10B981' : '#6B7280';
  const statusText = isEnabled ? '🟢 เปิดใช้งานอยู่ (Active)' : '🔴 ปิดอยู่ (Disabled)';

  return {
    type: 'flex',
    altText: `⚙️ สถานะการแจ้งเตือน: ${statusText}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1E293B',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'NOTIFICATION SETTINGS', color: '#94A3B8', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '⚙️ การตั้งค่าแจ้งเตือนล่วงหน้า', color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'สถานะ:', size: 'xs', color: '#64748B', flex: 1 },
              { type: 'text', text: statusText, size: 'xs', weight: 'bold', color: statusColor, flex: 2 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'รอบแจ้งเตือน:', size: 'xs', color: '#64748B', flex: 1 },
              { type: 'text', text: isEnabled ? `เตือนก่อน ${offsetText}` : '-', size: 'xs', weight: 'bold', color: '#0F172A', flex: 2 }
            ]
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'text',
            text: '💡 วิธีเปลี่ยนการตั้งค่า:\n• พิมพ์ /noti on เพื่อเปิดเตือน 15 นาที\n• พิมพ์ /noti 10 15 30 เพื่อเตือน 3 รอบ\n• พิมพ์ /noti cancel เพื่อปิดเตือน',
            size: 'xxs',
            color: '#64748B',
            wrap: true,
            margin: 'sm'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '🔔 เตือน 15 นาที',
                  data: 'action=set_noti&offsets=15',
                  displayText: '/noti 15'
                },
                style: 'secondary',
                height: 'sm'
              },
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: '⚡ เตือน 3 รอบ',
                  data: 'action=set_noti&offsets=10,15,30',
                  displayText: '/noti 10 15 30'
                },
                style: 'primary',
                color: '#C45A1B',
                height: 'sm'
              }
            ]
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: '🚫 ปิดการแจ้งเตือน',
              data: 'action=cancel_noti',
              displayText: '/noti cancel'
            },
            style: 'link',
            color: '#EF4444',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildAiEventCreatedFlex(events, summary = '', sourceLabel = 'AI Assistant') {
  const liffUrl = LINE_LIFF_ID ? `https://liff.line.me/${LINE_LIFF_ID}` : APP_BASE_URL;
  const dayNamesTH = {
    monday: 'วันจันทร์', tuesday: 'วันอังคาร', wednesday: 'วันพุธ',
    thursday: 'วันพฤหัสบดี', friday: 'วันศุกร์', saturday: 'วันเสาร์', sunday: 'วันอาทิตย์'
  };

  const bodyContents = [];
  if (summary) {
    bodyContents.push({
      type: 'text',
      text: summary,
      size: 'xs',
      color: '#4B5563',
      wrap: true,
      margin: 'xs'
    });
    bodyContents.push({ type: 'separator', margin: 'md' });
  }

  (events || []).forEach((ev) => {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F8FAFC',
      cornerRadius: 'md',
      paddingAll: '10px',
      margin: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: `📅 ${dayNamesTH[ev.day] || ev.day || 'วันนัดหมาย'}`, size: 'xxs', color: '#C45A1B', weight: 'bold', flex: 2 },
            { type: 'text', text: `⏰ ${ev.start} - ${ev.end} น.`, size: 'xxs', color: '#64748B', align: 'end', flex: 2 }
          ]
        },
        {
          type: 'text',
          text: `📌 ${ev.title}`,
          size: 'sm',
          weight: 'bold',
          color: '#0F172A',
          wrap: true,
          margin: 'xs'
        },
        ...(ev.location ? [
          { type: 'text', text: `📍 สถานที่: ${ev.location}`, size: 'xxs', color: '#64748B', wrap: true }
        ] : []),
        ...(ev.notes ? [
          { type: 'text', text: `📝 ${ev.notes}`, size: 'xxs', color: '#94A3B8', wrap: true }
        ] : [])
      ]
    });
  });

  return {
    type: 'flex',
    altText: `✨ AI บันทึกลงตารางแล้ว: ${(events && events[0] && events[0].title) || 'นัดหมายใหม่'}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#7C3AED',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: `🤖 ${sourceLabel.toUpperCase()} AUTO-SCHEDULE`, color: '#DDD6FE', size: 'xxs', weight: 'bold' },
          { type: 'text', text: `✨ บันทึกเข้าตารางเรียบร้อยแล้ว!`, color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: bodyContents
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '📅 เปิดดูในตาราง E-Calendar',
              uri: safeLineUri(`${liffUrl}${liffUrl.includes('?') ? '&' : '?'}view=dashboard`)
            },
            style: 'primary',
            color: '#7C3AED',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildAiSolutionFlex(aiResult, fileRecord) {
  const isPdf = fileRecord && fileRecord.name && fileRecord.name.toLowerCase().endsWith('.pdf');
  const isImg = fileRecord && fileRecord.name && fileRecord.name.match(/\.(png|jpe?g|webp|gif)$/i);
  const rawFileUrl = fileRecord ? `${APP_BASE_URL}${fileRecord.url}` : APP_BASE_URL;
  const fileUrl = (fileRecord && (isPdf || isImg))
    ? `${APP_BASE_URL}/viewer.html?url=${encodeURIComponent(rawFileUrl)}&title=${encodeURIComponent(fileRecord.name)}&type=${isPdf ? 'pdf' : 'image'}`
    : rawFileUrl;
  const studyFolderUrl = `${APP_BASE_URL}/?view=study&folder=f-uploads`;
  const bodyContents = [];

  if (aiResult.summary || aiResult.solution || aiResult.text) {
    const rawText = aiResult.solution || aiResult.summary || aiResult.text || '';
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F5F3FF',
      cornerRadius: 'md',
      paddingAll: '12px',
      margin: 'xs',
      contents: [
        { type: 'text', text: '💡 คำอธิบาย & การคำนวณ / สรุป:', size: 'xs', weight: 'bold', color: '#6D28D9' },
        { type: 'text', text: rawText.slice(0, 1000), size: 'xs', color: '#1F2937', wrap: true, margin: 'xs' }
      ]
    });
  }

  if (Array.isArray(aiResult.events) && aiResult.events.length > 0) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#ECFDF5',
      cornerRadius: 'md',
      paddingAll: '10px',
      margin: 'sm',
      contents: [
        { type: 'text', text: `📅 บันทึกลงตาราง (${aiResult.events.length} รายการ):`, size: 'xxs', weight: 'bold', color: '#047857' },
        ...aiResult.events.slice(0, 3).map(ev => ({
          type: 'text',
          text: `• ${ev.title} (${ev.day || ''} ${ev.start || ''}-${ev.end || ''})`,
          size: 'xxs',
          color: '#065F46',
          wrap: true
        }))
      ]
    });
  }

  if (Array.isArray(aiResult.tasks) && aiResult.tasks.length > 0) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FFFBEB',
      cornerRadius: 'md',
      paddingAll: '10px',
      margin: 'sm',
      contents: [
        { type: 'text', text: `📝 เพิ่มการบ้าน/งาน (${aiResult.tasks.length} รายการ):`, size: 'xxs', weight: 'bold', color: '#B45309' },
        ...aiResult.tasks.slice(0, 3).map(t => ({
          type: 'text',
          text: `• ${t.title} ${t.dueDate ? `(ส่ง: ${t.dueDate})` : ''}`,
          size: 'xxs',
          color: '#92400E',
          wrap: true
        }))
      ]
    });
  }

  if (fileRecord) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      backgroundColor: '#F8FAFC',
      cornerRadius: 'md',
      paddingAll: '8px',
      margin: 'sm',
      alignItems: 'center',
      contents: [
        { type: 'text', text: `☁️ บันทึกไฟล์แล้ว: ${fileRecord.name.slice(0, 24)}`, size: 'xxs', color: '#64748B', flex: 1 }
      ]
    });
  }

  return {
    type: 'flex',
    altText: `✨ AI วิเคราะห์ & คำนวณ: ${aiResult.title || aiResult.summary || 'เสร็จสมบูรณ์'}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#7C3AED',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'GEMINI MULTIMODAL AI & CLOUD VAULT', color: '#DDD6FE', size: 'xxs', weight: 'bold' },
          { type: 'text', text: `🤖 ${aiResult.title || 'AI วิเคราะห์ & คำนวณโจทย์'}`, color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs', wrap: true }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'xs',
        contents: bodyContents
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'uri', label: isImg ? '🖼️ ดูรูปภาพ' : '📂 ดูไฟล์บนเว็บ', uri: safeLineUri(fileUrl) }, style: 'primary', color: '#7C3AED', height: 'sm' },
          { type: 'button', action: { type: 'uri', label: '📁 คลังไฟล์อัปโหลด', uri: safeLineUri(studyFolderUrl) }, style: 'secondary', height: 'sm' }
        ]
      }
    }
  };
}

function buildFileSavedFlex(fileRecord, aiSummary) {
  const isPdf = fileRecord && fileRecord.name && fileRecord.name.toLowerCase().endsWith('.pdf');
  const isImg = fileRecord && fileRecord.name && fileRecord.name.match(/\.(png|jpe?g|webp|gif)$/i);
  const rawFileUrl = `${APP_BASE_URL}${fileRecord.url}`;
  const fileUrl = (isPdf || isImg)
    ? `${APP_BASE_URL}/viewer.html?url=${encodeURIComponent(rawFileUrl)}&title=${encodeURIComponent(fileRecord.name)}&type=${isPdf ? 'pdf' : 'image'}`
    : rawFileUrl;
  const studyFolderUrl = `${APP_BASE_URL}/?view=study&folder=f-uploads`;
  const sizeKb = fileRecord.size ? `${(fileRecord.size / 1024).toFixed(1)} KB` : '';

  return {
    type: 'flex',
    altText: `📁 บันทึกไฟล์เข้าคลังเอกสาร: ${fileRecord.name}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0284C7',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'E-CALENDAR CLOUD VAULT', color: '#E0F2FE', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '📁 บันทึกไฟล์เข้าสู่ระบบสำเร็จ!', color: '#FFFFFF', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F0F9FF',
            cornerRadius: 'md',
            paddingAll: '12px',
            contents: [
              { type: 'text', text: `📄 ${fileRecord.name}`, weight: 'bold', size: 'sm', color: '#0369A1', wrap: true },
              ...(sizeKb ? [{ type: 'text', text: `ขนาด: ${sizeKb} | อัปโหลดเมื่อ: ${fileRecord.uploadedAt.slice(0, 10)}`, size: 'xxs', color: '#0284C7', margin: 'xs' }] : [])
            ]
          },
          ...(aiSummary ? [
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#F8FAFC',
              cornerRadius: 'md',
              paddingAll: '10px',
              margin: 'xs',
              contents: [
                { type: 'text', text: '📖 สรุปเนื้อหาโดย AI:', size: 'xxs', weight: 'bold', color: '#475569' },
                { type: 'text', text: aiSummary.slice(0, 600), size: 'xs', color: '#334155', wrap: true, margin: 'xs' }
              ]
            }
          ] : [])
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'uri', label: isImg ? '🖼️ เปิดดูรูปภาพ' : '📖 เปิดดูไฟล์', uri: safeLineUri(fileUrl) }, style: 'primary', color: '#0284C7', height: 'sm' },
          { type: 'button', action: { type: 'uri', label: '📂 คลังไฟล์ที่อัปโหลด', uri: safeLineUri(studyFolderUrl) }, style: 'secondary', height: 'sm' }
        ]
      }
    }
  };
}

function buildLinkSuccessFlex(user) {
  return {
    type: 'flex',
    altText: `🎉 ผูกบัญชี E-Calendar สำเร็จ: ${user.displayName || user.username}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#10B981',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'E-CALENDAR NOTIFICATION', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '🎉 ผูกบัญชีสำเร็จเรียบร้อย!', color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: `ยินดีต้อนรับคุณ ${user.displayName || user.username} (@${user.username})`, weight: 'bold', size: 'sm', color: '#111827' },
          { type: 'text', text: 'ระบบจะส่งการแจ้งเตือนคาบเรียนล่วงหน้า 15 นาที และคุณสามารถพิมพ์ขอตารางเรียนผ่านแชทนี้ได้ตลอด 24 ชม.', size: 'xs', color: '#4B5563', wrap: true, margin: 'sm' }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'message',
              label: '📅 ตารางวันนี้',
              text: 'ตารางวันนี้'
            },
            style: 'primary',
            color: '#C45A1B',
            height: 'sm'
          },
          {
            type: 'button',
            action: {
              type: 'message',
              label: '📝 งานค้าง',
              text: 'งานค้าง'
            },
            style: 'secondary',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildNextClassFlex(course, status, minutesDiff, upcomingCourse) {
  if (status === 'done_today') {
    return {
      type: 'flex',
      altText: '🎉 เรียนครบทุกคาบแล้วสำหรับวันนี้!',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#10B981',
          paddingAll: '16px',
          contents: [
            { type: 'text', text: 'TODAY SCHEDULE STATUS', color: '#ffffff', size: 'xxs', weight: 'bold' },
            { type: 'text', text: '🎉 เรียนครบทุกวิชาแล้วสำหรับวันนี้!', color: '#ffffff', size: 'md', weight: 'bold' }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          contents: [
            { type: 'text', text: 'คุณไม่มีคาบเรียนที่เหลือในวันนี้แล้วครับ พักผ่อนให้เต็มที่ หรือทบทวนบทเรียนได้เลย ✨', size: 'xs', color: '#4B5563', wrap: true }
          ]
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            { type: 'button', action: { type: 'message', label: '⏰ ตารางพรุ่งนี้', text: 'ตารางพรุ่งนี้' }, style: 'primary', color: '#C45A1B', height: 'sm' },
            { type: 'button', action: { type: 'message', label: '📝 เช็คงานค้าง', text: 'งานค้าง' }, style: 'secondary', height: 'sm' }
          ]
        }
      }
    };
  }

  const isOngoing = status === 'ongoing';
  const headerBg = isOngoing ? '#2563EB' : '#EA580C';
  const headerTitle = isOngoing ? '🟢 กำลังเรียนอยู่ในขณะนี้' : `⏰ อีก ${minutesDiff} นาทีจะเริ่มเรียน`;

  return {
    type: 'flex',
    altText: `⚡ ${headerTitle}: ${course.code} ${course.name}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: headerBg,
        paddingAll: '16px',
        contents: [
          { type: 'text', text: isOngoing ? 'CURRENT ACTIVE CLASS' : 'NEXT UPCOMING CLASS', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: headerTitle, color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: `${course.code}`, size: 'xs', weight: 'bold', color: headerBg },
          { type: 'text', text: `${course.name}`, size: 'md', weight: 'bold', color: '#111827', wrap: true },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F3F4F6',
            cornerRadius: 'md',
            paddingAll: '12px',
            margin: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '⏰ เวลาเรียน:', size: 'xs', color: '#6B7280', flex: 1 },
                  { type: 'text', text: `${course.start} - ${course.end} น.`, size: 'xs', weight: 'bold', color: '#1F2937', flex: 2 }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'xs',
                contents: [
                  { type: 'text', text: '📍 ห้องเรียน:', size: 'xs', color: '#6B7280', flex: 1 },
                  { type: 'text', text: course.room ? `ห้อง ${course.room}` : 'ออนไลน์ / ดูรายละเอียด', size: 'xs', weight: 'bold', color: '#1F2937', flex: 2 }
                ]
              }
            ]
          },
          ...(upcomingCourse ? [
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'sm',
              contents: [
                { type: 'text', text: '👉 คาบถัดไป:', size: 'xxs', color: '#9CA3AF', flex: 1 },
                { type: 'text', text: `${upcomingCourse.code} (${upcomingCourse.start} น.)`, size: 'xxs', color: '#4B5563', flex: 2 }
              ]
            }
          ] : [])
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: { type: 'uri', label: '📖 เข้า Classroom', uri: safeLineUri(course.classroomUrl || 'https://classroom.google.com') },
            style: 'primary',
            color: '#10B981',
            height: 'sm'
          },
          {
            type: 'button',
            action: { type: 'message', label: '📅 ตารางวันนี้', text: 'ตารางวันนี้' },
            style: 'secondary',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildSemesterCreditsFlex(curriculum) {
  const courses = curriculum || DEFAULT_BME_CURRICULUM;
  const uniqueCourses = [];
  const seenCodes = new Set();
  courses.forEach(c => {
    if (!seenCodes.has(c.code)) {
      seenCodes.add(c.code);
      uniqueCourses.push(c);
    }
  });

  const totalCredits = uniqueCourses.reduce((sum, c) => sum + (c.credits || 3), 0);
  const courseItems = uniqueCourses.slice(0, 7).map(c => ({
    type: 'box',
    layout: 'horizontal',
    margin: 'xs',
    contents: [
      { type: 'text', text: `${c.code}`, size: 'xs', weight: 'bold', color: '#1E293B', flex: 2 },
      { type: 'text', text: `${c.name}`, size: 'xs', color: '#475569', flex: 4, wrap: true },
      { type: 'text', text: `${c.credits || 3} นก.`, size: 'xs', weight: 'bold', color: '#059669', flex: 1, align: 'end' }
    ]
  }));

  return {
    type: 'flex',
    altText: `📊 สรุปหน่วยกิตประจำภาคการศึกษา: รวม ${totalCredits} หน่วยกิต`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#4F46E5',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'ACADEMIC CREDIT SUMMARY', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '📊 สรุปหน่วยกิต & รายวิชา', color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#EEF2FF',
            cornerRadius: 'md',
            paddingAll: '12px',
            contents: [
              { type: 'text', text: '🎓 หน่วยกิตรวมเทอมนี้:', size: 'xs', color: '#3730A3', flex: 2 },
              { type: 'text', text: `${totalCredits} หน่วยกิต (${uniqueCourses.length} วิชา)`, size: 'xs', weight: 'bold', color: '#4F46E5', flex: 2, align: 'end' }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            contents: courseItems
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: { type: 'message', label: '🗓️ ตารางสัปดาห์', text: 'ตารางสัปดาห์' },
            style: 'primary',
            color: '#4F46E5',
            height: 'sm'
          },
          {
            type: 'button',
            action: { type: 'message', label: '⏳ วันสอบ', text: 'สอบ' },
            style: 'secondary',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildFreeTimeFlex(dayTitle, dateStr, freeSlots, todayRoutines) {
  const slotItems = freeSlots.length === 0 ? [
    { type: 'text', text: 'วันนี้มีตารางเรียนเต็มวัน ไม่มีช่วงว่างระหว่างคาบครับ 💪', size: 'xs', color: '#6B7280' }
  ] : freeSlots.map(s => ({
    type: 'box',
    layout: 'horizontal',
    backgroundColor: '#F0FDF4',
    cornerRadius: 'md',
    paddingAll: '10px',
    margin: 'xs',
    contents: [
      { type: 'text', text: `⏳ ${s.start} - ${s.end} น.`, size: 'xs', weight: 'bold', color: '#166534', flex: 2 },
      { type: 'text', text: `ว่าง ${s.durationMinutes} นาที (${s.suggest})`, size: 'xs', color: '#15803D', flex: 3, align: 'end', wrap: true }
    ]
  }));

  return {
    type: 'flex',
    altText: `🕒 ช่วงเวลาว่างประจำวัน (${dayTitle})`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0D9488',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'FREE TIME & STUDY PLANNER', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: `🕒 ช่วงเวลาว่าง ${dayTitle}`, color: '#ffffff', size: 'md', weight: 'bold' },
          { type: 'text', text: dateStr, color: '#ffffff', size: 'xs', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: '💡 บล็อกเวลาว่างระหว่างคาบเรียนวันนี้:', size: 'xs', weight: 'bold', color: '#0F766E', margin: 'none' },
          { type: 'box', layout: 'vertical', margin: 'sm', contents: slotItems }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'message', label: '📅 ดูตารางวันนี้', text: 'ตารางวันนี้' }, style: 'primary', color: '#0D9488', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '🍽️ กินไรดี', text: 'กินไรดี' }, style: 'secondary', height: 'sm' }
        ]
      }
    }
  };
}

function buildQuickNoteFlex(notes) {
  const hasNotes = Array.isArray(notes) && notes.length > 0;

  const items = !hasNotes ? [
    {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FEF9C3',
      cornerRadius: 'md',
      paddingAll: '16px',
      alignItems: 'center',
      contents: [
        { type: 'text', text: '📝 ยังไม่มีโน้ตที่บันทึกไว้', weight: 'bold', size: 'sm', color: '#854D0E' },
        { type: 'text', text: 'พิมพ์ "+โน้ต <ข้อความ>" เพื่อจดโน้ตกันลืมได้ทันทีครับ', size: 'xs', color: '#A16207', margin: 'xs', align: 'center', wrap: true }
      ]
    }
  ] : notes.slice(0, 8).map((n, i) => ({
    type: 'box',
    layout: 'horizontal',
    backgroundColor: '#FEF9C3',
    cornerRadius: 'md',
    paddingAll: '10px',
    margin: 'xs',
    alignItems: 'center',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        flex: 5,
        contents: [
          { type: 'text', text: `📌 ${i + 1}. ${n.text || n.title}`, size: 'xs', weight: 'bold', color: '#854D0E', wrap: true },
          ...(n.createdAt ? [{ type: 'text', text: `${n.createdAt.slice(0, 10)}`, size: 'xxs', color: '#A16207', margin: 'xs' }] : [])
        ]
      },
      {
        type: 'button',
        action: {
          type: 'message',
          label: 'ลบ',
          text: `ลบโน้ต ${i + 1}`
        },
        style: 'secondary',
        height: 'sm',
        flex: 2,
        color: '#B45309'
      }
    ]
  }));

  // Append helpful instructions when notes exist
  if (hasNotes) {
    items.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      paddingTop: '8px',
      contents: [
        { type: 'separator', color: '#FDE047' },
        {
          type: 'text',
          text: '💡 วิธีลบโน้ต: กดปุ่ม "ลบ" ด้านขวา หรือพิมพ์ "ลบโน้ต <ลำดับ>" เช่น "ลบโน้ต 1"\n(พิมพ์ "ลบโน้ตทั้งหมด" เพื่อล้างโน้ตทั้งหมด)',
          size: 'xxs',
          color: '#854D0E',
          wrap: true,
          margin: 'sm'
        }
      ]
    });
  }

  return {
    type: 'flex',
    altText: `📌 บันทึกโน้ตสั้นของคุณ (${(notes || []).length} รายการ)`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#CA8A04',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'QUICK MEMO & NOTES', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '📌 บันทึกโน้ตกันลืม', color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        contents: items
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'message', label: '📝 การบ้าน', text: 'งานค้าง' }, style: 'primary', color: '#CA8A04', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📅 ตารางวันนี้', text: 'ตารางวันนี้' }, style: 'secondary', height: 'sm' }
        ]
      }
    }
  };
}

function buildPendingTasksFlex(tasks) {
  const pending = (tasks || []).filter(t => !t.done && !t.completed);

  const items = (pending.length === 0) ? [
    {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#F0FDF4',
      cornerRadius: 'md',
      paddingAll: '16px',
      alignItems: 'center',
      contents: [
        { type: 'text', text: '🎉 ไม่มีงานค้างในระบบ!', weight: 'bold', size: 'sm', color: '#166534' },
        { type: 'text', text: 'พิมพ์ "+งาน <ชื่อ> ส่ง <วัน>" เพื่อจดการบ้านได้ตลอดเวลาครับ', size: 'xs', color: '#15803D', wrap: true, margin: 'xs', align: 'center' }
      ]
    }
  ] : pending.slice(0, 8).map((t, i) => {
    const taskIndex = i + 1;
    const taskTitle = t.title || t.text || 'การบ้าน/งาน';
    const dueDateStr = t.dueDate ? `⏰ กำหนดส่ง: ${t.dueDate}` : null;

    return {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: '#F0FDF4',
      cornerRadius: 'md',
      paddingAll: '10px',
      margin: 'xs',
      alignItems: 'center',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          flex: 4,
          contents: [
            { type: 'text', text: `📝 ${taskIndex}. ${taskTitle}`, size: 'xs', weight: 'bold', color: '#065F46', wrap: true },
            ...(dueDateStr ? [{ type: 'text', text: dueDateStr, size: 'xxs', color: '#DC2626', weight: 'bold', margin: 'xs' }] : []),
            ...(t.createdAt ? [{ type: 'text', text: `บันทึกเมื่อ: ${t.createdAt.slice(0, 10)}`, size: 'xxs', color: '#15803D', margin: 'xs' }] : [])
          ]
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: 'เสร็จ',
            data: `action=done_task&id=${t.id || taskIndex}`,
            displayText: `เสร็จ ${taskIndex}`
          },
          style: 'secondary',
          height: 'sm',
          flex: 1
        }
      ]
    };
  });

  return {
    type: 'flex',
    altText: `📝 รายการงานค้าง & การบ้าน (${pending.length} รายการ)`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#059669',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'TASK & HOMEWORK MANAGER', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: `📝 รายการงานค้าง (${pending.length} รายการ)`, color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'xs',
        contents: items
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'message', label: '📌 ดูโน้ต', text: 'โน้ต' }, style: 'primary', color: '#059669', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📅 ตารางวันนี้', text: 'ตารางวันนี้' }, style: 'secondary', height: 'sm' }
        ]
      }
    }
  };
}

function buildFoodRouletteFlex(food) {
  return {
    type: 'flex',
    altText: `🍽️ เมนูแนะนำวันนี้: ${food.name} (${food.location})`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#E11D48',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'MAHIDOL SALAYA FOOD ROULETTE', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '🎲 สุ่มเมนูอาหารแถวมหิดล!', color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: `✨ ${food.name}`, size: 'lg', weight: 'bold', color: '#BE123C', wrap: true },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '📍 พิกัด:', size: 'xs', color: '#6B7280', flex: 1 },
              { type: 'text', text: `${food.location}`, size: 'xs', weight: 'bold', color: '#1F2937', flex: 3 }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '💡 เมนูเด็ด:', size: 'xs', color: '#6B7280', flex: 1 },
              { type: 'text', text: `${food.highlight}`, size: 'xs', color: '#374151', flex: 3, wrap: true }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '💵 ราคาประมาณ:', size: 'xs', color: '#6B7280', flex: 1 },
              { type: 'text', text: `${food.price}`, size: 'xs', color: '#059669', weight: 'bold', flex: 3 }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '🗺️ เปิดแผนที่',
              uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(food.location + ' มหิดล ศาลายา')}`
            },
            style: 'primary',
            color: '#E11D48',
            height: 'sm'
          },
          {
            type: 'button',
            action: { type: 'message', label: '🎲 สุ่มใหม่', text: 'กินไรดี' },
            style: 'secondary',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildUserProfileFlex(user, taskCount = 0, noteCount = 0, webCalUrl = '') {
  return {
    type: 'flex',
    altText: `👤 ข้อมูลโปรไฟล์ E-Calendar: ${user.displayName || user.username}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'E-CALENDAR USER PROFILE', color: '#94A3B8', size: 'xxs', weight: 'bold' },
          { type: 'text', text: `👤 ${user.displayName || user.username}`, color: '#ffffff', size: 'lg', weight: 'bold' },
          { type: 'text', text: `@${user.username} • ภาควิชา BME มหิดล`, color: '#38BDF8', size: 'xs', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#F0FDF4',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '🟢 สถานะระบบ:', size: 'xs', color: '#166534', flex: 2 },
              { type: 'text', text: 'Cloud Synced 100%', size: 'xs', weight: 'bold', color: '#15803D', flex: 3, align: 'end' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#FEF2F2',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '📝 การบ้านที่ค้างอยู่:', size: 'xs', color: '#991B1B', flex: 2 },
              { type: 'text', text: `${taskCount} รายการ`, size: 'xs', weight: 'bold', color: '#DC2626', flex: 3, align: 'end' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#FEF9C3',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '📌 โน้ตที่บันทึกไว้:', size: 'xs', color: '#854D0E', flex: 2 },
              { type: 'text', text: `${noteCount} โน้ต`, size: 'xs', weight: 'bold', color: '#CA8A04', flex: 3, align: 'end' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#EFF6FF',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '🔔 การแจ้งเตือน:', size: 'xs', color: '#1E40AF', flex: 2 },
              { type: 'text', text: 'LINE + Web Push เปิดใช้งาน', size: 'xs', weight: 'bold', color: '#2563EB', flex: 3, align: 'end' }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: { type: 'uri', label: '🌐 เปิดเว็บ Dashboard', uri: safeLineUri(`${APP_BASE_URL}/?view=dashboard`) },
            style: 'primary',
            color: '#0F172A',
            height: 'sm'
          },
          {
            type: 'button',
            action: { type: 'message', label: '📝 จัดการงาน', text: 'งานค้าง' },
            style: 'secondary',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildDetailedExamScheduleFlex() {
  const examSubjects = [
    { code: 'SCPY161', name: 'General Physics I', date: '28 ก.ย. 2026', time: '09:00 - 12:00', room: 'L-01', type: 'ปรนัย 40 ข้อ + อัตนัย 4 ข้อ', daysLeft: 35 },
    { code: 'SCMA101', name: 'Calculus I', date: '30 ก.ย. 2026', time: '13:00 - 16:00', room: 'L2-002', type: 'อัตนัยแสดงวิธีทำล้วน', daysLeft: 37 },
    { code: 'SCCH161', name: 'General Chemistry', date: '02 ต.ค. 2026', time: '09:00 - 12:00', room: 'SC1-152', type: 'ปรนัย 60 ข้อ', daysLeft: 39 },
    { code: 'EGBI122', name: 'Computer Programming', date: '05 ต.ค. 2026', time: '09:00 - 12:00', room: 'Lab Com 1', type: 'เขียนโค้ดปฏิบัติการบนเครื่อง', daysLeft: 42 },
    { code: 'LAEN182', name: 'English for Communication', date: '07 ต.ค. 2026', time: '13:30 - 15:30', room: 'L-02', type: 'Reading & Grammar Test', daysLeft: 44 }
  ];

  const cards = examSubjects.map(sub => ({
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#FEF2F2',
    cornerRadius: 'md',
    paddingAll: '10px',
    margin: 'xs',
    contents: [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          { type: 'text', text: `🎯 ${sub.code}`, weight: 'bold', size: 'xs', color: '#991B1B', flex: 3 },
          { type: 'text', text: `อีก ${sub.daysLeft} วัน`, weight: 'bold', size: 'xs', color: '#DC2626', flex: 2, align: 'end' }
        ]
      },
      { type: 'text', text: sub.name, size: 'xs', weight: 'bold', color: '#1F2937', margin: 'xs', wrap: true },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          { type: 'text', text: `📅 ${sub.date} (${sub.time})`, size: 'xxs', color: '#6B7280', flex: 3 },
          { type: 'text', text: `📍 ห้อง ${sub.room}`, size: 'xxs', weight: 'bold', color: '#DC2626', flex: 2, align: 'end' }
        ]
      },
      { type: 'text', text: `💡 รูปแบบ: ${sub.type}`, size: 'xxs', color: '#B91C1C', margin: 'xs', wrap: true }
    ]
  }));

  return {
    type: 'flex',
    altText: '🗓️ ตารางสอบกลางภาคแบบละเอียดทุกรายวิชา (Midterm Exam)',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#B91C1C',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'OFFICIAL MIDTERM EXAM SCHEDULE', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '🗓️ ตารางสอบกลางภาครายวิชา', color: '#ffffff', size: 'md', weight: 'bold' },
          { type: 'text', text: 'ภาคการศึกษาที่ 1 • คณะวิศวกรรมศาสตร์ BME', color: '#ffffff', size: 'xs', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: cards
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'message', label: '⏳ D-Day Countdown', text: 'สอบ' }, style: 'primary', color: '#B91C1C', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📚 คลาสรูมชีท', text: 'คลาสรูม' }, style: 'secondary', height: 'sm' }
        ]
      }
    }
  };
}

function buildCampusServicesFlex() {
  return {
    type: 'flex',
    altText: '🚌 บริการวิทยาเขตมหิดล ศาลายา (รถราง / รถบัส / เบอร์ฉุกเฉิน)',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0284C7',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'MAHIDOL SALAYA CAMPUS GUIDE', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '🚌 บริการ ม.มหิดล & เบอร์ฉุกเฉิน', color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F0F9FF',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '🚍 รถรางฟรีภายใน ม. (Salaya Tram):', weight: 'bold', size: 'xs', color: '#0369A1' },
              { type: 'text', text: '• สาย 1 (เขียว) — วิ่งวนรอบ ม. ผ่านทุกคณะ\n• สาย 2 (น้ำเงิน) — วิ่งโซนหอพักใน & MLC\n• สาย 3 (แดง) — ศูนย์การแพทย์ & คณะแพทย์\n• สาย 4 (เหลือง) — ประตู 5 & คณะวิศวะ\n(วิ่งทุก 10-15 นาที ตั้งแต่ 06:30 - 20:00 น.)', size: 'xxs', color: '#0C4A6E', wrap: true, margin: 'xs' }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#EFF6FF',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '🚆 Salaya Link Bus (ไป BTS บางหว้า):', weight: 'bold', size: 'xs', color: '#1D4ED8' },
              { type: 'text', text: '• ค่าโดยสาร 30 บาท\n• จุดขึ้นรถ: หน้าวิทยาลัยดุริยางคศิลป์\n• รอบเช้า: 06:00 - 08:30 / รอบเย็น: 16:30 - 18:30', size: 'xxs', color: '#1E3A8A', wrap: true, margin: 'xs' }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FEF2F2',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '🚨 เบอร์โทรฉุกเฉิน 24 ชม.:', weight: 'bold', size: 'xs', color: '#B91C1C' },
              { type: 'text', text: '• รปภ. กลาง มหิดล: 02-849-6111\n• หน่วยพยาบาล/ห้องพยาบาล: 02-849-4528\n• ศูนย์การแพทย์กาญจนาภิเษก: 02-849-6600', size: 'xxs', color: '#991B1B', wrap: true, margin: 'xs' }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: { type: 'uri', label: '🗺️ แผนที่ มหิดล', uri: 'https://maps.google.com/?q=Mahidol+University+Salaya' },
            style: 'primary',
            color: '#0284C7',
            height: 'sm'
          },
          {
            type: 'button',
            action: { type: 'message', label: '🍽️ สุ่มของกิน', text: 'กินไรดี' },
            style: 'secondary',
            height: 'sm'
          }
        ]
      }
    }
  };
}

function buildLibraryStudyLoungeFlex() {
  return {
    type: 'flex',
    altText: '📖 พิกัดห้องสมุด & ที่นั่งอ่านหนังสือ มหิดล ศาลายา',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#6D28D9',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'STUDY SPACES & LIBRARIES', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '📖 พิกัดหอสมุด & Co-Working', color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F5F3FF',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '🏛️ หอสมุดกลาง สัญญา ธรรมศักดิ์:', weight: 'bold', size: 'xs', color: '#5B21B6' },
              { type: 'text', text: '• จันทร์ - ศุกร์: 08:00 - 21:00 น.\n• เสาร์ - อาทิตย์: 09:00 - 19:00 น.\n• ไฮไลท์: มีห้องประชุมกลุ่ม, เก้าอี้นุ่ม, ปลั๊กไฟทุกโต๊ะ, Wi-Fi เร็วมาก', size: 'xxs', color: '#4C1D95', wrap: true, margin: 'xs' }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '🔬 ห้องสมุดคณะวิทยาศาสตร์ (SC Library):', weight: 'bold', size: 'xs', color: '#334155' },
              { type: 'text', text: '• จันทร์ - ศุกร์: 08:30 - 18:30 น.\n• ไฮไลท์: คนไม่เยอะ เงียบสงบ เหมาะกับการทำโจทย์ฟิสิกส์/แคลคูลัส', size: 'xxs', color: '#1E293B', wrap: true, margin: 'xs' }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#ECFDF5',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '💡 MLC & Co-Working 24 ชม. (ช่วงสอบ):', weight: 'bold', size: 'xs', color: '#047857' },
              { type: 'text', text: '• อาคารศูนย์การเรียนรู้มหิดล (MLC ชั้น 1-2)\n• True Lab @ อาคารบัณฑิตวิทยาลัย\n• ใต้ตึกหอพักนักศึกษา (มีโต๊ะและไฟสว่าง)', size: 'xxs', color: '#064E3B', wrap: true, margin: 'xs' }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'message', label: '🕒 หาเวลาว่างวันนี้', text: 'เวลาว่าง' }, style: 'primary', color: '#6D28D9', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📅 ดูตารางวันนี้', text: 'ตารางวันนี้' }, style: 'secondary', height: 'sm' }
        ]
      }
    }
  };
}

function buildGpaTargetSimulatorFlex() {
  return {
    type: 'flex',
    altText: '🎯 วางแผนเป้าหมาย GPA & เกรดเฉลี่ย (GPA Target Simulator)',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#D97706',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'GPA TARGET & ACADEMIC PLANNER', color: '#ffffff', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '🎯 แผนพิชิตเป้าหมาย GPAX 3.50+', color: '#ffffff', size: 'md', weight: 'bold' },
          { type: 'text', text: 'เกียรตินิยมอันดับ 1 • คณะวิศวกรรมศาสตร์', color: '#ffffff', size: 'xs', margin: 'xs' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            backgroundColor: '#FEF3C7',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '🏆 เกณฑ์เป้าหมาย:', size: 'xs', color: '#92400E', flex: 2 },
              { type: 'text', text: 'A ≥ 4 วิชา / B+ ≥ 2 วิชา', size: 'xs', weight: 'bold', color: '#B45309', flex: 3, align: 'end' }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '📌 แผนการเก็บเกรดแนะนำรายวิชา:', weight: 'bold', size: 'xs', color: '#1E293B' },
              { type: 'text', text: '• SCPY161 (Physics 3 นก.): เป้าเกรด A หรือ B+\n• SCMA101 (Calculus 3 นก.): เป้าเกรด A หรือ B+\n• SCCH161 (Chemistry 3 นก.): เป้าเกรด A หรือ B+\n• EGBI122 (ComProg 3 นก.): เป้าเกรด A\n• LAEN182 (English 3 นก.): เป้าเกรด A\n• แล็ปปฏิบัติการ (1 นก. x 3 วิชา): เป้าเกรด A ล้วน', size: 'xxs', color: '#475569', wrap: true, margin: 'xs' }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#ECFDF5',
            cornerRadius: 'md',
            paddingAll: '8px',
            contents: [
              { type: 'text', text: '💡 ทิป: ทำการบ้านและเก็บคะแนนเก็บให้ครบ 100% จะช่วยเซฟเกรดช่วงสอบได้มากที่สุด!', size: 'xxs', color: '#065F46', wrap: true }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'message', label: '📊 สรุปหน่วยกิต', text: 'หน่วยกิต' }, style: 'primary', color: '#D97706', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '🗓️ ตารางสอบ', text: 'ตารางสอบ' }, style: 'secondary', height: 'sm' }
        ]
      }
    }
  };
}

function buildStudyFocusRoutineFlex() {
  return {
    type: 'flex',
    altText: '🍅 เทคนิคอ่านหนังสือ & บล็อกโฟกัสรายวัน (Study Focus Routine)',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#334155',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'DEEP WORK & STUDY ROUTINE', color: '#94A3B8', size: 'xxs', weight: 'bold' },
          { type: 'text', text: '🍅 เทคนิคอ่านหนังสือ & บล็อกโฟกัส', color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F1F5F9',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '⏳ เทคนิค Pomodoro (25/5):', weight: 'bold', size: 'xs', color: '#0F172A' },
              { type: 'text', text: '• อ่าน/ทำโจทย์เข้มข้น 25 นาที (ปิดแจ้งเตือนมือถือ)\n• พักสายตา ดื่มน้ำ ยืดเส้น 5 นาที\n• ทำครบ 4 รอบ พักยาว 20-30 นาที', size: 'xxs', color: '#334155', wrap: true, margin: 'xs' }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FFF7ED',
            cornerRadius: 'md',
            paddingAll: '10px',
            contents: [
              { type: 'text', text: '🌅 บล็อกเวลาทบทวนแนะนำ:', weight: 'bold', size: 'xs', color: '#9A3412' },
              { type: 'text', text: '• 07:30 - 08:30: ทบทวนโน้ตสรุปวิชาที่จะเรียนวันนี้\n• 17:00 - 18:30: เคลียร์การบ้านประจำวันให้เสร็จทันที\n• 20:00 - 22:00: ทำโจทย์ข้อสอบเก่า (Deep Focus)', size: 'xxs', color: '#7C2D12', wrap: true, margin: 'xs' }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'message', label: '📝 จัดการการบ้าน', text: 'งานค้าง' }, style: 'primary', color: '#334155', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '🕒 หาเวลาว่าง', text: 'เวลาว่าง' }, style: 'secondary', height: 'sm' }
        ]
      }
    }
  };
}

function buildHelpMenuFlex() {
  const liffUrl = LINE_LIFF_ID ? `https://liff.line.me/${LINE_LIFF_ID}` : APP_BASE_URL;

  return {
    type: 'flex',
    altText: '🤖 E-Calendar Bot Command Menu & Guide (คู่มือคำสั่ง & ฟีเจอร์ทั้งหมด)',
    contents: {
      type: 'carousel',
      contents: [
        {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#C45A1B',
            paddingAll: '14px',
            contents: [
              { type: 'text', text: 'SCHEDULE & LIVE CLASSES', color: '#ffffff', size: 'xxs', weight: 'bold' },
              { type: 'text', text: '📅 1. Schedule / ตารางเรียน', color: '#ffffff', size: 'md', weight: 'bold' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '14px',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '⚡ "next" / "คาบต่อไป" — Current & next class', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '📅 "today" / "ตารางวันนี้" — Today\'s classes', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '🌅 "tomorrow" / "ตารางพรุ่งนี้" — Tomorrow\'s schedule', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '🗓️ "week" / "ตารางสัปดาห์" — Mon-Fri schedule', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '📌 "schedule mon" / "ตาราง จันทร์" — Specific day', size: 'xs', color: '#1F2937', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '⚡ Next Class', text: 'next' }, style: 'primary', color: '#C45A1B', height: 'sm' },
              { type: 'button', action: { type: 'message', label: '📅 Today', text: 'today' }, style: 'secondary', height: 'sm' }
            ]
          }
        },
        {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#7C3AED',
            paddingAll: '14px',
            contents: [
              { type: 'text', text: 'GEMINI AI MULTIMODAL', color: '#ffffff', size: 'xxs', weight: 'bold' },
              { type: 'text', text: '🤖 2. AI Voice, OCR & Chat', color: '#ffffff', size: 'md', weight: 'bold' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '14px',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '🎤 ส่งคลิปเสียง (Voice Note) — AI ถอดเสียงลงตารางทันที', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '📷 ส่งรูปภาพ/โปสเตอร์ (Vision OCR) — สแกนนัดหมายลงปฏิทิน', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '💬 พิมพ์สั่งง่ายๆ เช่น "Meeting tomorrow 14:00" หรือ "นัดตัดผม พรุ่งนี้ บ่ายสอง"', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '✨ รองรับทั้งภาษาไทย & English ยาวหลายประโยค', size: 'xxs', color: '#7C3AED', weight: 'bold', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '💬 Sample Meeting', text: 'Meeting tomorrow 14:00' }, style: 'primary', color: '#7C3AED', height: 'sm' },
              { type: 'button', action: { type: 'uri', label: '📅 Open E-Calen', uri: safeLineUri(`${liffUrl}${liffUrl.includes('?') ? '&' : '?'}view=dashboard`) }, style: 'secondary', height: 'sm' }
            ]
          }
        },
        {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#DC2626',
            paddingAll: '14px',
            contents: [
              { type: 'text', text: 'SMART CONTEXT & NOTIFICATIONS', color: '#ffffff', size: 'xxs', weight: 'bold' },
              { type: 'text', text: '🔔 3. แจ้งเตือนล่วงหน้า /noti', color: '#ffffff', size: 'md', weight: 'bold' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '14px',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '🔔 "/noti on" / "/noti 15" — เปิดเตือน 15 นาทีก่อนเรียน', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '⚡ "/noti 10 15 30" — แจ้งเตือน 3 รอบ (10, 15, 30 นาที)', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '🚫 "/noti cancel" / "/noti off" — ปิดการแจ้งเตือน', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '🌤️ "weather" / "สภาพอากาศ" — เช็คฝน/อุณหภูมิ ศาลายา', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '💡 ค่าเริ่มต้นคือปิดไว้ (Per-user Setting)', size: 'xxs', color: '#DC2626', weight: 'bold', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '🔔 /noti 15', text: '/noti 15' }, style: 'primary', color: '#DC2626', height: 'sm' },
              { type: 'button', action: { type: 'message', label: '⚡ /noti 10 15 30', text: '/noti 10 15 30' }, style: 'secondary', height: 'sm' }
            ]
          }
        },
        {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#059669',
            paddingAll: '14px',
            contents: [
              { type: 'text', text: 'TASK & MEMO MANAGER', color: '#ffffff', size: 'xxs', weight: 'bold' },
              { type: 'text', text: '📝 4. Tasks & Notes / งาน & โน้ต', color: '#ffffff', size: 'md', weight: 'bold' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '14px',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '➕ "+task <title> due <date>" / "+งาน <ชื่อ> ส่ง <วัน>"', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '📝 "tasks" / "งานค้าง" — ดูรายการงานที่ต้องส่ง', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '✅ "done 1" / "เสร็จ 1" — ติ๊กงานลำดับ 1 ว่าเสร็จแล้ว', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '📌 "+note <text>" / "+โน้ต <ข้อความ>" — จดบันทึกด่วน', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '📋 "notes" / "โน้ต" — ดูโน้ตทั้งหมด / "delnote 1"', size: 'xs', color: '#1F2937', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '📝 Tasks / งานค้าง', text: 'tasks' }, style: 'primary', color: '#059669', height: 'sm' },
              { type: 'button', action: { type: 'message', label: '📌 Notes / โน้ต', text: 'notes' }, style: 'secondary', height: 'sm' }
            ]
          }
        },
        {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#2563EB',
            paddingAll: '14px',
            contents: [
              { type: 'text', text: 'COURSES & EXAM SCHEDULE', color: '#ffffff', size: 'xxs', weight: 'bold' },
              { type: 'text', text: '📚 5. Classroom & Exams / สอบ', color: '#ffffff', size: 'md', weight: 'bold' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '14px',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '📚 "classroom" / "คลาสรูม" — รวมลิงก์ Google Classroom', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '🗓️ "exam" / "ตารางสอบ" — ตารางสอบกลางภาคทุกวิชา', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '⏳ "dday" / "สอบ" — นับถอยหลังวันสอบกลางภาค', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '🔎 "course Physics" / "วิชา ฟิสิกส์" / "SCPY161"', size: 'xs', color: '#1F2937', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '📚 Classroom', text: 'classroom' }, style: 'primary', color: '#2563EB', height: 'sm' },
              { type: 'button', action: { type: 'message', label: '🗓️ Exams / ตารางสอบ', text: 'exam' }, style: 'secondary', height: 'sm' }
            ]
          }
        },
        {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#0284C7',
            paddingAll: '14px',
            contents: [
              { type: 'text', text: 'CAMPUS & STUDY SPACES', color: '#ffffff', size: 'xxs', weight: 'bold' },
              { type: 'text', text: '🏫 6. Campus & Food / บริการ ม.', color: '#ffffff', size: 'md', weight: 'bold' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '14px',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '🚍 "tram" / "รถราง" — สายรถรางฟรี & Salaya Link', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '📖 "library" / "ห้องสมุด" — เวลาเปิดหอสมุด & Co-Working', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '🚨 "emergency" / "ฉุกเฉิน" — เบอร์ รปภ. 24 ชม. & แพทย์', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '🍽️ "food" / "กินไรดี" — สุ่มเมนู/ร้านเด็ดแถวมหิดล!', size: 'xs', color: '#1F2937', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '🚍 Tram / รถราง', text: 'tram' }, style: 'primary', color: '#0284C7', height: 'sm' },
              { type: 'button', action: { type: 'message', label: '🍽️ Food / กินไรดี', text: 'food' }, style: 'secondary', height: 'sm' }
            ]
          }
        },
        {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#4338CA',
            paddingAll: '14px',
            contents: [
              { type: 'text', text: 'PLANNING & PROFILE', color: '#ffffff', size: 'xxs', weight: 'bold' },
              { type: 'text', text: '📊 7. Free Time & GPA / วางแผน', color: '#ffffff', size: 'md', weight: 'bold' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '14px',
            spacing: 'sm',
            contents: [
              { type: 'text', text: '🕒 "freetime" / "เวลาว่าง" — คำนวณช่วงว่างระหว่างคาบ', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '🎯 "gpa" / "เป้าเกรด" — แผนพิชิตเป้า GPA 3.50+', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '📊 "credits" / "หน่วยกิต" — สรุปหน่วยกิตเทอมนี้', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '👤 "profile" / "โปรไฟล์" — ดูสถานะบัญชี & Cloud Sync', size: 'xs', color: '#1F2937', wrap: true },
              { type: 'text', text: '🍅 "focus" / "โฟกัส" — เทคนิค Pomodoro & อ่านหนังสือ', size: 'xs', color: '#1F2937', wrap: true }
            ]
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'message', label: '🕒 Free Time', text: 'freetime' }, style: 'primary', color: '#4338CA', height: 'sm' },
              { type: 'button', action: { type: 'message', label: '👤 Profile', text: 'profile' }, style: 'secondary', height: 'sm' }
            ]
          }
        }
      ]
    }
  };
}

// ─── Automated Notification & Smart Context Scheduler Loop (Runs every 60s) ──────────
const sentReminderKeys = new Set();

setInterval(async () => {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentHHMM = String(currentHour).padStart(2, '0') + ':' + String(currentMinute).padStart(2, '0');
    const todayDateStr = now.toISOString().slice(0, 10);

    if (sentReminderKeys.size > 800) sentReminderKeys.clear();

    const activeUserIds = new Set([
      '1',
      ...Object.values(store._users || {}).map(u => u.id),
      ...Object.values(store._lineUsers || {})
    ]);

    // Fetch real-time weather context (cached 30m)
    let weatherInfo = null;
    try {
      weatherInfo = await fetchSalayaWeather();
    } catch (_) {}

    // ─── 1. Daily Digest: Morning Brief (08:00) ───
    if (currentHHMM === '08:00') {
      for (const userId of activeUserIds) {
        const userData = (await dbAdapter.getUserData(userId)) || {};
        const notiSettings = userData.notiSettings || { enabled: false, offsets: [15] };

        if (notiSettings.enabled && notiSettings.morningBrief !== false) {
          const morningKey = `morning_${todayDateStr}_${userId}`;
          if (!sentReminderKeys.has(morningKey)) {
            sentReminderKeys.add(morningKey);
            const userObj = Object.values(store._users || {}).find(u => u.id === userId || (u.username && u.username.toLowerCase() === userId.toLowerCase()));
            const isWitchaya = userObj ? (userObj.username && userObj.username.toLowerCase() === 'witchaya') : (userId === '1' || userId === 'default');
            const isBmeUserObj = userObj ? userObj.isBme !== false : (userId === '1');
            const curriculum = (userData.curriculum && Array.isArray(userData.curriculum) && userData.curriculum.length > 0)
              ? userData.curriculum
              : (isBmeUserObj ? DEFAULT_BME_CURRICULUM : []);
            const todayClasses = curriculum.filter(c => c.day === currentDay).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
            const pendingTasks = (userData.tasks || []).filter(t => !t.done);
            const customAppointments = (userData.customBlocks && userData.customBlocks[currentDay]) || [];

            const lineUserId = store._userLine && store._userLine[userId];
            if (lineUserId && hasLine) {
              await sendLinePush(lineUserId, [buildDailyDigestFlex('morning', {
                userName: userObj ? userObj.displayName || userObj.username : 'นักศึกษา',
                dateStr: todayDateStr,
                classes: todayClasses,
                tasks: pendingTasks,
                appointments: customAppointments,
                weather: weatherInfo
              })]);
            }
          }
        }
      }
    }

    // ─── 2. Daily Digest: Evening Wrap-up (20:00) ───
    if (currentHHMM === '20:00') {
      for (const userId of activeUserIds) {
        const userData = (await dbAdapter.getUserData(userId)) || {};
        const notiSettings = userData.notiSettings || { enabled: false, offsets: [15] };

        if (notiSettings.enabled && notiSettings.eveningWrapup !== false) {
          const eveningKey = `evening_${todayDateStr}_${userId}`;
          if (!sentReminderKeys.has(eveningKey)) {
            sentReminderKeys.add(eveningKey);
            const userObj = Object.values(store._users || {}).find(u => u.id === userId || (u.username && u.username.toLowerCase() === userId.toLowerCase()));
            const isBmeUserObj = userObj ? userObj.isBme !== false : (userId === '1');
            const curriculum = (userData.curriculum && Array.isArray(userData.curriculum) && userData.curriculum.length > 0)
              ? userData.curriculum
              : (isBmeUserObj ? DEFAULT_BME_CURRICULUM : []);
            const tomorrowDay = days[(now.getDay() + 1) % 7];
            const tomorrowClasses = curriculum.filter(c => c.day === tomorrowDay).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
            const completedTasks = (userData.tasks || []).filter(t => t.done && t.completedAt && t.completedAt.startsWith(todayDateStr));
            const remainingTasks = (userData.tasks || []).filter(t => !t.done);

            const lineUserId = store._userLine && store._userLine[userId];
            if (lineUserId && hasLine) {
              await sendLinePush(lineUserId, [buildDailyDigestFlex('evening', {
                userName: userObj ? userObj.displayName || userObj.username : 'นักศึกษา',
                dateStr: todayDateStr,
                completedTasks,
                remainingTasks,
                tomorrowClasses
              })]);
            }
          }
        }
      }
    }

    // ─── 3. Pre-Class Multi-Stage Flexible Reminders (/noti) ───
    for (const userId of activeUserIds) {
      const userData = (await dbAdapter.getUserData(userId)) || {};
      const notiSettings = userData.notiSettings || { enabled: false, offsets: [15] };

      // Individual Per-User Setting (Default is OFF per user requirement!)
      if (!notiSettings.enabled) continue;

      // Check active Snooze
      if (notiSettings.snoozeUntil && Date.now() < notiSettings.snoozeUntil) {
        continue;
      }

      const userObj = Object.values(store._users || {}).find(u => u.id === userId || (u.username && u.username.toLowerCase() === userId.toLowerCase()));
      const isBmeUserObj = userObj ? userObj.isBme !== false : (userId === '1');
      const curriculum = (userData.curriculum && Array.isArray(userData.curriculum) && userData.curriculum.length > 0)
        ? userData.curriculum
        : (isBmeUserObj ? DEFAULT_BME_CURRICULUM : []);

      const offsets = Array.isArray(notiSettings.offsets) && notiSettings.offsets.length > 0
        ? notiSettings.offsets
        : [15];

      for (const offsetMin of offsets) {
        const targetTime = new Date(now.getTime() + offsetMin * 60 * 1000);
        const targetHHMM = String(targetTime.getHours()).padStart(2, '0') + ':' + String(targetTime.getMinutes()).padStart(2, '0');

        for (const course of curriculum) {
          if (course.day === currentDay && course.start === targetHHMM) {
            const reminderKey = `${todayDateStr}_${userId}_${course.code}_${course.start}_${offsetMin}m`;
            if (sentReminderKeys.has(reminderKey)) continue;
            sentReminderKeys.add(reminderKey);

            const milestoneLabel = `อีก ${offsetMin} นาที`;
            const milestoneColor = offsetMin <= 15 ? '#DC2626' : '#D97706';

            console.log(`⏰ [Auto-Reminder] ${offsetMin}-min pre-class alert triggered for ${course.code} to user [${userId}]`);

            // 1. Send Web Push
            const subs = await dbAdapter.getPushSubscriptions(userId);
            if (subs && subs.length > 0 && webpush && vapidKeys.publicKey) {
              const pushPayload = JSON.stringify({
                title: `⏰ อีก ${offsetMin} นาทีเริ่มเรียน: ${course.code}`,
                body: `${course.name} (${course.start} - ${course.end} น.) ห้อง ${course.room || '-'}`,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                data: { url: '/' }
              });
              subs.forEach(s => {
                webpush.sendNotification(s, pushPayload, {
                  TTL: 60,
                  urgency: 'high',
                  vapidDetails: {
                    subject: process.env.VAPID_SUBJECT || 'mailto:support@hopeese.com',
                    publicKey: vapidKeys.publicKey,
                    privateKey: vapidKeys.privateKey
                  }
                }).catch(() => {});
              });
            }

            // 2. Send LINE Push with Interactive Action Buttons & Weather Alert Context
            const lineUserId = store._userLine && store._userLine[userId];
            if (lineUserId && hasLine) {
              await sendLinePush(lineUserId, [buildClassReminderFlex(course, milestoneLabel, milestoneColor, weatherInfo, notiSettings)]);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Automated reminder timer error:', err.message);
  }
}, 60 * 1000);

// ─── HTTP Server & API Routing ─────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sync-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // ─── Helper: Parse JSON Body with size limit ───
  function parseJsonBody(callback) {
    let chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        aborted = true;
        req.destroy();
        callback(new Error('Body too large'), null, Buffer.alloc(0));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      const rawBuffer = Buffer.concat(chunks);
      const rawString = rawBuffer.toString('utf8');
      try {
        const parsed = JSON.parse(rawString || '{}');
        callback(null, parsed, rawBuffer);
      } catch (e) {
        callback(e, null, rawBuffer);
      }
    });
  }

  // ─── Helper: Authenticate Token ───
  function getAuthUser() {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim() || url.searchParams.get('token');
    if (!token) return null;
    const session = store._sessions[token];
    if (!session) return null;
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      delete store._sessions[token];
      return null;
    }
    return store._users[session.username] || null;
  }

  // ─── Helper: Resolve owner sync key from auth session or header ───
  function resolveOwnerId(body) {
    const user = getAuthUser();
    if (user) return user.id;
    const headerKey = (req.headers['x-sync-key'] || '').trim();
    if (headerKey) return headerKey;
    if (body && body.syncKey) return body.syncKey;
    return '1';
  }

  // ─── API: File Upload (POST /api/upload) ───
  if (pathname === '/api/upload' && req.method === 'POST') {
    const ownerId = resolveOwnerId({});
    const fileId = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(url.searchParams.get('name') || '').toLowerCase() || '.bin';
    const safeExt = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) ? ext : '.bin';
    const filename = `${fileId}${safeExt}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    const writeStream = fs.createWriteStream(filePath);
    let size = 0;
    let aborted = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        aborted = true;
        req.destroy();
        writeStream.destroy();
        fs.unlink(filePath, () => {});
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File too large' }));
        return;
      }
      writeStream.write(chunk);
    });
    req.on('end', async () => {
      if (aborted) return;
      writeStream.end();
      let fileUrl = `/uploads/${filename}`;
      let uploadedToR2 = false;

      // Upload to Cloudflare R2 if configured
      if (r2Client) {
        try {
          const { PutObjectCommand } = require('@aws-sdk/client-s3');
          const fileBuffer = fs.readFileSync(filePath);
          const contentType = safeExt === '.pdf' ? 'application/pdf' :
                              safeExt === '.png' ? 'image/png' :
                              safeExt === '.jpg' || safeExt === '.jpeg' ? 'image/jpeg' :
                              safeExt === '.webp' ? 'image/webp' : 'application/octet-stream';

          await r2Client.send(new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: filename,
            Body: fileBuffer,
            ContentType: contentType
          }));

          uploadedToR2 = true;
          console.log(`☁️ File uploaded to Cloudflare R2: ${filename} (Served via /uploads/${filename})`);
        } catch (r2Err) {
          console.warn('⚠️ Cloudflare R2 upload failed, keeping local file URL fallback:', r2Err.message);
        }
      }

      // Store file metadata in unified user data
      const ownerData = (await dbAdapter.getUserData(ownerId)) || {};
      if (!ownerData.files) ownerData.files = {};
      const fileRecord = {
        id: fileId,
        name: url.searchParams.get('name') || filename,
        url: fileUrl,
        size,
        uploadedToR2,
        uploadedAt: new Date().toISOString()
      };
      ownerData.files[fileId] = fileRecord;

      if (!ownerData.studyLinks) ownerData.studyLinks = [];
      const ext = path.extname(filename).toLowerCase();
      const fileType = ext === '.pdf' ? 'pdf' : (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) ? 'image' : 'file';
      const studyEntry = {
        id: `file-${fileId}`,
        title: url.searchParams.get('name') || filename,
        sub: `Web Upload (${(size / 1024).toFixed(1)} KB)`,
        type: fileType,
        url: fileUrl,
        desc: `อัปโหลดผ่านเว็บเมื่อ ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
        folderId: 'f-uploads',
        createdAt: new Date().toISOString()
      };
      ownerData.studyLinks.unshift(studyEntry);
      ownerData.version = (parseInt(ownerData.version, 10) || 0) + 1;
      ownerData.updatedAt = new Date().toISOString();

      await dbAdapter.saveUserData(ownerId, ownerData);
      store[ownerId] = ownerData;
      saveStore();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, file: fileRecord, studyLink: studyEntry }));
    });
    return;
  }

  // ─── API: Study Tools - OmniLoad Engine Status (GET /api/study-tools/status) ───
  if (pathname === '/api/study-tools/status' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const probe = await probeOmniLoadUrl();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      connected: probe.connected,
      isProduction: IS_PRODUCTION,
      omniload_url: probe.url,
      ...(probe.data || {})
    }));
    return;
  }

  // ─── API: Study Tools - Extract Media Info (POST /api/study-tools/media-info) ───
  if (pathname === '/api/study-tools/media-info' && req.method === 'POST') {
    parseJsonBody(async (err, data) => {
      if (err || !data || !data.url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing media URL' }));
        return;
      }
      try {
        const response = await fetch(`${activeOmniLoadUrl}/api/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: data.url }),
          signal: AbortSignal.timeout(15000)
        });
        const result = await response.json();
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to communicate with OmniLoad engine', detail: e.message }));
      }
    });
    return;
  }

  // ─── API: Study Tools - Import Media to Course/Vault (POST /api/study-tools/import-media) ───
  if (pathname === '/api/study-tools/import-media' && req.method === 'POST') {
    parseJsonBody(async (err, data) => {
      if (err || !data || !data.url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing media URL' }));
        return;
      }

      const ownerId = resolveOwnerId(data);
      const { url: mediaUrl, formatType = 'mp4', quality = 'best', courseCode = '', customTitle = '', folderId = 'f-uploads' } = data;

      try {
        // 1. Trigger download on OmniLoad
        const dlRes = await fetch(`${activeOmniLoadUrl}/api/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: mediaUrl,
            format_type: formatType === 'mp3' ? 'mp3' : 'mp4',
            quality: quality,
            custom_title: customTitle
          }),
          signal: AbortSignal.timeout(10000)
        });

        const dlData = await dlRes.json();
        if (!dlRes.ok || !dlData.success) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: dlData.detail || dlData.error || 'Download failed to start' }));
          return;
        }

        const taskId = dlData.task_id;
        
        // 2. Poll OmniLoad until download task completes (max 60s)
        let completedTask = null;
        let taskError = null;
        const startTime = Date.now();

        while (Date.now() - startTime < 60000) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const taskRes = await fetch(`${activeOmniLoadUrl}/api/tasks/${taskId}`);
            if (taskRes.ok) {
              const taskInfo = await taskRes.json();
              if (taskInfo.status === 'completed') {
                completedTask = taskInfo;
                break;
              } else if (taskInfo.status === 'error') {
                taskError = taskInfo.error || 'Download task failed on engine';
                break;
              }
            }
          } catch (tErr) {
            console.warn('Task polling warning:', tErr.message);
          }
        }

        if (taskError) {
          throw new Error(taskError);
        }

        if (!completedTask || !completedTask.filename) {
          throw new Error('Download timed out or failed to complete on media engine');
        }

        // 3. Fetch downloaded binary from OmniLoad
        const fileStreamRes = await fetch(`${activeOmniLoadUrl}/downloads/${encodeURIComponent(completedTask.filename)}`);
        if (!fileStreamRes.ok) {
          throw new Error('Could not retrieve downloaded file from engine');
        }

        const fileBuffer = Buffer.from(await fileStreamRes.arrayBuffer());
        const fileId = crypto.randomBytes(8).toString('hex');
        const rawExt = path.extname(completedTask.filename) || (formatType === 'mp3' ? '.mp3' : '.mp4');
        const targetFilename = `${fileId}${rawExt}`;
        const localFilePath = path.join(UPLOAD_DIR, targetFilename);

        fs.writeFileSync(localFilePath, fileBuffer);

        let fileUrl = `/uploads/${targetFilename}`;
        let uploadedToR2 = false;

        // 4. Save to Cloudflare R2 if configured
        if (r2Client) {
          try {
            const { PutObjectCommand } = require('@aws-sdk/client-s3');
            const contentType = rawExt === '.mp3' ? 'audio/mpeg' : 'video/mp4';
            await r2Client.send(new PutObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: targetFilename,
              Body: fileBuffer,
              ContentType: contentType
            }));
            uploadedToR2 = true;
          } catch (r2Err) {
            console.warn('⚠️ Cloudflare R2 media upload warning:', r2Err.message);
          }
        }

        // 5. Store file & study link in Project 10 User Data
        const ownerData = (await dbAdapter.getUserData(ownerId)) || {};
        if (!ownerData.files) ownerData.files = {};
        
        const displayName = customTitle || completedTask.title || completedTask.filename;
        const fileRecord = {
          id: fileId,
          name: displayName,
          filename: targetFilename,
          url: fileUrl,
          size: fileBuffer.length,
          uploadedToR2,
          uploadedAt: new Date().toISOString()
        };
        ownerData.files[fileId] = fileRecord;

        if (!ownerData.studyLinks) ownerData.studyLinks = [];
        const studyEntry = {
          id: `media-${fileId}`,
          title: displayName,
          sub: courseCode ? `วิชา ${courseCode} (${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB)` : `Media Import (${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB)`,
          type: formatType === 'mp3' ? 'audio' : 'video',
          url: fileUrl,
          courseCode: courseCode || null,
          sourceUrl: mediaUrl,
          desc: `นำเข้าจาก ${completedTask.platform || 'Online URL'} เมื่อ ${new Date().toLocaleString('th-TH')}`,
          folderId: folderId || 'f-uploads',
          createdAt: new Date().toISOString()
        };
        ownerData.studyLinks.unshift(studyEntry);

        ownerData.version = (parseInt(ownerData.version, 10) || 0) + 1;
        ownerData.updatedAt = new Date().toISOString();

        await dbAdapter.saveUserData(ownerId, ownerData);
        store[ownerId] = ownerData;
        saveStore();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          file: fileRecord,
          studyLink: studyEntry,
          title: displayName,
          url: fileUrl
        }));

      } catch (e) {
        console.error('Import media error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || 'Import media failed' }));
      }
    });
    return;
  }

  // ─── API: Study Tools - Convert PDF to Slide Images (POST /api/study-tools/convert-pdf-to-slides) ───
  if (pathname === '/api/study-tools/convert-pdf-to-slides' && req.method === 'POST') {
    parseJsonBody(async (err, data) => {
      if (err || !data || (!data.fileUrl && !data.fileId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing fileUrl or fileId of PDF' }));
        return;
      }

      const ownerId = resolveOwnerId(data);
      const { fileUrl, format = 'jpg', dpi = 150, quality = 90 } = data;

      try {
        // Resolve local file path or stream from R2
        let pdfBuffer = null;
        const filename = path.basename(fileUrl);
        const localPath = path.join(UPLOAD_DIR, filename);

        if (fs.existsSync(localPath)) {
          pdfBuffer = fs.readFileSync(localPath);
        } else if (r2Client) {
          const { GetObjectCommand } = require('@aws-sdk/client-s3');
          const r2Res = await r2Client.send(new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: filename
          }));
          const chunks = [];
          for await (const chunk of r2Res.Body) chunks.push(chunk);
          pdfBuffer = Buffer.concat(chunks);
        } else {
          throw new Error('PDF file not found on server storage');
        }

        // Send Multipart Form Data to OmniLoad /api/convert/pdf-to-images
        const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
        const formBuffers = [];

        formBuffers.push(Buffer.from(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
          `Content-Type: application/pdf\r\n\r\n`
        ));
        formBuffers.push(pdfBuffer);
        formBuffers.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="output_format"\r\n\r\n${format}`));
        formBuffers.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="dpi"\r\n\r\n${dpi}`));
        formBuffers.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="quality"\r\n\r\n${quality}`));
        formBuffers.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const fullBody = Buffer.concat(formBuffers);

        const convRes = await fetch(`${activeOmniLoadUrl}/api/convert/pdf-to-images`, {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': fullBody.length.toString()
          },
          body: fullBody,
          signal: AbortSignal.timeout(60000)
        });

        const convData = await convRes.json();
        if (!convRes.ok || !convData.success) {
          throw new Error(convData.detail || 'PDF Conversion failed on engine');
        }

        // Save generated page images into Project 10 storage
        const savedPages = [];
        for (const page of (convData.pages || [])) {
          const imgRes = await fetch(`${activeOmniLoadUrl}/downloads/${encodeURIComponent(page.filename)}`);
          if (imgRes.ok) {
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
            const imgTargetName = `${crypto.randomBytes(6).toString('hex')}_${page.filename}`;
            const imgLocalPath = path.join(UPLOAD_DIR, imgTargetName);
            fs.writeFileSync(imgLocalPath, imgBuffer);

            if (r2Client) {
              try {
                const { PutObjectCommand } = require('@aws-sdk/client-s3');
                await r2Client.send(new PutObjectCommand({
                  Bucket: R2_BUCKET_NAME,
                  Key: imgTargetName,
                  Body: imgBuffer,
                  ContentType: format === 'png' ? 'image/png' : 'image/jpeg'
                }));
              } catch (_) {}
            }

            savedPages.push({
              page: page.page,
              url: `/uploads/${imgTargetName}`,
              filename: imgTargetName,
              width: page.width,
              height: page.height
            });
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          totalPages: convData.total_pages,
          pages: savedPages
        }));

      } catch (e) {
        console.error('PDF to slides error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || 'PDF slide extraction failed' }));
      }
    });
    return;
  }

  // ─── API: Delete File / Resource (POST /api/files/delete) ───
  if (pathname === '/api/files/delete' && req.method === 'POST') {
    parseJsonBody(async (err, body) => {
      if (err || !body) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid body' }));
        return;
      }
      const ownerId = resolveOwnerId(body);
      const targetId = body.id;
      const targetUrl = body.url;

      const ownerData = (await dbAdapter.getUserData(ownerId)) || {};
      let fileDeleted = false;

      // 1. Remove from ownerData.files
      if (ownerData.files && typeof ownerData.files === 'object') {
        Object.keys(ownerData.files).forEach(fId => {
          const f = ownerData.files[fId];
          if ((targetId && (fId === targetId || `file-${fId}` === targetId)) || (targetUrl && f.url === targetUrl)) {
            // Delete physical file if local
            if (f.url && f.url.startsWith('/uploads/')) {
              const filename = path.basename(f.url);
              const localPath = path.join(UPLOAD_DIR, filename);
              fs.unlink(localPath, () => {});
            }
            delete ownerData.files[fId];
            fileDeleted = true;
          }
        });
      }

      // 2. Remove from ownerData.studyLinks
      if (ownerData.studyLinks && Array.isArray(ownerData.studyLinks)) {
        const initialLen = ownerData.studyLinks.length;
        ownerData.studyLinks = ownerData.studyLinks.filter(l => {
          if (targetId && l.id === targetId) return false;
          if (targetUrl && l.url === targetUrl) return false;
          return true;
        });
        if (ownerData.studyLinks.length !== initialLen) fileDeleted = true;
      }

      // 3. Save if changes made
      if (fileDeleted) {
        ownerData.version = (parseInt(ownerData.version, 10) || 0) + 1;
        ownerData.updatedAt = new Date().toISOString();
        await dbAdapter.saveUserData(ownerId, ownerData);
        store[ownerId] = ownerData;
        saveStore();
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, deleted: fileDeleted }));
    });
    return;
  }

  // ─── API: Serve Uploaded Files with R2 Stream Fallback (GET /uploads/:filename) ───
  if (pathname.startsWith('/uploads/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const filename = path.basename(pathname);
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!filePath.startsWith(UPLOAD_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const serveFile = async () => {
      // 1. Try local disk
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || (ext === '.pdf' ? 'application/pdf' : 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline');
        res.writeHead(200);
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // 2. Stream from Cloudflare R2
      if (r2Client) {
        try {
          const { GetObjectCommand } = require('@aws-sdk/client-s3');
          const r2Res = await r2Client.send(new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: filename
          }));

          const ext = path.extname(filename).toLowerCase();
          const contentType = r2Res.ContentType || MIME_TYPES[ext] || (ext === '.pdf' ? 'application/pdf' : 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', 'inline');
          if (r2Res.ContentLength) res.setHeader('Content-Length', r2Res.ContentLength);
          res.writeHead(200);
          r2Res.Body.pipe(res);
          return;
        } catch (r2Err) {
          console.warn(`⚠️ R2 GetObject failed for /uploads/${filename}:`, r2Err.message);
        }
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: File does not exist');
    };

    serveFile();
    return;
  }

  // ─── API: Proxy Remote PDF / Document Assets (GET /api/proxy?url=...) ───
  if (pathname === '/api/proxy' && req.method === 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const targetUrl = url.searchParams.get('url');
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or missing target URL parameter' }));
      return;
    }

    try {
      const parsedTarget = new URL(targetUrl);
      const isHttps = parsedTarget.protocol === 'https:';
      const client = isHttps ? https : http;

      const proxyReq = client.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }, (proxyRes) => {
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
          let nextUrl = proxyRes.headers.location;
          if (!nextUrl.startsWith('http')) {
            nextUrl = new URL(nextUrl, targetUrl).toString();
          }
          res.writeHead(302, { 'Location': `/api/proxy?url=${encodeURIComponent(nextUrl)}` });
          res.end();
          return;
        }

        const ext = path.extname(parsedTarget.pathname).toLowerCase();
        const contentType = proxyRes.headers['content-type'] || MIME_TYPES[ext] || (ext === '.pdf' ? 'application/pdf' : 'application/octet-stream');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
        res.writeHead(proxyRes.statusCode || 200);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.warn('⚠️ Proxy request failed:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch remote asset', message: err.message }));
      });
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ─── API: Public Study & Curriculum Hub (GET /api/public/hub) ───
  if (pathname === '/api/public/hub' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    
    let masterData = store['1'] || store['u_admin'] || null;
    if (!masterData) {
      const adminUser = Object.values(store._users || {}).find(u => u && u.role === 'admin');
      if (adminUser) masterData = store[adminUser.id];
    }
    if (!masterData) masterData = {};

    const cur = (masterData.curriculum && masterData.curriculum.length > 0) ? masterData.curriculum : DEFAULT_BME_CURRICULUM;
    const links = (masterData.studyLinks && masterData.studyLinks.length > 0)
      ? masterData.studyLinks.filter(l => l.isShared === true)
      : DEFAULT_BME_STUDY_LINKS.filter(l => l.isShared === true);
    const sharedFolderIds = new Set(links.map(l => l.folderId).filter(Boolean));
    const folders = (masterData.studyFolders || []).filter(f => sharedFolderIds.has(f.id));

    const publicHub = {
      curriculum: cur,
      studyFolders: folders,
      studyLinks: links,
      updatedAt: masterData.updatedAt || new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(publicHub));
    return;
  }

  // ─── API: Create Share Bundle (POST /api/share) ───
  if (pathname === '/api/share' && req.method === 'POST') {
    parseJsonBody((err, data) => {
      if (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const ownerId = resolveOwnerId(data);
      const source = store[ownerId] || {};

      const resourceIds = Array.isArray(data.resourceIds) ? data.resourceIds : [];
      const folderIds = Array.isArray(data.folders) ? data.folders : [];
      const label = (data.label || 'เอกสารที่แชร์').trim();

      const allLinks = Array.isArray(source.studyLinks) ? source.studyLinks : [];
      let selected = [];

      if (resourceIds.length > 0 || folderIds.length > 0) {
        selected = allLinks.filter(l => resourceIds.includes(l.id) || folderIds.includes(l.folderId));
      } else {
        selected = allLinks.filter(l => l.isShared === true);
      }

      // Include file data for uploaded files
      const safeResources = selected.map(l => {
        const safe = {
          id: l.id,
          title: l.title,
          sub: l.sub,
          type: l.type,
          url: l.url,
          desc: l.desc,
          folderId: l.folderId
        };
        // If this is an uploaded file, include the file data
        if (l.fileId && source.files && source.files[l.fileId]) {
          safe.fileId = l.fileId;
          safe.fileUrl = source.files[l.fileId].url;
          safe.fileName = source.files[l.fileId].name;
        }
        return safe;
      });

      const token = generateShareToken();
      store._shares[token] = {
        label,
        resources: safeResources,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      saveStore();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, token }));
    });
    return;
  }

  // ─── API: Fetch Share Bundle (GET /api/share/:token) ───
  if (pathname.startsWith('/api/share/') && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const token = decodeURIComponent(pathname.replace('/api/share/', '')).trim();
    if (!token || !store._shares[token]) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Share link not found or expired' }));
      return;
    }
    const bundle = store._shares[token];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      label: bundle.label,
      resources: bundle.resources || [],
      updatedAt: bundle.updatedAt || bundle.createdAt
    }));
    return;
  }

  // ─── API: Backup Download (GET /api/backup) ───
  if (pathname === '/api/backup' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="ecalendar-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(store, null, 2));
    return;
  }

  // ─── API: Auth Register (POST /api/auth/register) ───
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    parseJsonBody(async (err, data) => {
      if (err || !data.username || !data.password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'กรุณากรอก Username และ Password' }));
        return;
      }

      const username = data.username.toLowerCase().trim();
      if (username.length < 3) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Username ต้องมีความยาวอย่างน้อย 3 ตัวอักษร' }));
        return;
      }

      // Check fresh from Supabase if not loaded
      if (supabase && (!store._users || Object.keys(store._users).length === 0)) {
        await dbAdapter.loadSystemAuth();
      }

      if (store._users && store._users[username]) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Username นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น' }));
        return;
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(data.password, salt);
      const isFirstUser = Object.keys(store._users || {}).length === 0;
      const role = isFirstUser ? 'admin' : 'student';
      const isBme = data.isBme !== false && data.isBme !== 'false';
      const userId = 'u_' + username;
      const calendarKey = generateCalendarKey();

      const user = {
        id: userId,
        username,
        displayName: sanitizeDisplayName(data.displayName || username),
        passwordHash,
        salt,
        role,
        isBme: !!isBme,
        calendarKey,
        createdAt: new Date().toISOString()
      };

      if (!store._users) store._users = {};
      if (!store._calKeys) store._calKeys = {};
      if (!store._sessions) store._sessions = {};

      store._users[username] = user;
      store._calKeys[calendarKey] = userId;

      const isWitchaya = username.toLowerCase() === 'witchaya';
      const masterTemplate = (isWitchaya || isBme) ? ((await dbAdapter.getUserData('1')) || (await dbAdapter.getUserData('u_admin')) || store['1'] || {}) : {};
      const defaultBmeFolders = [
        { id: 'f-classroom', name: '📚 Google Classroom', icon: '🏫', count: 0 },
        { id: 'f-drive',     name: '📁 Google Drive รวมชีท', icon: '☁️', count: 0 },
        { id: 'f-handbook',  name: '📖 คู่มือ BME & มหิดล', icon: '📘', count: 0 },
        { id: 'f-notes',     name: '📝 บันทึกสรุป (Notes)', icon: '📌', count: 0 },
        { id: 'f-uploads',   name: '📤 ไฟล์อัปโหลด (Uploads)', icon: '📂', count: 0 }
      ];

      const initialUserData = {
        version: 1,
        updatedAt: new Date().toISOString(),
        isBme: !!isBme,
        checklist: {},
        subjects: {},
        customBlocks: {},
        curriculum: isBme ? (masterTemplate.curriculum || DEFAULT_BME_CURRICULUM || []) : [],
        studyFolders: isBme ? (masterTemplate.studyFolders || defaultBmeFolders) : [],
        studyLinks: isBme ? ((masterTemplate.studyLinks && masterTemplate.studyLinks.length > 0) ? masterTemplate.studyLinks.filter(l => l && l.isShared !== false) : DEFAULT_BME_STUDY_LINKS) : [],
        files: {}
      };

      // 1. Save new user data template directly into Supabase PostgreSQL
      await dbAdapter.saveUserData(userId, initialUserData);

      // 2. Create session with 30-day expiry
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      store._sessions[token] = { userId, username, role, isBme: !!isBme, expiresAt };

      // 3. Save all users & sessions directly into Supabase PostgreSQL
      await dbAdapter.saveSystemAuth();
      saveStore();

      console.log(`✅ New user registered & saved permanently to Supabase: ${username} (${role}, isBme=${isBme})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          isBme: user.isBme,
          calendarKey: user.calendarKey
        }
      }));
    });
    return;
  }

  // ─── API: Auth Login (POST /api/auth/login) ───
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    parseJsonBody(async (err, data) => {
      if (err || !data.username || !data.password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'กรุณากรอก Username และ Password' }));
        return;
      }

      const username = data.username.toLowerCase().trim();

      // Ensure fresh users from Supabase
      if (!store._users || !store._users[username]) {
        await dbAdapter.loadSystemAuth();
      }

      const user = store._users && store._users[username];

      if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ไม่พบบัญชีผู้ใช้นี้' }));
        return;
      }

      const inputHash = hashPassword(data.password, user.salt);
      if (inputHash !== user.passwordHash) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'รหัสผ่านไม่ถูกต้อง' }));
        return;
      }

      if (!user.calendarKey) {
        user.calendarKey = generateCalendarKey();
        store._calKeys[user.calendarKey] = user.id;
      }

      // Create session with 30-day expiry (persistent login)
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      if (!store._sessions) store._sessions = {};
      store._sessions[token] = { userId: user.id, username, role: user.role, expiresAt };

      await dbAdapter.saveSystemAuth();
      saveStore();

      console.log(`✅ User logged in: ${username}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          isBme: user.isBme !== false,
          calendarKey: user.calendarKey
        }
      }));
    });
    return;
  }

  // ─── API: Auth Me (GET /api/auth/me) ───
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = getAuthUser();
    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized or session expired' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        isBme: user.isBme !== false,
        calendarKey: user.calendarKey
      }
    }));
    return;
  }

  // ─── API: Auth Logout (POST /api/auth/logout) ───
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token && store._sessions && store._sessions[token]) {
      delete store._sessions[token];
      await dbAdapter.saveSystemAuth();
      saveStore();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // ─── API: Admin Delete Users (POST /api/admin/delete-users) ───
  if (pathname === '/api/admin/delete-users' && req.method === 'POST') {
    parseJsonBody(async (err, data) => {
      if (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }
      const usernames = Array.isArray(data.usernames) ? data.usernames : [data.username].filter(Boolean);
      const results = {};
      for (const u of usernames) {
        results[u] = await dbAdapter.deleteUser(u);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        deleted: results,
        remaining_users: Object.keys(store._users || {})
      }));
    });
    return;
  }

  // ─── API: System Health & Cloud Connection Status (GET /api/health) ───
  if (pathname === '/api/health' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');

    let supabaseDiagnostics = {
      connected: Boolean(supabase),
      table_status: 'not_configured',
      persisted_users: Object.keys(store._users || {}),
      persisted_users_count: Object.keys(store._users || {}).length,
      error: null
    };

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('user_sync_data')
          .select('user_id')
          .limit(10);
        if (error) {
          supabaseDiagnostics.table_status = 'error';
          supabaseDiagnostics.error = error.message;
        } else {
          supabaseDiagnostics.table_status = 'ok';
          supabaseDiagnostics.records_in_table = data ? data.length : 0;
          supabaseDiagnostics.sample_user_ids = data ? data.map(r => r.user_id) : [];
        }
      } catch (err) {
        supabaseDiagnostics.table_status = 'exception';
        supabaseDiagnostics.error = err.message;
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      environment: IS_PRODUCTION ? 'production' : 'development',
      storage: {
        provider: r2Client ? 'cloudflare_r2' : 'local_ephemeral_fallback',
        r2_connected: Boolean(r2Client),
        bucket: R2_BUCKET_NAME || null,
        publicDomain: R2_PUBLIC_DOMAIN || null
      },
      database: {
        provider: supabase ? 'supabase_postgresql' : 'local_ephemeral_fallback',
        ...supabaseDiagnostics
      },
      push_notifications: {
        enabled: Boolean(webpush && vapidKeys.publicKey),
        active_vapid_key: vapidKeys.publicKey ? vapidKeys.publicKey.substring(0, 12) + '...' : null
      },
      line_bot: {
        configured: hasLine,
        linked_users_count: Object.keys(store._lineUsers || {}).length
      },
      timestamp: new Date().toISOString()
    }, null, 2));
    return;
  }

  // ─── API: Web Push VAPID Public Key (GET /api/push/vapid-key) ───
  if (pathname === '/api/push/vapid-key' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      publicKey: vapidKeys.publicKey || '',
      enabled: Boolean(webpush && vapidKeys.publicKey)
    }));
    return;
  }

  // ─── API: Web Push Subscription Status (GET /api/push/status) ───
  if (pathname === '/api/push/status' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const ownerId = resolveOwnerId({});
    const subs = await dbAdapter.getPushSubscriptions(ownerId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      configured: Boolean(webpush && vapidKeys.publicKey),
      deviceCount: subs.length,
      ownerId
    }));
    return;
  }

  // ─── API: Web Push Subscribe (POST /api/push/subscribe) ───
  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    parseJsonBody(async (err, data) => {
      if (err || !data.subscription) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing push subscription' }));
        return;
      }

      const ownerId = resolveOwnerId(data);
      await dbAdapter.savePushSubscription(ownerId, data.subscription);

      const subs = await dbAdapter.getPushSubscriptions(ownerId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Push subscription saved',
        deviceCount: subs.length
      }));
    });
    return;
  }

  // ─── API: Web Push Test / Broadcast (POST /api/push/test) ───
  if (pathname === '/api/push/test' && req.method === 'POST') {
    parseJsonBody(async (err, data) => {
      const ownerId = resolveOwnerId(data);
      const subs = await dbAdapter.getPushSubscriptions(ownerId);

      if (!webpush || !vapidKeys.publicKey || subs.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'ยังไม่มีอุปกรณ์ที่ลงทะเบียนรับการแจ้งเตือนไว้ กรุณากดเปิดใช้งานการแจ้งเตือนบนอุปกรณ์นี้ก่อน'
        }));
        return;
      }

      const title = data.title || '🔔 E-Calendar: ทดสอบแจ้งเตือนทุกอุปกรณ์!';
      const body = data.body || `กำลังส่งแจ้งเตือนไปยัง ${subs.length} อุปกรณ์ของคุณพร้อมกัน 🎉`;

      const payload = JSON.stringify({
        title,
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: '/' }
      });

      let sent = 0;
      let lastErr = null;
      const pushOptions = {
        TTL: 60,
        urgency: 'high',
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT || 'mailto:support@hopeese.com',
          publicKey: vapidKeys.publicKey,
          privateKey: vapidKeys.privateKey
        }
      };

      const sendPromises = subs.map(async (sub) => {
        try {
          if (!sub || !sub.endpoint) return;
          const targetSub = {
            endpoint: sub.endpoint,
            keys: (sub.keys && sub.keys.p256dh) ? sub.keys : (sub.subscription_data && sub.subscription_data.keys ? sub.subscription_data.keys : (sub.keys || {}))
          };
          if (!targetSub.keys || !targetSub.keys.p256dh || !targetSub.keys.auth) {
            console.warn('⚠️ Push subscription missing encryption keys for endpoint:', sub.endpoint);
            lastErr = 'Missing device encryption keys';
            return;
          }
          await webpush.sendNotification(targetSub, payload, pushOptions);
          sent++;
        } catch (pushErr) {
          lastErr = pushErr.body || pushErr.message || (pushErr.statusCode ? `HTTP ${pushErr.statusCode}` : 'Gateway Error');
          console.warn(`Push delivery error to endpoint (Status: ${pushErr.statusCode || 'unknown'}):`, pushErr.body || pushErr.message);
          // Prune stale or expired subscriptions automatically
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404 || pushErr.statusCode === 401 || pushErr.statusCode === 400) {
            if (supabase && sub.endpoint) {
              supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).catch(() => {});
            }
          }
        }
      });

      await Promise.allSettled(sendPromises);

      if (sent === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          sent: 0,
          totalDevices: subs.length,
          error: `ส่งไม่สำเร็จ (${lastErr || 'Token อาจหมดอายุ'}) กรุณากดปุ่ม "ต่ออายุ Token" เพื่อรีเฟรชการเชื่อมต่อ`
        }));
        return;
      }

      // Broadcast to LINE Bot as well if account is linked
      const lineUserId = store._userLine && store._userLine[ownerId];
      let lineSent = false;
      if (lineUserId && hasLine) {
        try {
          await sendLinePush(lineUserId, [
            buildClassReminderFlex({
              code: 'SCPY161',
              name: 'General Physics I (ทดสอบแจ้งเตือน)',
              start: '09:30',
              end: '12:30',
              room: 'L2-002',
              classroomUrl: 'https://classroom.google.com/u/6/c/ODcxMTQzMDA0NzAw'
            }, 'อีก 15 นาที')
          ]);
          lineSent = true;
        } catch (_) {}
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, sent, totalDevices: subs.length, lineSent }));
    });
    return;
  }

  // ─── LINE Event Processing Engine ───────────────────────────
  async function handleLineEvent(event) {
    if (!event || !event.type) return;
    const lineUserId = event.source && event.source.userId;
    const replyToken = event.replyToken;

    if (lineUserId) {
      if (!store._lineUsers) store._lineUsers = {};
      if (!store._userLine) store._userLine = {};
      if (!store._lineUsers[lineUserId]) {
        store._lineUsers[lineUserId] = '1';
      }
      if (!store._userLine['1']) {
        store._userLine['1'] = lineUserId;
      }
      if (store._users && store._users['witchaya'] && !store._userLine[store._users['witchaya'].id]) {
        store._userLine[store._users['witchaya'].id] = lineUserId;
      }
    }

    if (event.type === 'follow') {
      const welcomeText = 
        `👋 สวัสดีครับ! ยินดีต้อนรับสู่ E-Calendar Bot 📚\n\n` +
        `🤖 บอทนี้จะช่วยคุณ:\n` +
        `• แจ้งเตือนคาบเรียนล่วงหน้า 15 นาที\n` +
        `• ดูตารางเรียนรายวัน / รายสัปดาห์\n` +
        `• สั่งจดการบ้านและเช็คงานค้าง\n` +
        `• ค้นหาห้องเรียน และเปิด Google Classroom\n\n` +
        `👉 เริ่มต้นใช้งานโดยพิมพ์:\n` +
        `/link <Username ของคุณ>\n` +
        `เช่น: /link witchaya`;
      await sendLineReply(replyToken, welcomeText);
      return;
    }

    if (event.type === 'postback') {
      const dataStr = (event.postback && event.postback.data) || '';
      const params = new URLSearchParams(dataStr);
      const action = params.get('action');
      const linkedUserId = (store._lineUsers && store._lineUsers[lineUserId]) || '1';
      const userData = (await dbAdapter.getUserData(linkedUserId)) || {};

      if (action === 'snooze') {
        const min = parseInt(params.get('min') || '15', 10);
        if (!userData.notiSettings) userData.notiSettings = { enabled: true, offsets: [15] };
        userData.notiSettings.snoozeUntil = Date.now() + min * 60 * 1000;
        await dbAdapter.saveUserData(linkedUserId, userData);
        store[linkedUserId] = userData;
        saveStore();
        await sendLineReply(replyToken, `⏰ เลื่อนการแจ้งเตือนไปอีก ${min} นาทีเรียบร้อยแล้วครับ!`);
        return;
      }

      if (action === 'set_noti') {
        const offsetsStr = params.get('offsets') || '15';
        const offsets = offsetsStr.split(',').map(Number).filter(n => !isNaN(n) && n > 0);
        userData.notiSettings = {
          ...(userData.notiSettings || {}),
          enabled: true,
          offsets: offsets.length > 0 ? offsets : [15]
        };
        await dbAdapter.saveUserData(linkedUserId, userData);
        store[linkedUserId] = userData;
        saveStore();
        await sendLineReply(replyToken, [buildNotiStatusFlex(userData.notiSettings)]);
        return;
      }

      if (action === 'cancel_noti') {
        userData.notiSettings = {
          ...(userData.notiSettings || {}),
          enabled: false
        };
        await dbAdapter.saveUserData(linkedUserId, userData);
        store[linkedUserId] = userData;
        saveStore();
        await sendLineReply(replyToken, [buildNotiStatusFlex(userData.notiSettings)]);
        return;
      }

      if (action === 'done_task') {
        const taskId = params.get('id');
        const tasks = userData.tasks || userData.todos || [];
        const pending = tasks.filter(t => !t.done);
        let found = tasks.find(t => String(t.id) === String(taskId));
        if (!found && !isNaN(Number(taskId))) {
          const idx = parseInt(taskId, 10) - 1;
          if (idx >= 0 && idx < pending.length) {
            found = pending[idx];
          }
        }
        if (found) {
          found.done = true;
          found.completedAt = new Date().toISOString();
          await dbAdapter.saveUserData(linkedUserId, userData);
          store[linkedUserId] = userData;
          saveStore();
          const remaining = tasks.filter(t => !t.done).length;
          await sendLineReply(replyToken, `🎉 ทำงาน "${found.title || found.text}" เสร็จแล้วเรียบร้อย! ✨\n(เหลืองานค้างอีก ${remaining} รายการ)`);
        } else {
          await sendLineReply(replyToken, '✅ บันทึกสถานะงานเรียบร้อยแล้วครับ');
        }
        return;
      }
      return;
    }

    // ─── Voice / Audio Message Handler (Gemini Multimodal Voice & Problem Solver) ───
    if (event.type === 'message' && event.message && event.message.type === 'audio') {
      const linkedUserId = (store._lineUsers && store._lineUsers[lineUserId]) || '1';
      const audioBuffer = await getLineMessageContent(event.message.id);
      if (!audioBuffer) {
        await sendLineReply(replyToken, '⚠️ ไม่สามารถดาวน์โหลดไฟล์เสียงจาก LINE ได้ กรุณาลองใหม่อีกครั้งครับ');
        return;
      }

      // Auto-save audio note in user's Cloud Vault
      const fileRecord = await saveMediaFileToStorage(
        audioBuffer,
        `voice_memo_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.m4a`,
        '.m4a',
        'audio/mp4',
        linkedUserId
      );

      if (!hasGemini) {
        await sendLineReply(replyToken, `🎤 บันทึกไฟล์เสียงเข้าสู่คลังเอกสารแล้ว (${fileRecord.url})\n\n💡 หากต้องการให้ AI ถอดเสียงและดึงนัดหมายอัตโนมัติ กรุณาใส่ GEMINI_API_KEY บนเซิร์ฟเวอร์ครับ`);
        return;
      }

      const aiResult = await transcribeAudioWithGemini(audioBuffer, 'audio/mp4');
      if (!aiResult) {
        await sendLineReply(replyToken, `🗣️ บันทึกไฟล์เสียงเรียบร้อยแล้ว (${fileRecord.url})\n\n⚠️ AI ไม่สามารถถอดความชัดเจนได้ กรุณาลองพูดใหม่อีกครั้งครับ`);
        return;
      }

      const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
      if (!userData.customBlocks) userData.customBlocks = {};
      if (!userData.tasks) userData.tasks = [];
      if (!userData.quickNotes) userData.quickNotes = [];

      const addedEvents = [];

      if (Array.isArray(aiResult.events)) {
        aiResult.events.forEach(ev => {
          if (!ev.day || !ev.title) return;
          const dayKey = ev.day.toLowerCase();
          if (!userData.customBlocks[dayKey]) userData.customBlocks[dayKey] = [];
          const newBlock = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
            title: ev.title,
            start: ev.start || '09:00',
            end: ev.end || '10:00',
            tag: 'study',
            isStudyBlock: true,
            notes: ev.notes || ev.location || ''
          };
          userData.customBlocks[dayKey].push(newBlock);
          addedEvents.push({ ...ev, id: newBlock.id });
        });
      }

      if (Array.isArray(aiResult.tasks)) {
        aiResult.tasks.forEach(t => {
          if (!t.title) return;
          userData.tasks.push({
            id: Date.now().toString(),
            title: t.title,
            dueDate: t.dueDate || '',
            done: false,
            createdAt: new Date().toISOString()
          });
        });
      }

      if (Array.isArray(aiResult.notes)) {
        aiResult.notes.forEach(n => {
          if (!n) return;
          userData.quickNotes.push({
            id: Date.now().toString(),
            text: n,
            createdAt: new Date().toISOString()
          });
        });
      }

      await dbAdapter.saveUserData(linkedUserId, userData);
      store[linkedUserId] = userData;
      saveStore();

      if (addedEvents.length > 0) {
        await sendLineReply(replyToken, [buildAiEventCreatedFlex(addedEvents, `🗣️ เสียงของคุณ: "${aiResult.transcript || ''}"`, 'Voice Assistant')]);
      } else if (aiResult.response || aiResult.solution) {
        await sendLineReply(replyToken, [buildAiSolutionFlex(aiResult, fileRecord)]);
      } else {
        await sendLineReply(replyToken, `🗣️ ถอดเสียง: "${aiResult.transcript || aiResult.summary || ''}"\n\n✅ บันทึกข้อมูลและจัดเก็บไฟล์เสียงเข้าสู่ระบบเรียบร้อยแล้วครับ!`);
      }
      return;
    }

    // ─── Image Message Handler (Gemini Multimodal Math/Vision OCR & Cloud Vault) ───
    if (event.type === 'message' && event.message && event.message.type === 'image') {
      const linkedUserId = (store._lineUsers && store._lineUsers[lineUserId]) || '1';
      const imageBuffer = await getLineMessageContent(event.message.id);
      if (!imageBuffer) {
        await sendLineReply(replyToken, '⚠️ ไม่สามารถดาวน์โหลดรูปภาพจาก LINE ได้ กรุณาลองใหม่อีกครั้งครับ');
        return;
      }

      // Auto-save image to User's Cloud Vault / File Storage
      const fileRecord = await saveMediaFileToStorage(
        imageBuffer,
        `photo_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.jpg`,
        '.jpg',
        'image/jpeg',
        linkedUserId
      );

      if (!hasGemini) {
        await sendLineReply(replyToken, `🖼️ บันทึกรูปภาพเข้าสู่คลังเอกสารเรียบร้อยแล้ว (${fileRecord.url})\n\n💡 หากต้องการให้ AI สแกนโจทย์คำนวณหรืออ่านตาราง กรุณาตั้งค่า GEMINI_API_KEY บน Railway ครับ`);
        return;
      }

      const aiResult = await analyzeImageWithGemini(imageBuffer, 'image/jpeg');
      if (!aiResult) {
        await sendLineReply(replyToken, [
          buildAiSolutionFlex({
            title: '🖼️ บันทึกรูปภาพเข้าสู่คลังเอกสารแล้ว',
            summary: 'บันทึกรูปภาพเข้าสู่คลังเอกสาร E-Calendar เรียบร้อยแล้ว สามารถกดปุ่ม "📂 ดูไฟล์บนเว็บ" ด้านล่างเพื่อเปิดดูรูปภาพได้ทันทีครับ\n\n💡 หากต้องการให้ AI สแกนโจทย์คำนวณหรืออ่านตาราง กรุณาลองส่งภาพที่มีความคมชัดและแสงสว่างเพียงพออีกครั้งครับ'
          }, fileRecord)
        ]);
        return;
      }

      const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
      if (!userData.customBlocks) userData.customBlocks = {};
      if (!userData.tasks) userData.tasks = [];
      if (!userData.quickNotes) userData.quickNotes = [];

      const addedEvents = [];
      if (Array.isArray(aiResult.events)) {
        aiResult.events.forEach(ev => {
          if (!ev.day || !ev.title) return;
          const dayKey = ev.day.toLowerCase();
          if (!userData.customBlocks[dayKey]) userData.customBlocks[dayKey] = [];
          const newBlock = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
            title: ev.title,
            start: ev.start || '09:00',
            end: ev.end || '10:00',
            tag: 'study',
            isStudyBlock: true,
            notes: ev.notes || ev.location || ''
          };
          userData.customBlocks[dayKey].push(newBlock);
          addedEvents.push({ ...ev, id: newBlock.id });
        });
      }

      if (Array.isArray(aiResult.tasks)) {
        aiResult.tasks.forEach(t => {
          if (!t.title) return;
          userData.tasks.push({
            id: Date.now().toString(),
            title: t.title,
            dueDate: t.dueDate || '',
            done: false,
            createdAt: new Date().toISOString()
          });
        });
      }

      if (Array.isArray(aiResult.notes)) {
        aiResult.notes.forEach(n => {
          if (!n) return;
          userData.quickNotes.push({
            id: Date.now().toString(),
            text: n,
            createdAt: new Date().toISOString()
          });
        });
      }

      await dbAdapter.saveUserData(linkedUserId, userData);
      store[linkedUserId] = userData;
      saveStore();

      // Always show AI description/analysis first, append event-saved footnote if needed
      const solutionFlex = buildAiSolutionFlex(aiResult, fileRecord);
      if (addedEvents.length > 0) {
        // Append footnote about saved events to the AI description summary
        const eventNames = addedEvents.map(e => `• ${e.title}`).join('\n');
        if (solutionFlex && solutionFlex.body && solutionFlex.body.contents) {
          solutionFlex.body.contents.push({
            type: 'separator',
            margin: 'md'
          });
          solutionFlex.body.contents.push({
            type: 'text',
            text: `📅 บันทึกลงตารางแล้ว ${addedEvents.length} รายการ:\n${eventNames}`,
            size: 'xs',
            color: '#10B981',
            wrap: true,
            margin: 'md'
          });
        }
      }
      await sendLineReply(replyToken, [solutionFlex]);

    }

    // ─── Document / File Message Handler (PDF / Docs / Cloud Vault) ───
    if (event.type === 'message' && event.message && event.message.type === 'file') {
      const linkedUserId = (store._lineUsers && store._lineUsers[lineUserId]) || '1';
      const originalFileName = event.message.fileName || `document_${Date.now()}.bin`;
      const fileExt = path.extname(originalFileName).toLowerCase() || '.bin';
      const fileBuffer = await getLineMessageContent(event.message.id);

      if (!fileBuffer) {
        await sendLineReply(replyToken, '⚠️ ไม่สามารถดาวน์โหลดไฟล์จาก LINE ได้ กรุณาลองใหม่อีกครั้งครับ');
        return;
      }

      const contentType = fileExt === '.pdf' ? 'application/pdf' : 'application/octet-stream';
      const fileRecord = await saveMediaFileToStorage(
        fileBuffer,
        originalFileName,
        fileExt,
        contentType,
        linkedUserId
      );

      let aiSummary = '';
      if (hasGemini && fileExt === '.pdf') {
        try {
          const prompt = `This is a PDF document titled "${originalFileName}". Provide a concise Thai summary (3-5 bullet points) explaining what this document is about and note any deadlines.`;
          const base64Data = fileBuffer.toString('base64');
          const summaryRes = await callGeminiApi([
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'application/pdf', data: base64Data } }
              ]
            }
          ], 'You are an academic document summarizer for university students.');
          if (summaryRes && (summaryRes.summary || summaryRes.text)) {
            aiSummary = summaryRes.summary || summaryRes.text;
          }
        } catch (sumErr) {
          console.warn('⚠️ PDF Gemini summary warning:', sumErr.message);
        }
      }

      await sendLineReply(replyToken, [buildFileSavedFlex(fileRecord, aiSummary)]);
      return;
    }

    if (event.type === 'message' && event.message && event.message.type === 'text') {
      const text = event.message.text.trim();

      // ─── 1. Command: /link <key> or ผูกบัญชี <key> ───
      const linkMatch = text.match(/^\/?(link|ผูก|ผูกบัญชี)\s*([a-zA-Z0-9_-]+)/i);
      if (linkMatch || (!text.includes(' ') && (store._users[text.toLowerCase()] || store._calKeys[text]))) {
        const targetKey = (linkMatch ? linkMatch[2] : text).toLowerCase();
        let matchedUser = store._users[targetKey];
        if (!matchedUser) {
          const uid = store._calKeys[targetKey];
          if (uid) {
            matchedUser = Object.values(store._users).find(u => u.id === uid);
          }
        }
        if (!matchedUser) {
          matchedUser = Object.values(store._users).find(u => u.id === targetKey || u.username.toLowerCase() === targetKey);
        }

        if (matchedUser) {
          if (!store._lineUsers) store._lineUsers = {};
          if (!store._userLine) store._userLine = {};
          store._lineUsers[lineUserId] = matchedUser.id;
          store._userLine[matchedUser.id] = lineUserId;
          await dbAdapter.saveSystemAuth();
          saveStore();
          
          await sendLineReply(replyToken, [buildLinkSuccessFlex(matchedUser)]);
          console.log(`🔗 LINE account [${lineUserId}] linked to user [${matchedUser.username}] (${matchedUser.id})`);
          return;
        } else {
          await sendLineReply(replyToken, `❌ ไม่พบบัญชีผู้ใช้ "${targetKey}" ในระบบ\n\nกรุณาตรวจสอบชื่อ Username บนหน้าเว็บ Dashboard อีกครั้งครับ`);
          return;
        }
      }

      // Check linked user
      const linkedUserId = (store._lineUsers && store._lineUsers[lineUserId]) || '1';
      let targetUser = Object.values(store._users || {}).find(u => u.id === linkedUserId || (u.username && u.username.toLowerCase() === String(linkedUserId).toLowerCase()));
      if (!targetUser && (linkedUserId === 'u_test4' || linkedUserId === 'test4')) {
        targetUser = { id: 'u_test4', username: 'test4', displayName: 'test4', role: 'student', isBme: false };
      } else if (!targetUser) {
        targetUser = { id: linkedUserId, displayName: 'นักศึกษา' };
      }
      const targetUsername = (targetUser && targetUser.username) ? targetUser.username.toLowerCase() : '';
      const isWitchaya = targetUsername === 'witchaya' || linkedUserId === '1';
      const isTest4 = targetUsername === 'test4' || linkedUserId === 'u_test4' || linkedUserId === 'test4';
      const isBmeUser = isTest4 ? false : (targetUser && targetUser.isBme !== false);
      const defaultCurriculum = isTest4 ? TEST4_CURRICULUM : (isBmeUser ? DEFAULT_BME_CURRICULUM : []);
      const defaultRoutines = isBmeUser ? [...DEFAULT_BME_ROUTINE_EVENTS, ...DEFAULT_BME_STUDY_BLOCKS] : [];

      // ─── 0. Command: เมนู / Menu / Help / วิธีใช้ / คู่มือ ───
      if (/^(help|menu|guide|manual|วิธีใช้|คู่มือ|เมนู|\?|คำสั่ง|ฟีเจอร์)$/i.test(text)) {
        const menuFlex = buildHelpMenuFlex();
        menuFlex.quickReply = {
          items: [
            { type: 'action', action: { type: 'message', label: '⚡ คาบต่อไป', text: 'next' } },
            { type: 'action', action: { type: 'message', label: '📅 ตารางวันนี้', text: 'today' } },
            { type: 'action', action: { type: 'message', label: '📝 งานค้าง', text: 'tasks' } },
            { type: 'action', action: { type: 'message', label: '🔔 /noti 15', text: '/noti 15' } },
            { type: 'action', action: { type: 'message', label: '🕒 เวลาว่าง', text: 'freetime' } },
            { type: 'action', action: { type: 'message', label: '🌤️ อากาศ', text: 'weather' } },
            { type: 'action', action: { type: 'message', label: '🍽️ กินไรดี', text: 'food' } },
            { type: 'action', action: { type: 'message', label: '📚 Classroom', text: 'classroom' } },
            { type: 'action', action: { type: 'message', label: '🗓️ ตารางสอบ', text: 'exam' } },
            { type: 'action', action: { type: 'message', label: '👤 โปรไฟล์', text: 'profile' } }
          ]
        };
        await sendLineReply(replyToken, [menuFlex]);
        return;
      }

      // ─── 1.5 Notification Settings Command: /noti ... ───
      const notiMatch = text.match(/^\/?noti\s*(.*)/i);
      if (notiMatch) {
        const arg = notiMatch[1].trim().toLowerCase();
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        if (!userData.notiSettings) userData.notiSettings = { enabled: false, offsets: [15] };

        if (!arg || arg === 'on' || arg === 'เปิด') {
          userData.notiSettings.enabled = true;
          userData.notiSettings.offsets = [15];
          await dbAdapter.saveUserData(linkedUserId, userData);
          store[linkedUserId] = userData;
          saveStore();
          await sendLineReply(replyToken, [buildNotiStatusFlex(userData.notiSettings)]);
          return;
        }

        if (arg === 'cancel' || arg === 'off' || arg === 'ปิด' || arg === 'ยกเลิก') {
          userData.notiSettings.enabled = false;
          await dbAdapter.saveUserData(linkedUserId, userData);
          store[linkedUserId] = userData;
          saveStore();
          await sendLineReply(replyToken, [buildNotiStatusFlex(userData.notiSettings)]);
          return;
        }

        if (arg === 'status' || arg === 'เช็ค' || arg === 'ดู' || arg === 'ตั้งค่า') {
          await sendLineReply(replyToken, [buildNotiStatusFlex(userData.notiSettings)]);
          return;
        }

        // Numbers parsing: e.g. /noti 10 15 30 or /noti 5 20
        const numbers = arg.split(/\s+/).map(Number).filter(n => !isNaN(n) && n > 0 && n <= 180);
        if (numbers.length > 0) {
          userData.notiSettings.enabled = true;
          userData.notiSettings.offsets = numbers.sort((a, b) => b - a);
          await dbAdapter.saveUserData(linkedUserId, userData);
          store[linkedUserId] = userData;
          saveStore();
          await sendLineReply(replyToken, [buildNotiStatusFlex(userData.notiSettings)]);
          return;
        }
      }

      // ─── 2. Command: โน้ตด่วน / Memo (+โน้ต <ข้อความ> / จดโน้ต <ข้อความ> / +note <text> / add note <text>) ───
      const explicitNoteMatch = text.match(/^(\+โน้ต|จดโน้ต|เพิ่มโน้ต|\+note|memo|บันทึกโน้ต|add note)\s*(.+)/i);
      if (explicitNoteMatch) {
        const noteText = explicitNoteMatch[2].trim();
        if (noteText) {
          const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
          if (!userData.quickNotes) userData.quickNotes = [];
          userData.quickNotes.push({
            id: Date.now().toString(),
            text: noteText,
            createdAt: new Date().toISOString()
          });
          await dbAdapter.saveUserData(linkedUserId, userData);
          store[linkedUserId] = userData;
          saveStore();
          await sendLineReply(replyToken, [buildQuickNoteFlex(userData.quickNotes)]);
          return;
        }
      }

      // ─── 3. Command: +งาน / +การบ้าน / +task <title> due <date> / add task <title> ───
      const explicitTaskMatch = text.match(/^(\+งาน|\+การบ้าน|เพิ่มงาน|เพิ่มการบ้าน|จดงาน|จดการบ้าน|การบ้านใหม่|\+task|add task)\s*(.+)/i);


      // ─── 1.8 Natural Language Appointment / Meeting Creation ───
      // NOTE: Only runs if NOT an explicit +โน้ต / +task / +งาน command
      const appointmentMatch = text.match(/^(นัด|นัดหมาย|มีตติ้ง|meeting|ประชุม|ซ้อม|ติว)\s*(.+)/i);
      const hasDateKeyword = hasGemini && text.length > 15 && (text.includes('พรุ่งนี้') || text.includes('วันจันทร์') || text.includes('วันอังคาร') || text.includes('วันพุธ') || text.includes('วันพฤหัส') || text.includes('วันศุกร์') || text.includes('วันเสาร์') || text.includes('วันอาทิตย์'));
      if (!explicitNoteMatch && !explicitTaskMatch && (appointmentMatch || hasDateKeyword)) {
        let extracted = null;
        if (hasGemini) {
          extracted = await extractScheduleWithGemini(text);
        }

        if (!extracted || !extracted.events || extracted.events.length === 0) {
          const fallbackParsed = parseThaiNaturalAppointment(text);
          if (fallbackParsed) {
            extracted = { events: [fallbackParsed] };
          }
        }

        if (extracted && extracted.events && extracted.events.length > 0) {
          const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
          if (!userData.customBlocks) userData.customBlocks = {};

          const savedEvents = [];
          extracted.events.forEach(ev => {
            if (!ev.day || !ev.title) return;
            const dayKey = ev.day.toLowerCase();
            if (!userData.customBlocks[dayKey]) userData.customBlocks[dayKey] = [];
            const newBlock = {
              id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
              title: ev.title,
              start: ev.start || '09:00',
              end: ev.end || '10:00',
              tag: 'study',
              isStudyBlock: true,
              notes: ev.notes || ev.location || ''
            };
            userData.customBlocks[dayKey].push(newBlock);
            savedEvents.push({ ...ev, id: newBlock.id });
          });

          await dbAdapter.saveUserData(linkedUserId, userData);
          store[linkedUserId] = userData;
          saveStore();

          await sendLineReply(replyToken, [buildAiEventCreatedFlex(savedEvents, extracted.summary || 'เพิ่มนัดหมายลงตารางเรียบร้อยแล้ว', 'Schedule Assistant')]);
          return;
        }
      }

      // ─── 3. Command: +งาน / +การบ้าน / +task <title> ───
      // Fallback for generic "+" or "จด"
      const genericMatch = !explicitNoteMatch && !explicitTaskMatch ? text.match(/^(\+|จด)\s*(.+)/i) : null;

      let isTask = false;
      let isNote = false;
      let taskOrNoteText = '';

      if (explicitTaskMatch) {
        isTask = true;
        taskOrNoteText = explicitTaskMatch[2].trim();
      } else if (genericMatch) {
        const payload = genericMatch[2].trim();
        if (/^(โน้ต|note|memo)/i.test(payload)) {
          isNote = true;
          taskOrNoteText = payload.replace(/^(โน้ต|note|memo)\s*/i, '').trim();
        } else if (/^(งาน|การบ้าน|task)/i.test(payload) || /(กำหนดส่ง|ส่ง|ภายใน|ก่อน|deadline|due|by)/i.test(payload)) {
          isTask = true;
          taskOrNoteText = payload.replace(/^(งาน|การบ้าน|task)\s*/i, '').trim();
        } else {
          // Default "+" is Task, Default "จด" without due date is Note
          if (genericMatch[1] === '+') isTask = true;
          else isNote = true;
          taskOrNoteText = payload;
        }
      }

      if (isNote && taskOrNoteText) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};

        if (!userData.quickNotes) userData.quickNotes = [];
        userData.quickNotes.push({
          id: Date.now().toString(),
          text: taskOrNoteText,
          createdAt: new Date().toISOString()
        });
        await dbAdapter.saveUserData(linkedUserId, userData);
        store[linkedUserId] = userData;
        saveStore();
        await sendLineReply(replyToken, [buildQuickNoteFlex(userData.quickNotes)]);
        return;
      }

      if (isTask && taskOrNoteText) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        if (!userData.tasks) userData.tasks = [];

        // Parse optional due date if contains date keywords
        let title = taskOrNoteText;
        let dueDate = '';
        const dateMatch = taskOrNoteText.match(/(กำหนดส่ง|ส่ง|ภายใน|ก่อน|deadline|due|by)\s*[:\-]?\s*(.+)$/i);
        if (dateMatch) {
          title = taskOrNoteText.slice(0, dateMatch.index).trim();
          dueDate = dateMatch[2].trim();
        }

        const newTask = {
          id: Date.now().toString(),
          title: title || taskOrNoteText,
          dueDate: dueDate || '',
          done: false,
          createdAt: new Date().toISOString()
        };

        userData.tasks.push(newTask);
        await dbAdapter.saveUserData(linkedUserId, userData);
        store[linkedUserId] = userData;
        saveStore();

        const pendingCount = userData.tasks.filter(t => !t.done).length;
        await sendLineReply(replyToken, [buildTaskAddedFlex(newTask, pendingCount)]);
        return;
      }

      // ─── 3.5 Command: เสร็จ / ทำเสร็จ / done <ลำดับ> / check <num> / finish <num> ───
      const doneMatch = text.match(/^(เสร็จ|ทำเสร็จ|done|check|finish|ลบงาน)(\s*(\d+))?$/i);
      if (doneMatch) {
        const rawIdx = doneMatch[3];
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const tasks = userData.tasks || userData.todos || [];
        const pending = tasks.filter(t => !t.done);

        if (!rawIdx) {
          if (pending.length === 1) {
            const finishedTask = pending[0];
            finishedTask.done = true;
            finishedTask.completedAt = new Date().toISOString();
            await dbAdapter.saveUserData(linkedUserId, userData);
            store[linkedUserId] = userData;
            saveStore();
            await sendLineReply(replyToken, `🎉 เยี่ยมมากครับ! ทำงาน "${finishedTask.title || finishedTask.text}" เสร็จเรียบร้อยแล้ว ✨\n(ไม่มีงานค้างแล้วครับ 🎉)`);
            return;
          }
          await sendLineReply(replyToken, [buildPendingTasksFlex(tasks)]);
          return;
        }

        const targetIndex = parseInt(rawIdx, 10) - 1;
        if (targetIndex >= 0 && targetIndex < pending.length) {
          const finishedTask = pending[targetIndex];
          finishedTask.done = true;
          finishedTask.completedAt = new Date().toISOString();
          await dbAdapter.saveUserData(linkedUserId, userData);
          store[linkedUserId] = userData;
          saveStore();

          const remainingCount = tasks.filter(t => !t.done).length;
          await sendLineReply(replyToken, `🎉 เยี่ยมมากครับ! ทำงาน "${finishedTask.title || finishedTask.text}" เสร็จแล้ว ✨\n(เหลืองานค้างอีก ${remainingCount} รายการ)`);
        } else {
          await sendLineReply(replyToken, `❌ Task #${rawIdx} not found / ไม่พบลำดับงานที่ ${rawIdx} (พิมพ์ "tasks" หรือ "งานค้าง" เพื่อดูรายการครับ)`);
        }
        return;
      }

      // ─── 4. Command: คาบต่อไป / วิชาต่อไป / next / next class / upcoming / now ───
      if (/^(คาบต่อไป|วิชาต่อไป|next|next class|upcoming|now|เรียนไรต่อ|ห้องต่อไป|คาบถัดไป)/i.test(text)) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayCode = days[now.getDay()];
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || defaultCurriculum;
        const todayClasses = curriculum.filter(c => c.day === dayCode).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));

        const classesWithMin = todayClasses.map(c => {
          const [sh, sm] = (c.start || '00:00').split(':').map(Number);
          const [eh, em] = (c.end || '00:00').split(':').map(Number);
          return { ...c, startMin: sh * 60 + sm, endMin: eh * 60 + em };
        });

        const ongoing = classesWithMin.find(c => currentMinutes >= c.startMin && currentMinutes < c.endMin);
        const upcoming = classesWithMin.filter(c => c.startMin > currentMinutes);

        if (ongoing) {
          const nextUpcoming = upcoming[0] || null;
          const remainingMin = ongoing.endMin - currentMinutes;
          await sendLineReply(replyToken, [buildNextClassFlex(ongoing, 'ongoing', remainingMin, nextUpcoming)]);
          return;
        } else if (upcoming.length > 0) {
          const nextClass = upcoming[0];
          const diffMin = nextClass.startMin - currentMinutes;
          const nextNextClass = upcoming[1] || null;
          await sendLineReply(replyToken, [buildNextClassFlex(nextClass, 'upcoming', diffMin, nextNextClass)]);
          return;
        } else {
          await sendLineReply(replyToken, [buildNextClassFlex(null, 'done_today', 0, null)]);
          return;
        }
      }

      // ─── 5. Command: โน้ตด่วน / Memo (delnote <num> / notes / note / โน้ต) ───
      const deleteNoteMatch = text.match(/^(ลบโน้ต|delnote|deletenote|ลบ\s*โน้ต|ลบข้อความ|ลบโน๊ต|วิธีลบโน้ต|ล้างโน้ต)\s*(\d+|ทั้งหมด|all)?/i);
      if (deleteNoteMatch) {
        const arg = (deleteNoteMatch[2] || '').trim().toLowerCase();
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        if (!userData.quickNotes) userData.quickNotes = [];

        if (arg === 'ทั้งหมด' || arg === 'all' || text.includes('ล้างโน้ต')) {
          userData.quickNotes = [];
          await dbAdapter.saveUserData(linkedUserId, userData);
          store[linkedUserId] = userData;
          saveStore();
          await sendLineReply(replyToken, [buildQuickNoteFlex([])]);
          return;
        }

        if (arg && /^\d+$/.test(arg)) {
          const targetIdx = parseInt(arg, 10) - 1;
          if (targetIdx >= 0 && targetIdx < userData.quickNotes.length) {
            const removed = userData.quickNotes.splice(targetIdx, 1)[0];
            await dbAdapter.saveUserData(linkedUserId, userData);
            store[linkedUserId] = userData;
            saveStore();
            await sendLineReply(replyToken, [buildQuickNoteFlex(userData.quickNotes)]);
            return;
          } else {
            await sendLineReply(replyToken, `❌ ไม่พบลำดับโน้ตที่ ${arg} ครับ (พิมพ์ "โน้ต" เพื่อดูลำดับปัจจุบัน)`);
            return;
          }
        }

        // If user typed "ลบโน้ต" without an index, show the notes list with inline delete buttons & guidance
        await sendLineReply(replyToken, [buildQuickNoteFlex(userData.quickNotes)]);
        return;
      }

      if (/^(โน้ต|ดูโน้ต|notes|note|memo|บันทึก|ข้อความกันลืม)/i.test(text)) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        await sendLineReply(replyToken, [buildQuickNoteFlex(userData.quickNotes || [])]);
        return;
      }

      // ─── 5.5 Command: สภาพอากาศ / weather / weather salaya ───
      if (/^(สภาพอากาศ|อากาศ|ฝน|weather|weather salaya|salaya weather)/i.test(text)) {
        const weatherInfo = await fetchSalayaWeather();
        if (weatherInfo) {
          await sendLineReply(replyToken, `🌤️ สภาพอากาศ มหิดล ศาลายา (Weather Salaya):\n🌡️ อุณหภูมิ: ${weatherInfo.temp}\n💧 ความชื้น: ${weatherInfo.humidity}\n🌧️ โอกาสฝนตก: ${weatherInfo.rainProb}\n☁️ สถานะ: ${weatherInfo.summary}${weatherInfo.alert ? `\n\n⚠️ ${weatherInfo.alert}` : ''}`);
        } else {
          await sendLineReply(replyToken, '🌤️ กำลังเชื่อมต่อข้อมูลสภาพอากาศศาลายา กรุณาลองใหม่อีกครั้งครับ');
        }
        return;
      }

      // ─── 6. Command: เวลาว่าง / freetime / free time ───
      if (/^(เวลาว่าง|ว่างตอนไหน|freetime|free time|free|อ่านหนังสือตอนไหน|ช่องว่าง|ช่วงว่าง)/i.test(text)) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayNamesTH = {
          sunday: 'วันอาทิตย์ (Sunday)', monday: 'วันจันทร์ (Monday)', tuesday: 'วันอังคาร (Tuesday)',
          wednesday: 'วันพุธ (Wednesday)', thursday: 'วันพฤหัสบดี (Thursday)', friday: 'วันศุกร์ (Friday)', saturday: 'วันเสาร์ (Saturday)'
        };
        const dayCode = days[now.getDay()];
        const dayName = dayNamesTH[dayCode];
        const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || defaultCurriculum;
        const todayClasses = curriculum.filter(c => c.day === dayCode).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));

        const freeSlots = [];
        for (let i = 0; i < todayClasses.length - 1; i++) {
          const currentClass = todayClasses[i];
          const nextClass = todayClasses[i + 1];
          const [eh, em] = currentClass.end.split(':').map(Number);
          const [sh, sm] = nextClass.start.split(':').map(Number);
          const endM = eh * 60 + em;
          const startM = sh * 60 + sm;
          const diff = startM - endM;
          if (diff > 15) {
            let suggest = 'พักผ่อน / Rest';
            if (diff >= 90) suggest = 'ทบทวนบทเรียน / Deep Study';
            else if (diff >= 45) suggest = 'เคลียร์การบ้าน / Homework';
            freeSlots.push({
              start: currentClass.end,
              end: nextClass.start,
              durationMinutes: diff,
              suggest
            });
          }
        }

        const dayMapCode = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };
        const todayRoutines = defaultRoutines.filter(r => r.day === dayMapCode[dayCode]);

        await sendLineReply(replyToken, [buildFreeTimeFlex(dayName, dateStr, freeSlots, todayRoutines)]);
        return;
      }

      // ─── 7. Command: หน่วยกิต & สรุปเทอม (Credits Summary) ───
      if (/^(หน่วยกิต|สรุปเทอม|credits|credit|วิชาทั้งหมด)/i.test(text)) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || defaultCurriculum;
        await sendLineReply(replyToken, [buildSemesterCreditsFlex(curriculum)]);
        return;
      }

      // ─── 8. Command: สุ่มของกินแถวมหิดล (Food Roulette / food / hungry / eat) ───
      if (/^(กินไรดี|หิว|อาหาร|เมนูวันนี้|สุ่มของกิน|กินอะไรดี|food|กินไร|eat|hungry)/i.test(text)) {
        const foodList = [
          { name: 'ข้าวราดแกง / ข้าวขาหมู', location: 'โรงอาหารกลาง (โรงชาย)', highlight: 'มีให้เลือกหลากหลาย ราคาประหยัด อิ่มคุ้ม', price: '35 - 50 บาท' },
          { name: 'ก๋วยเตี๋ยวต้มยำ / สเต็ก', location: 'โรงอาหารคณะวิทย์ (SC)', highlight: 'น้ำซุปเข้มข้น แอร์เย็น นั่งสบาย', price: '45 - 65 บาท' },
          { name: 'สุกี้โรล / อาหารคลีน', location: 'Green Canteen (ข้างสระว่ายน้ำ)', highlight: 'อาหารเพื่อสุขภาพ แคลอรี่ต่ำ อร่อยไม่อ้วน', price: '50 - 75 บาท' },
          { name: 'ข้าวไข่ข้น / ข้าวผัดต้มยำ', location: 'ซอยตั้งสิน (หลัง ม.)', highlight: 'ร้านเด็ดเด็กมหิดล ให้เยอะ จานใหญ่', price: '55 - 80 บาท' },
          { name: 'ชาบู / ปิ้งย่างบุฟเฟต์', location: 'หน้า ม. ประตู 4', highlight: 'เติมพลังหลังเรียนหนัก เนื้อนุ่ม น้ำจิ้มเด็ด', price: '199 - 299 บาท' },
          { name: 'ก๋วยเตี๋ยวเรืออยุธยา', location: 'ตลาดศาลายา (หน้าสถานีรถไฟ)', highlight: 'รสแซ่บไม่ต้องปรุง กากหมูเจียวกรอบๆ', price: '40 - 60 บาท' },
          { name: 'ส้มตำ ยำ ลาบ น้ำตก', location: 'ประตู 5 มหิดล', highlight: 'แซ่บซี้ด คอหมูย่างเด็ด ข้าวเหนียวนุ่ม', price: '50 - 90 บาท' }
        ];
        const picked = foodList[Math.floor(Math.random() * foodList.length)];
        await sendLineReply(replyToken, [buildFoodRouletteFlex(picked)]);
        return;
      }

      // ─── 9. Command: ตารางพรุ่งนี้ / พรุ่งนี้ / tomorrow ───
      if (/^(ตาราง\s*พรุ่งนี้|ตารางเรียน\s*พรุ่งนี้|พรุ่งนี้|tomorrow|schedule\s*tomorrow|tomorrow\s*schedule|พรุ่งนี้เรียนไร|พรุ่งนี้เรียนอะไร|มีเรียนมั้ยพรุ่งนี้|พรุ่งนี้มีเรียนมั้ย)/i.test(text)) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        now.setDate(now.getDate() + 1);
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayNamesTH = {
          sunday: 'วันอาทิตย์ (Sunday)', monday: 'วันจันทร์ (Monday)', tuesday: 'วันอังคาร (Tuesday)',
          wednesday: 'วันพุธ (Wednesday)', thursday: 'วันพฤหัสบดี (Thursday)', friday: 'วันศุกร์ (Friday)', saturday: 'วันเสาร์ (Saturday)'
        };
        const dayCode = days[now.getDay()];
        const dayName = dayNamesTH[dayCode];
        const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || defaultCurriculum;
        const tomorrowClasses = curriculum.filter(c => c.day === dayCode).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
        const dayMapCode = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };
        const tomorrowRoutines = defaultRoutines.filter(r => r.day === dayMapCode[dayCode]);

        await sendLineReply(replyToken, [buildScheduleFlex(`${dayName} (พรุ่งนี้/Tomorrow)`, dateStr, tomorrowClasses, tomorrowRoutines)]);
        return;
      }

      // ─── 10. Command: ตารางเรียนระบุวัน (ตารางวันจันทร์, ตาราง วันอังคาร, วันพุธ, schedule monday, etc.) ───
      const dayArgMatch = text.match(/^(ตาราง|ตารางเรียน|schedule)?\s*(วัน)?\s*(จันทร์|อังคาร|พุธ|พฤหัส|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/i);
      if (dayArgMatch) {
        const rawDay = (dayArgMatch[3] || '').toLowerCase();
        const dayMap = {
          'จันทร์': 'monday', 'monday': 'monday', 'mon': 'monday',
          'อังคาร': 'tuesday', 'tuesday': 'tuesday', 'tue': 'tuesday',
          'พุธ': 'wednesday', 'wednesday': 'wednesday', 'wed': 'wednesday',
          'พฤหัส': 'thursday', 'พฤหัสบดี': 'thursday', 'thursday': 'thursday', 'thu': 'thursday',
          'ศุกร์': 'friday', 'friday': 'friday', 'fri': 'friday',
          'เสาร์': 'saturday', 'saturday': 'saturday', 'sat': 'saturday',
          'อาทิตย์': 'sunday', 'sunday': 'sunday', 'sun': 'sunday'
        };
        const targetDayCode = dayMap[rawDay] || 'monday';
        const dayNamesTH = {
          monday: 'วันจันทร์ (Monday)', tuesday: 'วันอังคาร (Tuesday)', wednesday: 'วันพุธ (Wednesday)',
          thursday: 'วันพฤหัสบดี (Thursday)', friday: 'วันศุกร์ (Friday)', saturday: 'วันเสาร์ (Saturday)', sunday: 'วันอาทิตย์ (Sunday)'
        };
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || defaultCurriculum;
        const targetClasses = curriculum.filter(c => c.day === targetDayCode).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
        const dayMapCode = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };
        const targetRoutines = defaultRoutines.filter(r => r.day === dayMapCode[targetDayCode]);

        await sendLineReply(replyToken, [buildScheduleFlex(`${dayNamesTH[targetDayCode]}`, `Schedule`, targetClasses, targetRoutines)]);
        return;
      }

      // ─── 11. Command: ตารางวันนี้ / วันนี้ / today / schedule / ตาราง / ตารางเรียน ───
      if (/^(ตาราง\s*วันนี้|ตารางเรียน\s*วันนี้|ตารางเรียน|ตารางสอน|ตาราง|วันนี้|today|schedule\s*today|today\s*schedule|schedule|เรียนไร|มีเรียนมั้ย|วันนี้เรียนไร|วันนี้มีเรียนมั้ย|เรียนไรวันนี้|มีเรียนมั้ยวันนี้)/i.test(text)) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayNamesTH = {
          sunday: 'วันอาทิตย์ (Sunday)', monday: 'วันจันทร์ (Monday)', tuesday: 'วันอังคาร (Tuesday)',
          wednesday: 'วันพุธ (Wednesday)', thursday: 'วันพฤหัสบดี (Thursday)', friday: 'วันศุกร์ (Friday)', saturday: 'วันเสาร์ (Saturday)'
        };
        const dayCode = days[now.getDay()];
        const dayName = dayNamesTH[dayCode];
        const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || defaultCurriculum;
        const todayClasses = curriculum.filter(c => c.day === dayCode).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
        const dayMapCode = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };
        const todayRoutines = defaultRoutines.filter(r => r.day === dayMapCode[dayCode]);

        await sendLineReply(replyToken, [buildScheduleFlex(`${dayName}`, dateStr, todayClasses, todayRoutines)]);
        return;
      }

      // ─── 12. Command: ตารางสัปดาห์ / สัปดาห์นี้ / week / weekly / all schedule ───
      if (/^(ตาราง\s*สัปดาห์|สัปดาห์นี้|ทั้งสัปดาห์|ตารางทั้งหมด|week|weekly|all\s*schedule|schedule\s*week|weekly\s*schedule)/i.test(text)) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || defaultCurriculum;
        await sendLineReply(replyToken, [buildWeeklyScheduleFlex(curriculum)]);
        return;
      }

      // ─── 13. Command: คลาสรูม / classroom / ชีท / sheet / ลิงก์เรียน / เอกสาร ───
      if (/^(คลาสรูม|classroom|ลิงก์เรียน|ลิงก์ห้องเรียน|ชีท|ชีทเรียน|google\s*classroom|sheet|sheets|เอกสาร|คลังเอกสาร)/i.test(text)) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = (userData.curriculum && Array.isArray(userData.curriculum) && userData.curriculum.length > 0) ? userData.curriculum : defaultCurriculum;
        const links = (userData.studyLinks && Array.isArray(userData.studyLinks) && userData.studyLinks.length > 0) ? userData.studyLinks : DEFAULT_BME_STUDY_LINKS;
        await sendLineReply(replyToken, [buildClassroomDirectoryFlex(curriculum, links)]);
        return;
      }

      // ─── 14. Command: โปรไฟล์ / profile / สถานะ / me / บัญชี ───
      if (/^(โปรไฟล์|profile|สถานะ|me|บัญชี|ข้อมูลฉัน|my\s*profile|status)/i.test(text)) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const tasks = userData.tasks || userData.todos || [];
        const pendingCount = tasks.filter(t => !t.done).length;
        const noteCount = (userData.quickNotes || []).length;
        await sendLineReply(replyToken, [buildUserProfileFlex(targetUser, pendingCount, noteCount)]);
        return;
      }

      // ─── 15. Command: ตารางสอบรายวิชา (Detailed Exam Schedule / exam / exams) ───
      if (/^(ตาราง\s*สอบ|สอบวิชาไรบ้าง|ตารางสอบกลางภาค|สอบกลางภาค|วันสอบวิชา|exam|exams|midterm)/i.test(text)) {
        await sendLineReply(replyToken, [buildDetailedExamScheduleFlex()]);
        return;
      }

      // ─── 16. Command: D-Day / สอบ / วันสอบ / นับถอยหลัง / dday / countdown ───
      if (/^(สอบ|วันสอบ|dday|d-day|นับถอยหลัง|countdown)/i.test(text)) {
        await sendLineReply(replyToken, [buildDDayCountdownFlex()]);
        return;
      }

      // ─── 17. Command: รถราง / บริการ ม.มหิดล / เบอร์ฉุกเฉิน / tram / bus / emergency ───
      if (/^(รถราง|tram|รถศาลายา|ฉุกเฉิน|เบอร์โทร|transit|emergency|รถบัส|salaya\s*link|bus)/i.test(text)) {
        await sendLineReply(replyToken, [buildCampusServicesFlex()]);
        return;
      }

      // ─── 18. Command: ห้องสมุด / Co-Working / ที่อ่านหนังสือ / library ───
      if (/^(ห้องสมุด|library|co-working|coworking|ที่อ่านหนังสือ|mlc|หอสมุด)/i.test(text)) {
        await sendLineReply(replyToken, [buildLibraryStudyLoungeFlex()]);
        return;
      }

      // ─── 19. Command: เป้าเกรด / GPA Simulator / เกรดเฉลี่ย / gpa / grade ───
      if (/^(เป้าเกรด|เกรด|gpa|คำนวณเกรด|เกรดเฉลี่ย|gpax|grade|grades)/i.test(text)) {
        await sendLineReply(replyToken, [buildGpaTargetSimulatorFlex()]);
        return;
      }

      // ─── 20. Command: โฟกัส / Pomodoro / เทคนิคอ่านหนังสือ / focus ───
      if (/^(โฟกัส|pomodoro|เทคนิคอ่านหนังสือ|อ่านหนังสือ|focus|routine|บล็อกอ่าน)/i.test(text)) {
        await sendLineReply(replyToken, [buildStudyFocusRoutineFlex()]);
        return;
      }

      // ─── 21. Command: สรุปเช้า / เช้านี้ / สรุปวัน / briefing / morning / brief ───
      if (/^(สรุปเช้า|เช้านี้|สรุปวัน|morning|briefing|brief|สรุปวันนี้)/i.test(text)) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayNamesTH = {
          sunday: 'วันอาทิตย์ (Sunday)', monday: 'วันจันทร์ (Monday)', tuesday: 'วันอังคาร (Tuesday)',
          wednesday: 'วันพุธ (Wednesday)', thursday: 'วันพฤหัสบดี (Thursday)', friday: 'วันศุกร์ (Friday)', saturday: 'วันเสาร์ (Saturday)'
        };
        const dayCode = days[now.getDay()];
        const dayName = dayNamesTH[dayCode];
        const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || defaultCurriculum;
        const todayClasses = curriculum.filter(c => c.day === dayCode).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
        const dayMapCode = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };
        const todayRoutines = defaultRoutines.filter(r => r.day === dayMapCode[dayCode]);
        const tasks = userData.tasks || userData.todos || [];
        const pendingTasks = tasks.filter(t => !t.done);

        await sendLineReply(replyToken, [buildDailyBriefingFlex(dayName, dateStr, todayClasses, pendingTasks, todayRoutines)]);
        return;
      }

      // ─── 22. Command: Course Finder (ค้นหารายละเอียดวิชา / ห้องเรียน / course <name>) ───
      const courseMatch = findCourseMatch(text, (await dbAdapter.getUserData(linkedUserId))?.curriculum || defaultCurriculum);
      if (courseMatch && (text.startsWith('วิชา') || text.startsWith('ห้อง') || text.toLowerCase().startsWith('course') || text.length <= 10 || /^(sc|eg|la)/i.test(text))) {
        await sendLineReply(replyToken, [buildCourseProfileFlex(courseMatch)]);
        return;
      }

      // ─── 23. Command: งานค้าง / การบ้าน / tasks / task / todo / todos / homework / pending ───
      if (/^(งานค้าง|งาน\s*ค้าง|การบ้าน|tasks|task|todo|todos|homework|pending|deadline|งาน|ส่งงานไรบ้าง|เช็คงาน|ดูงาน)/i.test(text)) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const tasks = userData.tasks || userData.todos || [];
        await sendLineReply(replyToken, [buildPendingTasksFlex(tasks)]);
        return;
      }

      // ─── 24. Command: ทดสอบ / test ───
      if (/^(ทดสอบ|test)/i.test(text)) {
        const dummyCourse = {
          code: 'SCPY161',
          name: 'General Physics I (ทดสอบแจ้งเตือน / Test Alert)',
          start: '09:30',
          end: '12:30',
          room: 'L2-002',
          classroomUrl: 'https://classroom.google.com/u/6/c/ODcxMTQzMDA0NzAw'
        };
        await sendLineReply(replyToken, [
          buildClassReminderFlex(dummyCourse, 'อีก 15 นาที', '#DC2626')
        ]);
        return;
      }

      // ─── 25. Command: ยกเลิกการผูก / unlink / logout ───
      if (/^(ยกเลิกการผูก|unlink|logout)/i.test(text)) {
        if (store._lineUsers && store._lineUsers[lineUserId]) {
          const oldUid = store._lineUsers[lineUserId];
          delete store._lineUsers[lineUserId];
          if (store._userLine && store._userLine[oldUid]) delete store._userLine[oldUid];
          await dbAdapter.saveSystemAuth();
          saveStore();
          await sendLineReply(replyToken, '👋 Unlinked successfully / ยกเลิกการผูกบัญชีเรียบร้อยแล้วครับ หากต้องการผูกใหม่สามารถพิมพ์ /link <Username> ได้ตลอดเวลา');
        } else {
          await sendLineReply(replyToken, 'ℹ️ บัญชี LINE นี้ยังไม่ได้ผูกกับบัญชี E-Calendar ใดๆ ครับ');
        }
        return;
      }

      // ─── 26. Intelligent AI Conversational Assistant (Gemini) ───
      if (hasGemini && text.length >= 2 && !/^(help|menu|guide|manual|วิธีใช้|คู่มือ|เมนู|\?)$/i.test(text)) {
        try {
          const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
          const curriculum = userData.curriculum || defaultCurriculum;
          const tasks = (userData.tasks || []).filter(t => !t.done);
          const scheduleSummary = curriculum.map(c => `${c.day}: ${c.code} ${c.name} (${c.start}-${c.end}) ห้อง ${c.room || '-'}`).join('\n');
          const taskSummary = tasks.map(t => `- ${t.title} ${t.dueDate ? `(ส่ง: ${t.dueDate})` : ''}`).join('\n') || 'ไม่มีงานค้าง';

          const aiPrompt = `คุณคือผู้ช่วย AI ประจำ E-Calendar นักศึกษา BME ตอบคำถามสั้นกระชับ เป็นกันเองและถูกต้องตามข้อมูลด้านล่างนี้:\n\n[ตารางเรียน]:\n${scheduleSummary}\n\n[งานค้าง]:\n${taskSummary}\n\n[คำถามของผู้ใช้]:\n${text}`;
          const aiResponse = await callGeminiApi([{ role: 'user', parts: [{ text: aiPrompt }] }], 'ตอบคำถามนักศึกษาอย่างกระชับ ไม่เยิ่นเย้อ ใช้ภาษาไทยที่เป็นกันเอง มี emoji ประกอบ');

          if (aiResponse && aiResponse.text) {
            const aiTextMsg = {
              type: 'text',
              text: `🤖 ${aiResponse.text.trim()}`,
              quickReply: {
                items: [
                  { type: 'action', action: { type: 'message', label: '📅 ตารางวันนี้', text: 'today' } },
                  { type: 'action', action: { type: 'message', label: '📅 ตารางพรุ่งนี้', text: 'tomorrow' } },
                  { type: 'action', action: { type: 'message', label: '📝 งานค้าง', text: 'tasks' } },
                  { type: 'action', action: { type: 'message', label: '⚡ คาบต่อไป', text: 'next' } }
                ]
              }
            };
            await sendLineReply(replyToken, [aiTextMsg]);
            return;
          }
        } catch (geminiErr) {
          console.warn('⚠️ Gemini fallback response error:', geminiErr.message);
        }
      }

      // ─── Fallback / Help Menu: Smart Interactive Menu (Carousel & Bilingual Quick Replies) ───
      const isLinked = Boolean(store._lineUsers && store._lineUsers[lineUserId]);
      if (isLinked || /^(help|menu|guide|manual|วิธีใช้|คู่มือ|เมนู|\?)/i.test(text)) {
        const menuFlex = buildHelpMenuFlex();
        menuFlex.quickReply = {
          items: [
            { type: 'action', action: { type: 'message', label: '⚡ คาบต่อไป', text: 'next' } },
            { type: 'action', action: { type: 'message', label: '📅 ตารางวันนี้', text: 'today' } },
            { type: 'action', action: { type: 'message', label: '📝 งานค้าง', text: 'tasks' } },
            { type: 'action', action: { type: 'message', label: '🔔 /noti 15', text: '/noti 15' } },
            { type: 'action', action: { type: 'message', label: '🕒 เวลาว่าง', text: 'freetime' } },
            { type: 'action', action: { type: 'message', label: '🌤️ อากาศ', text: 'weather' } },
            { type: 'action', action: { type: 'message', label: '🍽️ กินไรดี', text: 'food' } },
            { type: 'action', action: { type: 'message', label: '📚 Classroom', text: 'classroom' } },
            { type: 'action', action: { type: 'message', label: '🗓️ ตารางสอบ', text: 'exam' } },
            { type: 'action', action: { type: 'message', label: '👤 โปรไฟล์', text: 'profile' } }
          ]
        };
        await sendLineReply(replyToken, [menuFlex]);
      } else {
        const welcomeUnlinked = {
          type: 'text',
          text: `👋 สวัสดีครับ! Welcome to E-Calendar Bot 📚\n\nบัญชี LINE นี้ยังไม่ได้ผูกกับ E-Calendar\nPlease link your account by typing:\n👉 /link <Your Username>\nExample: /link witchaya\n\n(Find your username on E-Calendar Dashboard)`,
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '❓ Help / วิธีใช้', text: 'help' } }
            ]
          }
        };
        await sendLineReply(replyToken, [welcomeUnlinked]);
      }
      return;
    }
  }

  // ─── API: LINE Messaging Webhook (POST /api/line/webhook) ───
  if (pathname === '/api/line/webhook' && req.method === 'POST') {
    parseJsonBody(async (err, data, rawBody) => {
      if (err) {
        console.error('❌ LINE Webhook parse error:', err.message);
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }

      // Signature Verification
      if (LINE_CHANNEL_SECRET) {
        const signature = req.headers['x-line-signature'];
        const hash = crypto.createHmac('SHA256', LINE_CHANNEL_SECRET).update(rawBody || Buffer.alloc(0)).digest('base64');
        if (hash !== signature) {
          console.warn('⚠️ LINE Webhook signature mismatch! Header:', signature, 'Computed:', hash);
          res.writeHead(403);
          res.end('Invalid signature');
          return;
        }
      }

      const events = (data && data.events) || [];
      console.log(`📩 LINE Webhook received ${events.length} event(s)`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));

      for (const event of events) {
        try {
          console.log(`⚡ Processing LINE event: [${event.type}] from [${event.source && event.source.userId}]`);
          await handleLineEvent(event);
        } catch (eventErr) {
          console.error('❌ LINE handleLineEvent error:', eventErr);
        }
      }
    });
    return;
  }

  // ─── API: LINE Bot Status (GET /api/line/status) ───
  if (pathname === '/api/line/status' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const ownerId = resolveOwnerId({});
    const lineUserId = (store._userLine && store._userLine[ownerId]) ||
                       (store._userLine && store._userLine['1']) ||
                       (store._users && store._users[ownerId] && store._userLine && store._userLine[store._users[ownerId].id]) ||
                       (store._userLine && Object.values(store._userLine)[0]) ||
                       (store._lineUsers && Object.keys(store._lineUsers)[0]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      configured: hasLine,
      linked: Boolean(lineUserId),
      ownerId
    }));
    return;
  }

  // ─── API: LINE Bot Test Push (POST /api/line/test) ───
  if (pathname === '/api/line/test' && req.method === 'POST') {
    parseJsonBody(async (err, data) => {
      const ownerId = resolveOwnerId(data);
      let lineUserId = (store._userLine && store._userLine[ownerId]) ||
                       (store._userLine && store._userLine['1']) ||
                       (store._users && store._users[ownerId] && store._userLine && store._userLine[store._users[ownerId].id]);

      if (!lineUserId && store._userLine && Object.keys(store._userLine).length > 0) {
        lineUserId = Object.values(store._userLine)[0];
      }
      if (!lineUserId && store._lineUsers && Object.keys(store._lineUsers).length > 0) {
        lineUserId = Object.keys(store._lineUsers)[0];
      }

      if (!hasLine) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN บนเซิร์ฟเวอร์' }));
        return;
      }

      if (!lineUserId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ยังไม่พบบัญชี LINE ที่ผูกกับระบบ กรุณาส่งข้อความหาบอทใน LINE สัก 1 ข้อความ (หรือพิมพ์ /link witchaya) แล้วลองใหม่อีกครั้งครับ' }));
        return;
      }

      const pushResult = await sendLinePush(lineUserId, [
        buildClassReminderFlex({
          code: 'SCPY161',
          name: 'General Physics I (ทดสอบแจ้งเตือนผ่าน LINE)',
          start: '09:30',
          end: '12:30',
          room: 'L2-002',
          classroomUrl: 'https://classroom.google.com/u/6/c/ODcxMTQzMDA0NzAw'
        }, 'อีก 15 นาที')
      ]);

      if (pushResult && pushResult.ok) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'ส่งข้อความเข้า LINE เรียบร้อยแล้ว!' }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        let errMsg = 'ส่งข้อความเข้า LINE ไม่สำเร็จ';
        if (pushResult && pushResult.error) {
          errMsg += ` (${pushResult.error})`;
        }
        res.end(JSON.stringify({ error: errMsg }));
      }
    });
    return;
  }

  // ─── API: LIFF Configuration (GET /api/liff/config) ───
  if (pathname === '/api/liff/config' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      liffId: LINE_LIFF_ID || '',
      hasLine
    }));
    return;
  }

  // ─── API: LIFF Auto-Auth & Account Linking (POST /api/liff/auth) ───
  if (pathname === '/api/liff/auth' && req.method === 'POST') {
    parseJsonBody(async (err, data) => {
      if (err || !data || !data.lineUserId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing lineUserId' }));
        return;
      }

      const { lineUserId, displayName } = data;
      const linkedUserId = (store._lineUsers && store._lineUsers[lineUserId]) || null;
      let targetUser = linkedUserId ? Object.values(store._users || {}).find(u => u.id === linkedUserId) : null;

      if (!targetUser) {
        // If not explicitly linked, resolve to witchaya or default user
        targetUser = store._users['witchaya'] || Object.values(store._users || {})[0] || { id: '1', username: 'student', displayName: displayName || 'นักศึกษา' };
      }

      // Create valid session token for client
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      if (!store._sessions) store._sessions = {};
      store._sessions[token] = {
        username: targetUser.username || targetUser.id,
        userId: targetUser.id,
        expiresAt
      };
      await dbAdapter.saveSystemAuth();
      saveStore();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        user: {
          id: targetUser.id,
          username: targetUser.username,
          displayName: targetUser.displayName || displayName || targetUser.username,
          calendarKey: targetUser.calendarKey
        }
      }));
    });
    return;
  }

  // ─── API: Live iCalendar Feed (GET /api/calendar/:calendarKey/feed.ics) ───
  if (pathname.startsWith('/api/calendar/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const cleanPath = pathname.replace('/api/calendar/', '');
    const parts = cleanPath.split('/');
    const calKey = parts[0].replace('.ics', '').replace(/\/feed$/, '').trim();

    // Find target user by calendarKey, username, or userId
    let targetUserId = store._calKeys ? store._calKeys[calKey] : null;
    if (!targetUserId) {
      const userMatch = Object.values(store._users || {}).find(u => 
        (u.calendarKey && u.calendarKey === calKey) || 
        (u.username && u.username.toLowerCase() === calKey.toLowerCase()) || 
        u.id === calKey
      );
      if (userMatch) targetUserId = userMatch.id;
    }

    if (!targetUserId && (calKey === 'default' || calKey === '1' || calKey.toLowerCase() === 'witchaya')) {
      const witchayaUser = Object.values(store._users || {}).find(u => u.username && u.username.toLowerCase() === 'witchaya');
      targetUserId = witchayaUser ? witchayaUser.id : '1';
    }

    if (!targetUserId) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: Calendar subscription feed not found or invalid token');
      return;
    }

    const includeStudy = url.searchParams.get('study') !== '0';
    const includeClass = url.searchParams.get('class') !== '0';
    const icsContent = await generateIcsCalendar(targetUserId, url.searchParams.get('routines') === '1', includeStudy, includeClass);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="bme-study-schedule.ics"');
    res.writeHead(200);
    res.end(icsContent);
    return;
  }

  // ─── API: Cloud Sync (/api/sync/:key) ───
  if (pathname.startsWith('/api/sync/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const key = decodeURIComponent(pathname.replace('/api/sync/', '')).trim();
    if (!key) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing sync key' }));
      return;
    }

    // Prevent prototype pollution - block dangerous keys
    if (key.startsWith('_') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden key' }));
      return;
    }

    if (req.method === 'GET') {
      const data = await dbAdapter.getUserData(key);
      res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data || { error: 'Not found' }));
      return;
    }

    if (req.method === 'POST') {
      parseJsonBody(async (err, parsed) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return;
        }

        // Prevent prototype pollution - only allow plain object data
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid data format' }));
          return;
        }

        // Merge instead of overwrite to preserve files, but respect deletions
        const existing = (await dbAdapter.getUserData(key)) || {};
        let mergedFiles = { ...(existing.files || {}), ...(parsed.files || {}) };

        // 1. Remove files explicitly marked as deleted in deletedFileUrls tombstone list
        if (Array.isArray(parsed.deletedFileUrls) && parsed.deletedFileUrls.length > 0) {
          const delUrls = new Set(parsed.deletedFileUrls);
          Object.keys(mergedFiles).forEach(fId => {
            if (mergedFiles[fId] && (delUrls.has(mergedFiles[fId].url) || delUrls.has(fId) || delUrls.has(`file-${fId}`))) {
              delete mergedFiles[fId];
            }
          });
        }

        // 2. Merge studyLinks: union of existing server studyLinks + new client studyLinks
        //    (respecting tombstone deletedFileUrls — do NOT purge server files just because
        //     the client's studyLinks list doesn't include them; they may have been uploaded
        //     from another device that hasn't synced yet)
        let mergedStudyLinks = Array.isArray(existing.studyLinks) ? [...existing.studyLinks] : [];
        if (Array.isArray(parsed.studyLinks)) {
          const existingIds = new Set(mergedStudyLinks.map(l => l.id));
          const existingUrls = new Set(mergedStudyLinks.map(l => l.url));
          let delUrlsSet = new Set();
          try { delUrlsSet = new Set(Array.isArray(parsed.deletedFileUrls) ? parsed.deletedFileUrls : []); } catch (_) {}

          // Add new links from client that don't exist on server
          parsed.studyLinks.forEach(l => {
            if (!l) return;
            if (delUrlsSet.has(l.url) || delUrlsSet.has(l.id)) return; // skip deleted
            if (!existingIds.has(l.id) && !existingUrls.has(l.url)) {
              mergedStudyLinks.push(l);
              existingIds.add(l.id);
              if (l.url) existingUrls.add(l.url);
            } else {
              // Update existing entry with newer version from client
              const idx = mergedStudyLinks.findIndex(e => e.id === l.id || (l.url && e.url === l.url));
              if (idx !== -1) mergedStudyLinks[idx] = l;
            }
          });

          // Remove entries that are in tombstone (deletedFileUrls)
          mergedStudyLinks = mergedStudyLinks.filter(l => {
            if (!l) return false;
            if (delUrlsSet.has(l.id) || delUrlsSet.has(l.url)) return false;
            return true;
          });
        }

        // Ensure files in mergedFiles are represented in mergedStudyLinks
        const existingLinkUrls = new Set(mergedStudyLinks.map(l => l.url));
        Object.values(mergedFiles).forEach(f => {
          if (!f || !f.url) return;
          if (existingLinkUrls.has(f.url)) return; // already represented
          const isPdf = f.name && f.name.toLowerCase().endsWith('.pdf');
          const isImg = f.name && f.name.match(/\.(png|jpe?g|webp|gif)$/i);
          mergedStudyLinks.unshift({
            id: `file-${f.id || Date.now()}`,
            title: f.name || 'เอกสารที่อัปโหลด',
            sub: `Cloud Vault (${f.size ? (f.size / 1024).toFixed(1) + ' KB' : ''})`,
            type: isPdf ? 'pdf' : isImg ? 'image' : 'file',
            url: f.url,
            desc: `บันทึกเมื่อ ${f.uploadedAt ? new Date(f.uploadedAt).toLocaleString('th-TH') : 'ก่อนหน้า'}`,
            folderId: 'f-uploads',
            createdAt: f.uploadedAt || new Date().toISOString()
          });
          existingLinkUrls.add(f.url);
        });

        const merged = {
          ...existing,
          ...parsed,
          files: mergedFiles,
          studyLinks: mergedStudyLinks,
          updatedAt: new Date().toISOString()
        };
        await dbAdapter.saveUserData(key, merged);
        store[key] = merged;
        saveStore();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, key, updatedAt: merged.updatedAt }));
      });
      return;
    }
  }

  // ─── Static File Serving ───
  let decodedPathname = '/';
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch (e) {
    decodedPathname = pathname;
  }
  let filePath = path.join(__dirname, decodedPathname === '/' ? 'index.html' : decodedPathname);

  // Prevent directory traversal with proper path resolution
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(__dirname);
  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Block sensitive files
  const sensitiveFiles = ['sync_store.json', 'sync_store.backup.json', 'package.json', 'package-lock.json', 'server.js', 'railway.toml', '.git'];
  const basename = path.basename(resolvedPath);
  if (sensitiveFiles.includes(basename) || resolvedPath.includes('.git')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Set caching: PDFs can be cached for a day, other files keep no‑cache
    if (ext === '.pdf') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    // Support HTTP Range requests for progressive loading
    const range = req.headers.range;
    if (range) {
      const positions = range.replace(/bytes=/, '').split('-');
      let start = parseInt(positions[0], 10);
      const total = stats.size;
      const end = positions[1] ? parseInt(positions[1], 10) : total - 1;
      if (isNaN(start) || start < 0) start = 0;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      const stream = fs.createReadStream(resolvedPath, { start, end });
      stream.pipe(res);
    } else {
      // No Range header – serve whole file
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      fs.createReadStream(resolvedPath).pipe(res);
    }
  });
});

// Periodic session cleanup (every hour)
setInterval(() => {
  const now = new Date();
  let changed = false;
  Object.entries(store._sessions || {}).forEach(([token, session]) => {
    if (session && session.expiresAt && new Date(session.expiresAt) < now) {
      delete store._sessions[token];
      changed = true;
    }
  });
  if (changed) saveStore();
}, 60 * 60 * 1000);

// ─── Background Scheduler: Check 15-min Class Reminders ───────
const _notifiedReminders = {}; // { 'userId_date_slot': true }

setInterval(async () => {
  if (!webpush || !store._pushSubscriptions || !vapidKeys.publicKey) return;

  const now = new Date();
  // Bangkok time UTC+7
  const bangkokTime = new Date(now.getTime() + 7 * 3600000);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = days[bangkokTime.getUTCDay()];
  const currentHour = bangkokTime.getUTCHours();
  const currentMinute = bangkokTime.getUTCMinutes();
  const nowTotalMinutes = currentHour * 60 + currentMinute;
  const todayStr = bangkokTime.toISOString().slice(0, 10);

  const userIds = new Set([
    ...Object.keys(store._pushSubscriptions || {}),
    ...Object.values(store._users || {}).map(u => u && u.id).filter(Boolean)
  ]);

  for (const userId of userIds) {
    const subs = await dbAdapter.getPushSubscriptions(userId);
    if (!subs || subs.length === 0) continue;

    const userData = (await dbAdapter.getUserData(userId)) || {};
    const curriculum = (userData.curriculum && userData.curriculum.length > 0) ? userData.curriculum : DEFAULT_BME_CURRICULUM;
    const dayClasses = curriculum.filter(c => c.day && c.day.toLowerCase() === currentDay);

    for (const cls of dayClasses) {
      if (!cls.start) continue;
      const [sh, sm] = cls.start.split(':').map(Number);
      if (isNaN(sh) || isNaN(sm)) continue;
      const classStartMinutes = sh * 60 + sm;
      const diffMinutes = classStartMinutes - nowTotalMinutes;

      // Check if class starts in 14 to 16 minutes
      if (diffMinutes >= 14 && diffMinutes <= 16) {
        const reminderKey = `${userId}_${todayStr}_${cls.id || cls.code || cls.name}_${cls.start}`;
        if (_notifiedReminders[reminderKey]) continue;
        _notifiedReminders[reminderKey] = true;

        const payload = JSON.stringify({
          title: `⏰ อีก 15 นาที: ${cls.name || cls.code}`,
          body: `รหัส ${cls.code || ''} ${cls.room ? 'ห้อง ' + cls.room : ''} (เวลา ${cls.start} - ${cls.end || ''})`,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          data: { url: '/' }
        });

        for (const sub of subs) {
          try {
            await webpush.sendNotification(sub, payload);
          } catch (pushErr) {
            console.warn('⚠️ Push notification failed for sub:', pushErr.statusCode);
          }
        }
      }
    }
  }
}, 60000);

async function startServer() {
  if (supabase) {
    try {
      await dbAdapter.loadSystemAuth();
    } catch (e) {
      console.warn('⚠️ Could not preload system auth from Supabase:', e.message);
    }
  }

  server.listen(PORT, () => {
    console.log(`🚀 E-Calendar Server running on port ${PORT} with Multi-User & iCal Live Feed`);
  });
}

startServer();