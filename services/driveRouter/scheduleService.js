// services/driveRouter/scheduleService.js
// Resolves student's active class with Asia/Bangkok timezone & 30-min post-class grace period

const { CATEGORY_MAP, COURSE_CODE_ALIASES, SUBJECT_KEYWORDS, UNSORTED, GRACE_PERIOD_MINUTES, TIMEZONE } = require('./config');

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Converts "H:MM" or "HH:MM" string to total minutes; returns null if invalid
 */
function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Returns current timestamp in the configured timezone (Asia/Bangkok)
 */
function getBangkokNow() {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    let hour = Number(parts.hour);
    if (hour === 24) hour = 0; // some ICU versions report midnight as '24'
    // Build wall-clock fields in local timezone so getHours()/getDay() read Bangkok time
    return new Date(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      hour, Number(parts.minute), Number(parts.second)
    );
  } catch (err) {
    console.warn('⚠️ [ScheduleService] Intl timezone parsing failed, falling back to server time:', err.message);
    return now;
  }
}

/**
 * Normalizes curriculum array into standard format
 */
function normalizeCurriculum(curriculum) {
  if (!Array.isArray(curriculum)) return [];
  return curriculum.map(c => ({
    code: (c.code || c.subject_code || c.id || '').trim().toUpperCase(),
    name: c.name || c.title || '',
    day: (c.day || c.weekday || '').toLowerCase().trim(),
    start: (c.start || c.start_time || '00:00').trim(),
    end: (c.end || c.end_time || '00:00').trim(),
    room: c.room || ''
  })).filter(c => c.code && c.day && c.start && c.end);
}

/**
 * Resolves the subject corresponding to the current time, with grace period
 * @param {Array} curriculum - Array of course objects
 * @param {Date} [customNow] - Optional custom Date for testing
 * @param {string} [filename] - Optional filename for keyword-based course inference
 */
function resolveCurrentSubject(curriculum = [], customNow = null, filename = '') {
  const now = customNow || getBangkokNow();
  const dayStr = DAY_NAMES[now.getDay()];
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${date}`;

  const normalized = normalizeCurriculum(curriculum);
  const todayClasses = normalized.filter(c => c.day === dayStr);

  const currentTotalMin = now.getHours() * 60 + now.getMinutes();
  let matchedCourse = null;

  // 1. Direct match: currently in class (start <= now <= end), compared as minutes
  //    (string comparison breaks for unpadded times like "9:30" vs "09:30")
  for (const cls of todayClasses) {
    const startMin = timeToMinutes(cls.start);
    const endMin = timeToMinutes(cls.end);
    if (startMin === null || endMin === null) continue;
    if (currentTotalMin >= startMin && currentTotalMin <= endMin) {
      matchedCourse = cls;
      break;
    }
  }

  // 2. Grace period check: class ended within GRACE_PERIOD_MINUTES (default 30 mins)
  if (!matchedCourse) {
    for (const cls of todayClasses) {
      const endMin = timeToMinutes(cls.end);
      if (endMin !== null) {
        const diff = currentTotalMin - endMin;
        if (diff >= 0 && diff <= GRACE_PERIOD_MINUTES) {
          matchedCourse = cls;
          break;
        }
      }
    }
  }

  // 3. Filename & Keyword Inference (crucial for files uploaded outside class hours)
  if (!matchedCourse && filename) {
    const cleanFn = filename.toLowerCase().replace(/[._-]/g, ' ');

    const aliasEntries = Object.entries(COURSE_CODE_ALIASES);
    const labAliases = aliasEntries.filter(([, code]) => String(code).endsWith('_LAB'));
    const otherAliases = aliasEntries.filter(([, code]) => !String(code).endsWith('_LAB'))
      .sort((a, b) => b[0].length - a[0].length); // longest alias first (specific before loose)
    const keywordEntries = Object.entries(SUBJECT_KEYWORDS);
    const labKeywords = keywordEntries.filter(([code]) => String(code).endsWith('_LAB'));
    const otherKeywords = keywordEntries.filter(([code]) => !String(code).endsWith('_LAB'));

    const buildInferred = (code, inferredFrom) => {
      const courseInfo = CATEGORY_MAP[code] || { category: code, sub: null, name: code };
      const foundCls = normalized.find(c => (COURSE_CODE_ALIASES[c.code] || c.code) === code);
      return {
        category: courseInfo.category,
        subCategory: courseInfo.sub,
        matchedCode: code,
        originalCode: code,
        courseName: (foundCls && foundCls.name) || courseInfo.name || code,
        dateStr,
        timeStr,
        sessionTime: hours + minutes,
        inferredFrom
      };
    };

    // 3a. Lab codes & keywords FIRST (so "physics lab" is not captured by the loose 'PHY' alias)
    for (const [alias, code] of labAliases) {
      if (cleanFn.includes(alias.toLowerCase())) {
        return { ...buildInferred(code, 'filename_code'), originalCode: alias };
      }
    }
    for (const [code, keywords] of labKeywords) {
      for (const kw of keywords) {
        if (cleanFn.includes(kw.toLowerCase())) {
          return buildInferred(code, 'filename_keyword');
        }
      }
    }

    // 3b. General course codes & keywords
    for (const [alias, code] of otherAliases) {
      if (cleanFn.includes(alias.toLowerCase())) {
        return { ...buildInferred(code, 'filename_code'), originalCode: alias };
      }
    }
    for (const [code, keywords] of otherKeywords) {
      for (const kw of keywords) {
        if (cleanFn.includes(kw.toLowerCase())) {
          return buildInferred(code, 'filename_keyword');
        }
      }
    }
  }

  if (!matchedCourse) {
    return {
      category: UNSORTED.category,
      subCategory: UNSORTED.sub,
      matchedCode: 'UNSORTED',
      originalCode: 'UNSORTED',
      courseName: 'General / Unsorted',
      dateStr,
      timeStr,
      sessionTime: hours + minutes
    };
  }

  const rawCode = matchedCourse.code.toUpperCase();
  const canonicalCode = COURSE_CODE_ALIASES[rawCode] || rawCode;
  const courseInfo = CATEGORY_MAP[canonicalCode] || { category: rawCode, sub: null };

  const [startH, startM] = matchedCourse.start.split(':');
  const sessionTime = (startH && startM)
    ? `${startH.trim().padStart(2, '0')}${startM.trim().padStart(2, '0')}`
    : (hours + minutes);

  return {
    category: courseInfo.category,
    subCategory: courseInfo.sub,
    matchedCode: canonicalCode,
    originalCode: rawCode,
    courseName: matchedCourse.name,
    dateStr,
    timeStr,
    sessionTime
  };
}

module.exports = {
  getBangkokNow,
  normalizeCurriculum,
  resolveCurrentSubject
};
