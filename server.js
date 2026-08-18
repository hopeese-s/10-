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

// In-memory store + file persistence
let store = {
  _users: {},     // { [username]: { id, username, displayName, passwordHash, salt, calendarKey, role, createdAt } }
  _sessions: {},  // { [token]: { userId, username, role, expiresAt } }
  _calKeys: {}    // { [calendarKey]: userId }
};

try {
  if (fs.existsSync(DB_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    store = {
      _users: loaded._users || {},
      _sessions: loaded._sessions || {},
      _calKeys: loaded._calKeys || {},
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

function saveStore() {
  try {
    if (fs.existsSync(DB_FILE)) {
      try { fs.copyFileSync(DB_FILE, DB_BACKUP_FILE); } catch (_) {}
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('Error saving DB file:', e);
    try { fs.writeFileSync(DB_BACKUP_FILE, JSON.stringify(store, null, 2)); } catch (_) {}
  }
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

// MIME Types for Static Serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.pdf':  'application/pdf',
  '.ics':  'text/calendar; charset=utf-8',
};

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
  // dateStr: '2026-08-17', timeStr: '09:30' -> '20260817T093000'
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '') + '00';
  return cleanDate + 'T' + cleanTime;
}

// Generate RFC 5545 .ics Feed
function generateIcsCalendar(userId, includeRoutines = false) {
  // Base anchor week: Monday 2026-08-17 (Semester 1/2026 Mahidol)
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

  let ics = [];
  ics.push('BEGIN:VCALENDAR');
  ics.push('VERSION:2.0');
  ics.push('PRODID:-//E-Calendar//BME Study Dashboard 2026//TH');
  ics.push('CALSCALE:GREGORIAN');
  ics.push('METHOD:PUBLISH');
  ics.push('X-WR-CALNAME:E-Calendar (BME Study & Schedule)');
  ics.push('X-WR-TIMEZONE:Asia/Bangkok');
  ics.push('X-WR-CALDESC:BME Mahidol 2026 Study Blocks and Class Schedule');

  // VTIMEZONE Asia/Bangkok (+0700)
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

  // Build events list
  const events = [...DEFAULT_BME_ROUTINE_EVENTS];

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

    // 15-minute advance reminder alarm
    ics.push('BEGIN:VALARM');
    ics.push('ACTION:DISPLAY');
    ics.push(`DESCRIPTION:เตือนความจำ: อีก 15 นาทีจะถึง ${summary}`);
    ics.push('TRIGGER:-PT15M');
    ics.push('END:VALARM');

    // Extra 0-minute alarm on study block start
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

// ─── HTTP Server & API Routing ─────────────────────────────
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // ─── Helper: Parse JSON Body ───
  function parseJsonBody(callback) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        callback(null, parsed);
      } catch (e) {
        callback(e, null);
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
    parseJsonBody((err, data) => {
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

      if (store._users[username]) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Username นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น' }));
        return;
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(data.password, salt);
      const isFirstUser = Object.keys(store._users).length === 0;
      const role = isFirstUser ? 'admin' : 'student';
      const userId = 'u_' + username;
      const calendarKey = generateCalendarKey();

      const user = {
        id: userId,
        username,
        displayName: (data.displayName || username).trim(),
        passwordHash,
        salt,
        role,
        calendarKey,
        createdAt: new Date().toISOString()
      };

      store._users[username] = user;
      store._calKeys[calendarKey] = userId;

      // Clone official curriculum & shared resources to new student space (no personal routine/checklist)
      const masterTemplate = store['1'] || store['u_admin'] || {};
      store[userId] = {
        version: 1,
        updatedAt: new Date().toISOString(),
        checklist: {},
        subjects: {},
        customBlocks: {},
        curriculum: masterTemplate.curriculum || [],
        studyFolders: masterTemplate.studyFolders || [],
        studyLinks: (masterTemplate.studyLinks || []).filter(l => l.isShared !== false)
      };

      // Create session
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
      store._sessions[token] = { userId, username, role, expiresAt };

      saveStore();

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
    parseJsonBody((err, data) => {
      if (err || !data.username || !data.password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'กรุณากรอก Username และ Password' }));
        return;
      }

      const username = data.username.toLowerCase().trim();
      const user = store._users[username];

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

      // Ensure calendarKey exists
      if (!user.calendarKey) {
        user.calendarKey = generateCalendarKey();
        store._calKeys[user.calendarKey] = user.id;
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      store._sessions[token] = { userId: user.id, username, role: user.role, expiresAt };

      saveStore();

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
    if (token && store._sessions[token]) {
      delete store._sessions[token];
      saveStore();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
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

    // Map calendarKey to userId
    let targetUserId = store._calKeys[calKey] || calKey;

    // Check if user exists or fallback to master default
    const icsContent = generateIcsCalendar(targetUserId, url.searchParams.get('routines') === '1');

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

    if (req.method === 'GET') {
      const data = store[key] || null;
      res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data || { error: 'Not found' }));
      return;
    }

    if (req.method === 'POST') {
      parseJsonBody((err, parsed) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return;
        }

        store[key] = {
          ...parsed,
          updatedAt: new Date().toISOString()
        };
        saveStore();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, key, updatedAt: store[key].updatedAt }));
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

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 E-Calendar Server running on port ${PORT} with Multi-User & iCal Live Feed`);
});
