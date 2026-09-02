// services/driveRouter/scheduleService.js
// Resolves student's active class with Asia/Bangkok timezone & 30-min post-class grace period

const { CATEGORY_MAP, COURSE_CODE_ALIASES, SUBJECT_KEYWORDS, UNSORTED, GRACE_PERIOD_MINUTES, TIMEZONE } = require('./config');

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Returns current timestamp in the configured timezone (Asia/Bangkok)
 */
function getBangkokNow() {
  // Using Intl format to reliably parse Bangkok time regardless of Railway server UTC
  const now = new Date();
  const bangkokDateStr = now.toLocaleString('en-US', { timeZone: TIMEZONE });
  return new Date(bangkokDateStr);
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

  let matchedCourse = null;

  // 1. Direct match: currently in class (start <= timeStr <= end)
  for (const cls of todayClasses) {
    if (cls.start <= timeStr && timeStr <= cls.end) {
      matchedCourse = cls;
      break;
    }
  }

  // 2. Grace period check: class ended within GRACE_PERIOD_MINUTES (default 30 mins)
  if (!matchedCourse) {
    const currentTotalMin = now.getHours() * 60 + now.getMinutes();

    for (const cls of todayClasses) {
      const [endH, endM] = cls.end.split(':').map(Number);
      if (!isNaN(endH) && !isNaN(endM)) {
        const endTotalMin = endH * 60 + endM;
        const diff = currentTotalMin - endTotalMin;
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

    // 3a. Check direct course code aliases (e.g. SCPY161, SCMA101, EGBI122)
    for (const [alias, code] of Object.entries(COURSE_CODE_ALIASES)) {
      if (cleanFn.includes(alias.toLowerCase())) {
        const courseInfo = CATEGORY_MAP[code] || { category: code, sub: null, name: code };
        const foundCls = normalized.find(c => (COURSE_CODE_ALIASES[c.code] || c.code) === code);
        return {
          category: courseInfo.category,
          subCategory: courseInfo.sub,
          matchedCode: code,
          originalCode: alias,
          courseName: (foundCls && foundCls.name) || courseInfo.name || code,
          dateStr,
          timeStr,
          sessionTime: hours + minutes,
          inferredFrom: 'filename_code'
        };
      }
    }

    // 3b. Check subject keywords (e.g. capacitor, calculus, titration, etc.)
    for (const [code, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
      for (const kw of keywords) {
        if (cleanFn.includes(kw.toLowerCase())) {
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
            inferredFrom: 'filename_keyword'
          };
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
  const sessionTime = (startH && startM) ? `${startH}${startM}` : (hours + minutes);

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
