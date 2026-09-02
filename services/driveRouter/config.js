// services/driveRouter/config.js
// Configuration & Category Mapping for E-Calendar Auto Drive Router & AI Summary v2

const path = require('path');
const fs = require('fs');

const LINE_CHANNEL_ACCESS_TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').replace(/['"]/g, '').trim();
const LINE_CHANNEL_SECRET = (process.env.LINE_CHANNEL_SECRET || '').replace(/['"]/g, '').trim();

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').replace(/['"]/g, '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').replace(/['"]/g, '').trim();

const GOOGLE_SERVICE_ACCOUNT_JSON = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
const GOOGLE_DRIVE_PARENT_ID = (process.env.GOOGLE_DRIVE_PARENT_ID || '').replace(/['"]/g, '').trim();

const SESSION_DEBOUNCE_SECONDS = parseInt(process.env.SESSION_DEBOUNCE_SECONDS || '150', 10);
const GRACE_PERIOD_MINUTES = parseInt(process.env.GRACE_PERIOD_MINUTES || '30', 10);
const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';

// Flat Category Mapping (Subject Folder -> Subfolder if applicable)
const CATEGORY_MAP = {
  MATH: { category: 'Mathematics', sub: null },
  PHY: { category: 'Physics', sub: null },
  CHEM: { category: 'Chemistry', sub: null },
  BIO: { category: 'Biology', sub: null },
  EGBI100: { category: 'EGBI100', sub: null },
  COMPRO: { category: 'Computer_Programming', sub: null },
  PHY_LAB: { category: 'Lab', sub: 'Physics_Lab' },
  CHEM_LAB: { category: 'Lab', sub: 'Chemistry_Lab' },
  BIO_LAB: { category: 'Lab', sub: 'Biology_Lab' },
};

// Course Code Aliases to Canonical Categories
const COURSE_CODE_ALIASES = {
  // Math
  SCMA101: 'MATH',
  MATH: 'MATH',
  CALCULUS: 'MATH',

  // Physics
  SCPY161: 'PHY',
  PHY: 'PHY',
  PHYSICS: 'PHY',

  // Chemistry
  SCCH161: 'CHEM',
  CHEM: 'CHEM',
  CHEMISTRY: 'CHEM',

  // Biology
  SCSL190: 'BIO',
  SCBE101: 'BIO',
  BIO: 'BIO',
  BIOLOGY: 'BIO',

  // EGBI100
  EGBI100: 'EGBI100',

  // Computer Programming
  EGBI122: 'COMPRO',
  COMPRO: 'COMPRO',
  PROGRAMMING: 'COMPRO',

  // Labs
  SCPY111: 'PHY_LAB',
  PHY_LAB: 'PHY_LAB',
  'LAB-SCPY 111': 'PHY_LAB',

  SCCH169: 'CHEM_LAB',
  SCCH189: 'CHEM_LAB',
  CHEM_LAB: 'CHEM_LAB',
  'LAB-SCCH 189': 'CHEM_LAB',

  SCBE102: 'BIO_LAB',
  BIO_LAB: 'BIO_LAB',
  'LAB-SCBE 102': 'BIO_LAB'
};

const UNSORTED = { category: '00_General_Unsorted', sub: null };

module.exports = {
  LINE_CHANNEL_ACCESS_TOKEN,
  LINE_CHANNEL_SECRET,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  GOOGLE_DRIVE_PARENT_ID,
  SESSION_DEBOUNCE_SECONDS,
  GRACE_PERIOD_MINUTES,
  TIMEZONE,
  CATEGORY_MAP,
  COURSE_CODE_ALIASES,
  UNSORTED,
  hasDriveConfig: Boolean(GOOGLE_DRIVE_PARENT_ID && (GOOGLE_SERVICE_ACCOUNT_JSON || fs.existsSync(path.join(__dirname, '../../service_account.json'))))
};
