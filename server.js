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

// ─── Environment & Cloud Configuration ────────────────────────
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT) || Boolean(process.env.RENDER);
const STRICT_CLOUD_MODE = process.env.STRICT_CLOUD_MODE === 'true';

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

// ─── LINE Messaging API Setup ─────────────────────────────────
const LINE_CHANNEL_ACCESS_TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').replace(/['"]/g, '').trim();
const LINE_CHANNEL_SECRET = (process.env.LINE_CHANNEL_SECRET || '').replace(/['"]/g, '').trim();
const hasLine = Boolean(LINE_CHANNEL_ACCESS_TOKEN && LINE_CHANNEL_SECRET);

if (hasLine) {
  console.log('✅ LINE Messaging API configured for Push & Webhook');
} else {
  console.log('ℹ️ LINE Messaging API not configured (LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET missing)');
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
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('user_sync_data')
          .select('*')
          .eq('user_id', String(userId))
          .limit(1);
        if (!error && data && data.length > 0 && data[0].data) {
          return {
            ...data[0].data,
            version: data[0].version || data[0].data.version || 0,
            updatedAt: data[0].updated_at || data[0].data.updatedAt || new Date().toISOString()
          };
        }
      } catch (err) {
        console.warn('⚠️ Supabase getUserData error:', err.message);
      }
    }
    return store[userId] || null;
  },

  async saveUserData(userId, payload) {
    // 1. In-memory & local store update
    store[userId] = payload;
    saveStore();

    // 2. Persistent Supabase PostgreSQL write
    if (supabase) {
      const record = {
        user_id: String(userId),
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
          console.warn(`⚠️ Supabase missing columns for [${userId}], using minimal schema.`);
          delete record.version;
          delete record.updated_at;
          const retry = await supabase.from('user_sync_data').upsert(record, { onConflict: 'user_id' });
          upsertErr = retry.error;
        }

        if (upsertErr) {
          console.warn(`⚠️ Supabase saveUserData upsert notice for [${userId}]:`, upsertErr.message);
          // Fallback: Delete existing and Insert
          await supabase.from('user_sync_data').delete().eq('user_id', String(userId));
          const { error: insertErr } = await supabase.from('user_sync_data').insert(record);
          if (insertErr) {
            console.error(`❌ Supabase saveUserData fallback insert error for [${userId}]:`, insertErr.message);
          } else {
            console.log(`✅ Supabase saveUserData saved via insert fallback for [${userId}]`);
          }
        }
      } catch (err) {
        console.error(`❌ Supabase saveUserData exception for [${userId}]:`, err.message);
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
          console.log(`✅ Loaded ${Object.keys(store._users).length} User Account(s) & System Config permanently from Supabase`);
        } else if (error) {
          console.warn('⚠️ Supabase loadSystemAuth notice:', error.message);
        }
      } catch (err) {
        console.warn('⚠️ Supabase loadSystemAuth exception:', err.message);
      }
    }
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
  { code: 'EGBI122', name: 'Computer Programming', credits: '3 (2-2-5)', type: 'บรรยาย + ปฏิบัติการ', room: 'R335/1, R335/2', schedule: 'จันทร์ 13:30 - 17:30', day: 'monday', start: '13:30', end: '17:30', classroomUrl: '', driveUrl: '', desc: 'หลักการเขียนโปรแกรม โครงสร้างข้อมูล และการประยุกต์ใช้ในงานวิศวกรรมชีวแพทย์' },
  { code: 'LAEN182', name: 'English for General Academic Purposes', credits: '2 (2-0-4)', type: 'บรรยาย', room: 'Room 320', schedule: 'อังคาร 08:30 - 10:30', day: 'tuesday', start: '08:30', end: '10:30', classroomUrl: '', driveUrl: '', desc: 'ภาษาอังกฤษเพื่อการสื่อสารเชิงวิชาการ ทักษะการอ่าน เขียน และการนำเสนอ' },
  { code: 'SCBE102', name: 'General Biology Laboratory 1', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'Lab SC', schedule: 'อังคาร 13:30 - 16:30', day: 'tuesday', start: '13:30', end: '16:30', classroomUrl: '', driveUrl: '', desc: 'ปฏิบัติการชีววิทยาทั่วไป กล้องจุลทรรศน์ โครงสร้างเซลล์และเนื้อเยื่อ' },
  { code: 'EGBI100', name: 'BME in the Real World', credits: '1 (1-0-2)', type: 'บรรยาย', room: 'R238', schedule: 'อังคาร 17:40 - 18:40', day: 'tuesday', start: '17:40', end: '18:40', classroomUrl: 'https://classroom.google.com/u/6/c/ODcwMzEwOTI0OTg2', driveUrl: '', desc: 'บทนำสู่วิศวกรรมชีวแพทย์ เครื่องมือแพทย์ และระบบสาธารณสุขในโลกจริง' },
  { code: 'SCMA101', name: 'Mathematics I', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC1-152', schedule: 'พุธ 09:00 - 11:00', day: 'wednesday', start: '09:00', end: '11:00', classroomUrl: 'https://classroom.google.com/u/6/c/ODcxNjY1MDM2MTY2', driveUrl: '', desc: 'แคลคูลัส อนุพันธ์ อินทิกรัล และการประยุกต์ใช้ในทางวิศวกรรมศาสตร์' },
  { code: 'SCSL190', name: 'Wonderful Life (Biology)', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC3-303', schedule: 'พฤหัสบดี 09:30 - 12:30', day: 'thursday', start: '09:30', end: '12:30', classroomUrl: 'https://classroom.google.com/u/6/c/Nzk4Mzk2MTI3MDI1', driveUrl: '', desc: 'ชีววิทยาของสิ่งมีชีวิต วิวัฒนาการ และความหลากหลายทางชีวภาพ' },
  { code: 'SCCH161', name: 'General Chemistry', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC2-323', schedule: 'พฤหัสบดี 13:30 - 16:30', day: 'thursday', start: '13:30', end: '16:30', classroomUrl: 'https://classroom.google.com/u/6/c/ODcwMjc5NzAyMjcy', driveUrl: '', desc: 'เคมีทั่วไป โครงสร้างอะตอม พันธะเคมี จลนศาสตร์ และสมดุลเคมี' },
  { code: 'SCPY111', name: 'Physics Laboratory I', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'Lab SC', schedule: 'ศุกร์ 09:30 - 12:30', day: 'friday', start: '09:30', end: '12:30', classroomUrl: 'https://classroom.google.com/u/6/c/ODU1NzE4MDAyNzE5', driveUrl: '', desc: 'การทดลองฟิสิกส์พื้นฐาน การวัด ค่าความคลาดเคลื่อน และการวิเคราะห์ผล' },
  { code: 'SCCH169', name: 'Chemistry Laboratory', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'L2-201', schedule: 'ศุกร์ 13:30 - 16:30', day: 'friday', start: '13:30', end: '16:30', classroomUrl: '', driveUrl: '', desc: 'ปฏิบัติการเคมี การไตเตรท การสังเคราะห์สาร และการทดสอบคุณสมบัติ' }
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
const DEFAULT_BME_ROUTINE_EVENTS = [
  // Monday
  { day: 'MO', dayNum: 1, start: '09:30', end: '12:30', title: 'SCPY161 General Physics I', sub: 'ห้อง L2-002', type: 'class', isClass: true },
  { day: 'MO', dayNum: 1, start: '13:30', end: '17:30', title: 'EGBI122 Computer Programming', sub: 'ห้อง R335/1, R335/2', type: 'class', isClass: true },
  { day: 'MO', dayNum: 1, start: '19:00', end: '20:00', title: 'Study Block 1 — GenPhy / CompPro', sub: 'ทบทวนวิชาที่ 1 (60 นาที)', type: 'study', isStudyBlock: true },
  { day: 'MO', dayNum: 1, start: '20:30', end: '21:30', title: 'Study Block 2 — เคลียร์การบ้าน / ทบทวน', sub: 'ทบทวนวิชาที่ 2 (60 นาที)', type: 'study', isStudyBlock: true },

  // Tuesday
  { day: 'TU', dayNum: 2, start: '08:30', end: '10:30', title: 'LAEN182 English for General Academic', sub: 'ห้อง 320', type: 'class', isClass: true },
  { day: 'TU', dayNum: 2, start: '13:30', end: '16:30', title: 'SCBE102 General Biology Laboratory 1', sub: 'ห้อง Lab SC', type: 'class', isClass: true },
  { day: 'TU', dayNum: 2, start: '17:40', end: '18:40', title: 'EGBI100 BME in the Real World', sub: 'ห้อง R238', type: 'class', isClass: true },
  { day: 'TU', dayNum: 2, start: '19:30', end: '20:30', title: 'Study Block 3 — Bio Lab / English', sub: 'ทบทวนวิชาที่ 3 (60 นาที)', type: 'study', isStudyBlock: true },
  { day: 'TU', dayNum: 2, start: '20:45', end: '21:45', title: 'Study Block 4 — สรุปเนื้อหา BME Real World', sub: 'ทบทวนวิชาที่ 4 (60 นาที)', type: 'study', isStudyBlock: true },

  // Wednesday
  { day: 'WE', dayNum: 3, start: '09:00', end: '11:00', title: 'SCMA101 Mathematics I', sub: 'ห้อง SC1-152', type: 'class', isClass: true },
  { day: 'WE', dayNum: 3, start: '13:30', end: '14:30', title: 'Study Block 5 — ทบทวน Calculus / Math', sub: 'ฝึกทำโจทย์คณิตศาสตร์ (60 นาที)', type: 'study', isStudyBlock: true },

  // Thursday
  { day: 'TH', dayNum: 4, start: '09:30', end: '12:30', title: 'SCSL190 Wonderful Life (Biology)', sub: 'ห้อง SC3-303', type: 'class', isClass: true },
  { day: 'TH', dayNum: 4, start: '13:30', end: '16:30', title: 'SCCH161 General Chemistry', sub: 'ห้อง SC2-323', type: 'class', isClass: true },
  { day: 'TH', dayNum: 4, start: '19:30', end: '20:30', title: 'Study Block 6 — General Chemistry ทบทวน', sub: 'สรุปสูตรและโจทย์เคมี (60 นาที)', type: 'study', isStudyBlock: true },
  { day: 'TH', dayNum: 4, start: '20:45', end: '21:45', title: 'Study Block 7 — Wonderful Life สรุปชีวะ', sub: 'ทบทวนวิชาชีววิทยา (60 นาที)', type: 'study', isStudyBlock: true },

  // Friday
  { day: 'FR', dayNum: 5, start: '09:30', end: '12:30', title: 'SCPY111 Physics Laboratory I', sub: 'ห้อง Lab SC', type: 'class', isClass: true },
  { day: 'FR', dayNum: 5, start: '13:30', end: '16:30', title: 'SCCH169 Chemistry Laboratory', sub: 'ห้อง L2-201', type: 'class', isClass: true },
  { day: 'FR', dayNum: 5, start: '19:30', end: '20:30', title: 'Study Block 8 — เคลียร์ Lab Report & การบ้าน', sub: 'เขียนรายงานแล็ปฟิสิกส์/เคมี (60 นาที)', type: 'study', isStudyBlock: true },

  // Saturday
  { day: 'SA', dayNum: 6, start: '10:00', end: '11:30', title: 'Study Block 9 — ทบทวนภาพรวมประจำสัปดาห์ (Weekly Review)', sub: 'เก็บตกทุกวิชาและเตรียมตัวล่วงหน้า (90 นาที)', type: 'study', isStudyBlock: true },
];

// Helper: Format date for iCalendar RFC 5545
function formatIcsDateTime(dateStr, timeStr) {
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '') + '00';
  return cleanDate + 'T' + cleanTime;
}

// Generate RFC 5545 .ics Feed with real-time curriculum data
function generateIcsCalendar(userId, includeRoutines = false, includeStudy = true, includeClass = true) {
  const baseDates = {
    MO: '2026-08-17',
    TU: '2026-08-18',
    WE: '2026-08-19',
    TH: '2026-08-20',
    FR: '2026-08-21',
    SA: '2026-08-22',
    SU: '2026-08-23'
  };

  const userCustom = store[userId] || {};
  const customBlocks = userCustom.customBlocks || {};
  const curriculum = userCustom.curriculum || DEFAULT_BME_CURRICULUM;

  let ics = [];
  ics.push('BEGIN:VCALENDAR');
  ics.push('VERSION:2.0');
  ics.push('PRODID:-//E-Calendar//BME Study Dashboard 2026//TH');
  ics.push('CALSCALE:GREGORIAN');
  ics.push('METHOD:PUBLISH');
  ics.push('X-WR-CALNAME:E-Calendar (BME Study & Schedule)');
  ics.push('X-WR-TIMEZONE:Asia/Bangkok');
  ics.push('X-WR-CALDESC:BME Mahidol 2026 Study Blocks and Class Schedule');

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

  // Build events from curriculum (real-time)
  const events = [];
  
  if (includeClass) {
  // Add curriculum classes with real room/schedule data
  curriculum.forEach((course, idx) => {
    if (!course.schedule || !course.day) return;
    const dayMap = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };
    const dayCode = dayMap[course.day] || course.day;
    if (!dayCode || !baseDates[dayCode]) return;
    
    const [startTime, endTime] = (course.schedule.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/) || [null, course.start || '09:00', course.end || '10:00']).slice(1);
    
    events.push({
      day: dayCode,
      start: startTime || course.start || '09:00',
      end: endTime || course.end || '10:00',
      title: `${course.code} ${course.name}`,
      sub: course.room ? `ห้อง ${course.room}` : '',
      type: 'class',
      isClass: true
    });
  });
  } // end if (includeClass)

  // Add default routine events (respecting category filters and deduplicating against curriculum)
  DEFAULT_BME_ROUTINE_EVENTS.forEach(ev => {
    if (ev.isClass || ev.type === 'class') {
      if (!includeClass) return;
      const matchingCourse = curriculum.find(c => {
        const dayMap = { MO: 'monday', TU: 'tuesday', WE: 'wednesday', TH: 'thursday', FR: 'friday', SA: 'saturday', SU: 'sunday' };
        return dayMap[ev.day] === c.day && c.start === ev.start;
      });
      if (matchingCourse) return; // Skip duplicate class event
    } else if (ev.isStudyBlock || ev.type === 'study') {
      if (!includeStudy) return;
    } else {
      if (!includeRoutines) return;
    }
    events.push({ ...ev });
  });

  if (includeStudy) {
  // Add custom blocks from user's study data
  Object.entries(customBlocks).forEach(([day, blocks]) => {
    const dayMap = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };
    const dayCode = dayMap[day];
    if (!dayCode || !Array.isArray(blocks)) return;
    blocks.forEach((block, idx) => {
      if (!block.start || !block.end) return;
      events.push({
        day: dayCode,
        start: block.start,
        end: block.end,
        title: block.title || 'Custom Block',
        sub: block.notes || '',
        type: 'study',
        isStudyBlock: true
      });
    });
  });
  } // end if (includeStudy)

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
    const desc = (ev.sub || '') + (isStudy ? '\nระบบเตือนความจำจาก E-Calendar: อย่าลืมเตรียมชีทสรุปและเริ่มอ่านหนังสือ!' : '\nวิชาเรียน BME Mahidol');

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
    return false;
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
    }
    return res.ok;
  } catch (e) {
    console.error('❌ LINE sendLinePush exception:', e.message);
    return false;
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
          { type: 'text', text: 'E-CALENDAR DASHBOARD', color: '#ffffff', size: 'xxs', weight: 'bold', opacity: 0.8 },
          { type: 'text', text: `📅 ตาราง ${dayTitle}`, color: '#ffffff', size: 'lg', weight: 'bold' },
          { type: 'text', text: dateStr, color: '#ffffff', size: 'xs', opacity: 0.9, margin: 'xs' }
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
              uri: 'https://daily-study-dashboard-production.up.railway.app'
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
  const courses = curriculum || DEFAULT_BME_CURRICULUM;

  let found = courses.find(c => c.code.toLowerCase() === q);
  if (found) return found;

  found = courses.find(c => c.code.toLowerCase().includes(q) || q.includes(c.code.toLowerCase()));
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
    'chemlab': 'SCCH169'
  };

  for (const [kw, code] of Object.entries(keywordMap)) {
    if (q.includes(kw)) {
      const match = courses.find(c => c.code === code);
      if (match) return match;
    }
  }

  found = courses.find(c => c.room && c.room.toLowerCase().includes(q));
  if (found) return found;

  found = courses.find(c => c.name.toLowerCase().includes(q));
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
        uri: course.classroomUrl
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
      uri: 'https://daily-study-dashboard-production.up.railway.app'
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
          { type: 'text', text: 'COURSE INFORMATION', color: '#ffffff', size: 'xxs', weight: 'bold', opacity: 0.85 },
          { type: 'text', text: `${course.code}`, color: '#ffffff', size: 'xl', weight: 'bold' },
          { type: 'text', text: `${course.name}`, color: '#ffffff', size: 'sm', wrap: true, opacity: 0.95 }
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
          { type: 'text', text: `${dayClasses.length} คาบเรียน`, color: '#ffffff', size: 'xxs', opacity: 0.9 }
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
            uri: url
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
          { type: 'text', text: 'E-CALENDAR STUDY HUB', color: '#ffffff', size: 'xxs', weight: 'bold', opacity: 0.85 },
          { type: 'text', text: '📚 รวมลิงก์ Google Classroom', color: '#ffffff', size: 'md', weight: 'bold' },
          { type: 'text', text: 'คลิกเพื่อเข้าห้องเรียนและส่งงานได้ทันที', color: '#ffffff', size: 'xs', opacity: 0.9, margin: 'xs' }
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
              uri: 'https://daily-study-dashboard-production.up.railway.app'
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
        backgroundColor: '#10B981',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: 'TO-DO LIST SYNCED', color: '#ffffff', size: 'xxs', weight: 'bold', opacity: 0.9 },
          { type: 'text', text: '✅ เพิ่มงานสำเร็จ!', color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: `${task.title}`, weight: 'bold', size: 'sm', color: '#111827', wrap: true },
          ...(task.dueDate ? [
            { type: 'text', text: `⏰ กำหนดส่ง: ${task.dueDate}`, size: 'xs', color: '#EF4444', margin: 'xs', weight: 'bold' }
          ] : []),
          { type: 'text', text: `(เหลืองานค้างทั้งหมด ${totalPending} รายการ)`, size: 'xs', color: '#6B7280', margin: 'sm' }
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: { type: 'message', label: '📝 ดูงานทั้งหมด', text: 'งานค้าง' },
            style: 'primary',
            color: '#C45A1B',
            height: 'sm'
          },
          {
            type: 'button',
            action: { type: 'message', label: `✅ ติ๊กเสร็จ (${task.id || 1})`, text: `เสร็จ ${task.id || 1}` },
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
          { type: 'text', text: 'EXAM COUNTDOWN', color: '#ffffff', size: 'xxs', weight: 'bold', opacity: 0.85 },
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
          { type: 'text', text: 'DAILY BRIEFING', color: '#ffffff', size: 'xxs', weight: 'bold', opacity: 0.9 },
          { type: 'text', text: `🌅 สรุปข้อมูล ${dayName}`, color: '#ffffff', size: 'lg', weight: 'bold' },
          { type: 'text', text: dateStr, color: '#ffffff', size: 'xs', opacity: 0.9 }
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

function buildClassReminderFlex(course, timeUntilStr = 'อีก 15 นาที') {
  return {
    type: 'flex',
    altText: `⏰ แจ้งเตือนคาบเรียน: ${course.code} ${course.name} กำลังจะเริ่มใน ${timeUntilStr}!`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#DC2626',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: '⚡ CLASS REMINDER', color: '#ffffff', size: 'xxs', weight: 'bold', opacity: 0.85 },
          { type: 'text', text: `⏰ กำลังจะเริ่มเรียนใน ${timeUntilStr}!`, color: '#ffffff', size: 'md', weight: 'bold' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: `${course.code}`,
            size: 'xs',
            weight: 'bold',
            color: '#DC2626'
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
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '📖 ดูเอกสารการเรียน & Dashboard',
              uri: course.classroomUrl || 'https://daily-study-dashboard-production.up.railway.app'
            },
            style: 'secondary',
            height: 'sm'
          }
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
          { type: 'text', text: 'E-CALENDAR NOTIFICATION', color: '#ffffff', size: 'xxs', weight: 'bold', opacity: 0.9 },
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

// ─── Automated 15-Minute Pre-Class Reminder Scheduler (Every 60s) ───
const sentReminderKeys = new Set();

setInterval(async () => {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];

    // Time 15 minutes in the future
    const targetTime = new Date(now.getTime() + 15 * 60 * 1000);
    const targetHHMM = String(targetTime.getHours()).padStart(2, '0') + ':' + String(targetTime.getMinutes()).padStart(2, '0');
    const todayDateStr = now.toISOString().slice(0, 10);

    if (sentReminderKeys.size > 300) sentReminderKeys.clear();

    const activeUserIds = new Set([
      '1',
      ...Object.values(store._users || {}).map(u => u.id),
      ...Object.values(store._lineUsers || {})
    ]);

    for (const userId of activeUserIds) {
      const userData = (await dbAdapter.getUserData(userId)) || {};
      const curriculum = userData.curriculum || DEFAULT_BME_CURRICULUM;

      for (const course of curriculum) {
        if (course.day === currentDay && course.start === targetHHMM) {
          const reminderKey = `${todayDateStr}_${userId}_${course.code}_${course.start}`;
          if (sentReminderKeys.has(reminderKey)) continue;
          sentReminderKeys.add(reminderKey);

          console.log(`⏰ [Auto-Reminder] 15-min pre-class reminder triggered for ${course.code} to user [${userId}]`);

          // 1. Send Web Push
          const subs = await dbAdapter.getPushSubscriptions(userId);
          if (subs && subs.length > 0 && webpush && vapidKeys.publicKey) {
            const pushPayload = JSON.stringify({
              title: `⏰ อีก 15 นาทีเริ่มเรียน: ${course.code}`,
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

          // 2. Send LINE Push
          const lineUserId = store._userLine && store._userLine[userId];
          if (lineUserId && hasLine) {
            await sendLinePush(lineUserId, [buildClassReminderFlex(course, 'อีก 15 นาที')]);
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

          if (R2_PUBLIC_DOMAIN) {
            fileUrl = `${R2_PUBLIC_DOMAIN.replace(/\/$/, '')}/${filename}`;
          } else {
            fileUrl = `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${filename}`;
          }
          uploadedToR2 = true;
          console.log(`☁️ File uploaded to Cloudflare R2 (Direct CDN URL): ${fileUrl}`);

          // Remove local file to save disk space on ephemeral Railway container
          fs.unlink(filePath, () => {});
        } catch (r2Err) {
          console.warn('⚠️ Cloudflare R2 upload failed, keeping local file URL fallback:', r2Err.message);
        }
      }

      // Store file metadata in unified user data
      const ownerData = (await dbAdapter.getUserData(ownerId)) || {};
      if (!ownerData.files) ownerData.files = {};
      const fileRecord = {
        id: fileId,
        name: url.searchParams.get('name') || 'file',
        url: fileUrl,
        size,
        uploadedToR2,
        uploadedAt: new Date().toISOString()
      };
      ownerData.files[fileId] = fileRecord;
      await dbAdapter.saveUserData(ownerId, ownerData);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, file: fileRecord }));
    });
    return;
  }

  // ─── API: Serve Uploaded Files (GET /uploads/:filename) ───
  if (pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname);
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!filePath.startsWith(UPLOAD_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });
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
      const userId = 'u_' + username;
      const calendarKey = generateCalendarKey();

      const user = {
        id: userId,
        username,
        displayName: sanitizeDisplayName(data.displayName || username),
        passwordHash,
        salt,
        role,
        calendarKey,
        createdAt: new Date().toISOString()
      };

      if (!store._users) store._users = {};
      if (!store._calKeys) store._calKeys = {};
      if (!store._sessions) store._sessions = {};

      store._users[username] = user;
      store._calKeys[calendarKey] = userId;

      const masterTemplate = (await dbAdapter.getUserData('1')) || (await dbAdapter.getUserData('u_admin')) || store['1'] || {};
      const initialUserData = {
        version: 1,
        updatedAt: new Date().toISOString(),
        checklist: {},
        subjects: {},
        customBlocks: {},
        curriculum: masterTemplate.curriculum || DEFAULT_BME_CURRICULUM || [],
        studyFolders: masterTemplate.studyFolders || [],
        studyLinks: (masterTemplate.studyLinks || []).filter(l => l && l.isShared !== false),
        files: {}
      };

      // 1. Save new user data template directly into Supabase PostgreSQL
      await dbAdapter.saveUserData(userId, initialUserData);

      // 2. Create session with 30-day expiry
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      store._sessions[token] = { userId, username, role, expiresAt };

      // 3. Save all users & sessions directly into Supabase PostgreSQL
      await dbAdapter.saveSystemAuth();
      saveStore();

      console.log(`✅ New user registered & saved permanently to Supabase: ${username} (${role})`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
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
      const targetUser = Object.values(store._users || {}).find(u => u.id === linkedUserId) || { id: linkedUserId, displayName: 'นักศึกษา' };

      // ─── 2. Command: +งาน / +การบ้าน / จด <ชื่องาน> <กำหนดส่ง> ───
      const addTaskMatch = text.match(/^(\+|เพิ่มงาน|เพิ่มการบ้าน|จด|การบ้านใหม่|task)\s*(.+)/i);
      if (addTaskMatch) {
        const rawTaskText = addTaskMatch[2].trim();
        if (rawTaskText) {
          const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
          if (!userData.tasks) userData.tasks = [];

          // Parse optional due date if contains date keywords
          let title = rawTaskText;
          let dueDate = '';
          const dateMatch = rawTaskText.match(/(กำหนดส่ง|ส่ง|ภายใน|ก่อน)\s*[:\-]?\s*(.+)$/i);
          if (dateMatch) {
            title = rawTaskText.slice(0, dateMatch.index).trim();
            dueDate = dateMatch[2].trim();
          }

          const newTask = {
            id: Date.now().toString(),
            title: title || rawTaskText,
            dueDate: dueDate || '',
            done: false,
            createdAt: new Date().toISOString()
          };

          userData.tasks.push(newTask);
          await dbAdapter.saveUserData(linkedUserId, userData);

          const pendingCount = userData.tasks.filter(t => !t.done).length;
          await sendLineReply(replyToken, [buildTaskAddedFlex(newTask, pendingCount)]);
          return;
        }
      }

      // ─── 3. Command: เสร็จ / ทำเสร็จ / done <ลำดับ> ───
      const doneMatch = text.match(/^(เสร็จ|ทำเสร็จ|done|check|ลบงาน)\s*(\d+)/i);
      if (doneMatch) {
        const targetIndex = parseInt(doneMatch[2], 10) - 1;
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const tasks = userData.tasks || userData.todos || [];
        const pending = tasks.filter(t => !t.done);

        if (targetIndex >= 0 && targetIndex < pending.length) {
          const finishedTask = pending[targetIndex];
          finishedTask.done = true;
          finishedTask.completedAt = new Date().toISOString();
          await dbAdapter.saveUserData(linkedUserId, userData);

          const remainingCount = tasks.filter(t => !t.done).length;
          await sendLineReply(replyToken, `🎉 เยี่ยมมากครับ! ทำงาน "${finishedTask.title}" เสร็จแล้ว ✨\n(เหลืองานค้างอีก ${remainingCount} รายการ)`);
        } else {
          await sendLineReply(replyToken, `❌ ไม่พบลำดับงานที่ ${doneMatch[2]} กรุณาพิมพ์ "งานค้าง" เพื่อดูรายการและลำดับงานครับ`);
        }
        return;
      }

      // ─── 4. Command: ตารางสัปดาห์ / สัปดาห์นี้ / week ───
      if (/^(ตารางสัปดาห์|สัปดาห์นี้|ทั้งสัปดาห์|ตารางทั้งหมด|week|all schedule)/i.test(text)) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || DEFAULT_BME_CURRICULUM;
        await sendLineReply(replyToken, [buildWeeklyScheduleFlex(curriculum)]);
        return;
      }

      // ─── 5. Command: คลาสรูม / classroom / ชีท / ลิงก์เรียน ───
      if (/^(คลาสรูม|classroom|ลิงก์เรียน|ลิงก์ห้องเรียน|ชีท|ชีทเรียน|google classroom)/i.test(text)) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || DEFAULT_BME_CURRICULUM;
        const links = userData.studyLinks || DEFAULT_BME_STUDY_LINKS;
        await sendLineReply(replyToken, [buildClassroomDirectoryFlex(curriculum, links)]);
        return;
      }

      // ─── 6. Command: D-Day / สอบ / วันสอบ / นับถอยหลัง ───
      if (/^(สอบ|วันสอบ|dday|นับถอยหลัง|exam|ตารางสอบ)/i.test(text)) {
        await sendLineReply(replyToken, [buildDDayCountdownFlex()]);
        return;
      }

      // ─── 7. Command: สรุปเช้า / เช้านี้ / สรุปวัน / briefing ───
      if (/^(สรุปเช้า|เช้านี้|สรุปวัน|morning|briefing|สรุปวันนี้)/i.test(text)) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayNamesTH = {
          sunday: 'วันอาทิตย์', monday: 'วันจันทร์', tuesday: 'วันอังคาร',
          wednesday: 'วันพุธ', thursday: 'วันพฤหัสบดี', friday: 'วันศุกร์', saturday: 'วันเสาร์'
        };
        const dayCode = days[now.getDay()];
        const dayName = dayNamesTH[dayCode];
        const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || DEFAULT_BME_CURRICULUM;
        const todayClasses = curriculum.filter(c => c.day === dayCode).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
        const dayMapCode = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };
        const todayRoutines = DEFAULT_BME_ROUTINE_EVENTS.filter(r => r.day === dayMapCode[dayCode]);
        const tasks = userData.tasks || userData.todos || [];
        const pendingTasks = tasks.filter(t => !t.done);

        await sendLineReply(replyToken, [buildDailyBriefingFlex(dayName, dateStr, todayClasses, pendingTasks, todayRoutines)]);
        return;
      }

      // ─── 8. Command: Course Finder (ค้นหารายละเอียดวิชา / ห้องเรียน) ───
      const courseMatch = findCourseMatch(text, (await dbAdapter.getUserData(linkedUserId))?.curriculum);
      if (courseMatch && (text.startsWith('วิชา') || text.startsWith('ห้อง') || text.length <= 10 || /^(sc|eg|la)/i.test(text))) {
        await sendLineReply(replyToken, [buildCourseProfileFlex(courseMatch)]);
        return;
      }

      // ─── 9. Command: ตารางวันนี้ / วันนี้ / today ───
      if (/^(ตารางวันนี้|วันนี้|today|schedule|เรียนไร|มีเรียนมั้ย)/i.test(text)) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayNamesTH = {
          sunday: 'วันอาทิตย์', monday: 'วันจันทร์', tuesday: 'วันอังคาร',
          wednesday: 'วันพุธ', thursday: 'วันพฤหัสบดี', friday: 'วันศุกร์', saturday: 'วันเสาร์'
        };
        const dayCode = days[now.getDay()];
        const dayName = dayNamesTH[dayCode];
        const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || DEFAULT_BME_CURRICULUM;
        const todayClasses = curriculum.filter(c => c.day === dayCode).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
        const dayMapCode = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };
        const todayRoutines = DEFAULT_BME_ROUTINE_EVENTS.filter(r => r.day === dayMapCode[dayCode]);

        await sendLineReply(replyToken, [buildScheduleFlex(`${dayName}`, dateStr, todayClasses, todayRoutines)]);
        return;
      }

      // ─── 10. Command: ตารางพรุ่งนี้ / พรุ่งนี้ / tomorrow ───
      if (/^(ตารางพรุ่งนี้|พรุ่งนี้|tomorrow|พรุ่งนี้เรียนไร)/i.test(text)) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        now.setDate(now.getDate() + 1);
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayNamesTH = {
          sunday: 'วันอาทิตย์', monday: 'วันจันทร์', tuesday: 'วันอังคาร',
          wednesday: 'วันพุธ', thursday: 'วันพฤหัสบดี', friday: 'วันศุกร์', saturday: 'วันเสาร์'
        };
        const dayCode = days[now.getDay()];
        const dayName = dayNamesTH[dayCode];
        const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const curriculum = userData.curriculum || DEFAULT_BME_CURRICULUM;
        const tomorrowClasses = curriculum.filter(c => c.day === dayCode).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
        const dayMapCode = { monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA', sunday: 'SU' };
        const tomorrowRoutines = DEFAULT_BME_ROUTINE_EVENTS.filter(r => r.day === dayMapCode[dayCode]);

        await sendLineReply(replyToken, [buildScheduleFlex(`${dayName} (พรุ่งนี้)`, dateStr, tomorrowClasses, tomorrowRoutines)]);
        return;
      }

      // ─── 11. Command: งานค้าง / การบ้าน / todo / deadline ───
      if (/^(งานค้าง|การบ้าน|todo|deadline|งาน|ส่งงานไรบ้าง)/i.test(text)) {
        const userData = (await dbAdapter.getUserData(linkedUserId)) || {};
        const tasks = userData.tasks || userData.todos || [];
        const pending = tasks.filter(t => !t.done && !t.completed);

        if (pending.length === 0) {
          await sendLineReply(replyToken, '🎉 ยอดเยี่ยมมาก! คุณไม่มีงานค้างหรือการบ้านที่ยังไม่เสร็จในระบบครับ ✨\n(สามารถพิมพ์ "+งาน <ชื่องาน>" เพื่อสั่งจดการบ้านเพิ่มได้ตลอดเวลา)');
        } else {
          let msg = `📝 รายการงานค้างของคุณ (${pending.length} รายการ):\n`;
          pending.slice(0, 8).forEach((t, i) => {
            msg += `\n${i + 1}. ${t.title || t.text || 'งาน'}${t.dueDate ? ` (กำหนดส่ง: ${t.dueDate})` : ''}`;
          });
          msg += `\n\n💡 ทิป: พิมพ์ "เสร็จ 1" เพื่อติ๊กงานลำดับที่ 1 ว่าเสร็จแล้ว`;
          await sendLineReply(replyToken, msg);
        }
        return;
      }

      // ─── 12. Command: ทดสอบ / test ───
      if (/^(ทดสอบ|test)/i.test(text)) {
        await sendLineReply(replyToken, [
          buildClassReminderFlex({
            code: 'SCPY161',
            name: 'General Physics I (ทดสอบแจ้งเตือน)',
            start: '09:30',
            end: '12:30',
            room: 'L2-002',
            classroomUrl: 'https://classroom.google.com/u/6/c/ODcxMTQzMDA0NzAw'
          }, 'อีก 15 นาที')
        ]);
        return;
      }

      // ─── 13. Command: ยกเลิกการผูก / unlink ───
      if (/^(ยกเลิกการผูก|unlink|logout)/i.test(text)) {
        if (store._lineUsers && store._lineUsers[lineUserId]) {
          const oldUid = store._lineUsers[lineUserId];
          delete store._lineUsers[lineUserId];
          if (store._userLine && store._userLine[oldUid]) delete store._userLine[oldUid];
          await dbAdapter.saveSystemAuth();
          saveStore();
          await sendLineReply(replyToken, '👋 ยกเลิกการผูกบัญชี E-Calendar เรียบร้อยแล้วครับ หากต้องการผูกใหม่สามารถพิมพ์ /link <Username> ได้ตลอดเวลา');
        } else {
          await sendLineReply(replyToken, 'ℹ️ บัญชี LINE นี้ยังไม่ได้ผูกกับบัญชี E-Calendar ใดๆ ครับ');
        }
        return;
      }

      // ─── Fallback: Smart Interactive Menu ───
      const isLinked = Boolean(store._lineUsers && store._lineUsers[lineUserId]);
      const helpMsg = {
        type: 'text',
        text: isLinked 
          ? `🤖 เมนูและคำสั่ง E-Calendar Bot:\n\n` +
            `📅 ตารางเรียน:\n• "ตารางวันนี้" / "ตารางพรุ่งนี้"\n• "ตารางสัปดาห์" (สรุปจันทร์-ศุกร์)\n• "วิชา ฟิสิกส์" หรือ "SCPY161" (ค้นหารายละเอียดวิชา)\n\n` +
            `📝 การบ้าน & งานค้าง:\n• "+งาน <ชื่องาน> ส่ง <วันที่>" (สั่งจดงาน)\n• "งานค้าง" (ดูรายการงาน)\n• "เสร็จ 1" (ติ๊กงานลำดับที่ 1 ว่าเสร็จ)\n\n` +
            `⏳ อื่นๆ:\n• "คลาสรูม" (รวมลิงก์ Google Classroom)\n• "สอบ" (นับถอยหลังวันสอบ D-Day)\n• "สรุปเช้า" (สรุปภาพรวมวันนี้)`
          : `👋 สวัสดีครับ! บัญชี LINE นี้ยังไม่ได้ผูกกับ E-Calendar\n\nกรุณาพิมพ์:\n👉 /link <Username ของคุณ>\nเช่น: /link witchaya`,
        quickReply: {
          items: isLinked ? [
            { type: 'action', action: { type: 'message', label: '📅 ตารางวันนี้', text: 'ตารางวันนี้' } },
            { type: 'action', action: { type: 'message', label: '🗓️ ตารางสัปดาห์', text: 'ตารางสัปดาห์' } },
            { type: 'action', action: { type: 'message', label: '📝 งานค้าง', text: 'งานค้าง' } },
            { type: 'action', action: { type: 'message', label: '📚 คลาสรูม', text: 'คลาสรูม' } },
            { type: 'action', action: { type: 'message', label: '⏳ นับถอยหลังสอบ', text: 'สอบ' } },
            { type: 'action', action: { type: 'message', label: '🌅 สรุปเช้า', text: 'สรุปเช้า' } }
          ] : [
            { type: 'action', action: { type: 'message', label: '❓ วิธีใช้', text: 'วิธีใช้' } }
          ]
        }
      };
      await sendLineReply(replyToken, [helpMsg]);
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
    const lineUserId = store._userLine && store._userLine[ownerId];
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
      const lineUserId = store._userLine && store._userLine[ownerId];

      if (!hasLine) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN บนเซิร์ฟเวอร์' }));
        return;
      }

      if (!lineUserId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'บัญชีนี้ยังไม่ได้ผูกกับ LINE Bot กรุณาเพิ่มเพื่อนใน LINE แล้วพิมพ์ /link ' + (store._users[ownerId] ? store._users[ownerId].username : ownerId) }));
        return;
      }

      const success = await sendLinePush(lineUserId, [
        buildClassReminderFlex({
          code: 'SCPY161',
          name: 'General Physics I (ทดสอบแจ้งเตือนผ่าน LINE)',
          start: '09:30',
          end: '12:30',
          room: 'L2-002',
          classroomUrl: 'https://classroom.google.com/u/6/c/ODcxMTQzMDA0NzAw'
        }, 'อีก 15 นาที')
      ]);

      if (success) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'ส่งข้อความเข้า LINE เรียบร้อยแล้ว!' }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ส่งข้อความเข้า LINE ไม่สำเร็จ ตรวจสอบ Channel Access Token' }));
      }
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
    const calKey = parts[0].replace('.ics', '').trim();

    // Strict validation of calendar key token format
    if (!calKey || !/^cal_[a-zA-Z0-9_-]+$/.test(calKey)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('400 Bad Request: Invalid calendar token format');
      return;
    }

    const targetUserId = store._calKeys[calKey];
    if (!targetUserId) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: Calendar subscription feed not found or invalid token');
      return;
    }

    const includeStudy = url.searchParams.get('study') !== '0';
    const includeClass = url.searchParams.get('class') !== '0';
    const icsContent = generateIcsCalendar(targetUserId, url.searchParams.get('routines') === '1', includeStudy, includeClass);

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

        // Merge instead of overwrite to preserve files
        const existing = (await dbAdapter.getUserData(key)) || {};
        const merged = {
          ...existing,
          ...parsed,
          files: { ...(existing.files || {}), ...(parsed.files || {}) },
          updatedAt: new Date().toISOString()
        };
        await dbAdapter.saveUserData(key, merged);

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