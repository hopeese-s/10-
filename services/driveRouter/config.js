// services/driveRouter/config.js
// Configuration & Category Mapping for E-Calendar Auto Drive Router & AI Summary v2

const path = require('path');
const fs = require('fs');

const LINE_CHANNEL_ACCESS_TOKEN = (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').replace(/['"]/g, '').trim();
const LINE_CHANNEL_SECRET = (process.env.LINE_CHANNEL_SECRET || '').replace(/['"]/g, '').trim();

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').replace(/['"]/g, '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').replace(/['"]/g, '').trim();

function extractFolderId(input) {
  if (!input) return '';
  const cleaned = input.replace(/['"]/g, '').trim();
  const folderMatch = cleaned.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = cleaned.match(/id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  return cleaned;
}

const GOOGLE_SERVICE_ACCOUNT_JSON = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
const GOOGLE_DRIVE_PARENT_ID = extractFolderId(process.env.GOOGLE_DRIVE_PARENT_ID || '');

// OAuth2 credentials (preferred — lets bot upload to your personal My Drive)
// These are needed because Service Accounts have no storage quota in personal Drive
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').replace(/['"]/g, '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').replace(/['"]/g, '').trim();
const GOOGLE_REFRESH_TOKEN = (process.env.GOOGLE_REFRESH_TOKEN || '').replace(/['"]/g, '').trim();

const hasOAuthConfig = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);


const SESSION_DEBOUNCE_SECONDS = parseInt(process.env.SESSION_DEBOUNCE_SECONDS || '45', 10);
const GRACE_PERIOD_MINUTES = parseInt(process.env.GRACE_PERIOD_MINUTES || '30', 10);
const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';

// Flat Category Mapping (Subject Folder -> Subfolder if applicable)
const CATEGORY_MAP = {
  MATH: { category: 'Mathematics', sub: null, name: 'Mathematics I' },
  PHY: { category: 'Physics', sub: null, name: 'General Physics I' },
  CHEM: { category: 'Chemistry', sub: null, name: 'General Chemistry' },
  BIO: { category: 'Biology', sub: null, name: 'General Biology' },
  EGBI100: { category: 'EGBI100', sub: null, name: 'Introduction to BME' },
  COMPRO: { category: 'Computer_Programming', sub: null, name: 'Computer Programming' },
  PHY_LAB: { category: 'Lab', sub: 'Physics_Lab', name: 'Physics Laboratory I' },
  CHEM_LAB: { category: 'Lab', sub: 'Chemistry_Lab', name: 'Chemistry Laboratory I' },
  BIO_LAB: { category: 'Lab', sub: 'Biology_Lab', name: 'General Biology Laboratory 1' },
};

// Subject Keyword Matcher for files uploaded outside class hours
const SUBJECT_KEYWORDS = {
  PHY: [
    'physics', 'capacitor', 'capacitors', 'capacitance', 'electric', 'magnetic',
    'field', 'optics', 'mechanics', 'thermo', 'kinematics', 'velocity', 'force',
    'newton', 'circuit', 'resistor', 'inductance', 'current', 'voltage', 'scpy'
  ],
  MATH: [
    'math', 'mathematics', 'calculus', 'calc', 'matrix', 'vector', 'derivative',
    'integral', 'integration', 'differentiation', 'differential', 'limit', 'algebra',
    'scma', 'eigen', 'eigenvalue', 'series', 'taylor'
  ],
  CHEM: [
    'chem', 'chemistry', 'acid', 'base', 'titration', 'organic', 'stoichiometry',
    'equilibrium', 'scch', 'molecule', 'periodic', 'reaction', 'orbital', 'thermodynamic'
  ],
  BIO: [
    'bio', 'biology', 'cell', 'genetics', 'dna', 'rna', 'gene', 'photosynthesis',
    'scbe', 'scsl', 'enzyme', 'organism', 'evolution', 'ecology', 'protein', 'mitosis'
  ],
  COMPRO: [
    'compro', 'programming', 'python', 'code', 'algorithm', 'egbi122', 'function',
    'loop', 'array', 'pointer', 'java', 'c++', 'datastructure'
  ],
  EGBI100: [
    'egbi100', 'biomedical', 'bme intro', 'introduction to bme', 'biomedical engineering'
  ],
  PHY_LAB: [
    'scpy111', 'physic lab', 'physics lab', 'phy lab', 'แลปฟิสิกส์', 'แล็บฟิสิกส์'
  ],
  CHEM_LAB: [
    'scch169', 'scch189', 'chem lab', 'chemistry lab', 'แลปเคมี', 'แล็บเคมี'
  ],
  BIO_LAB: [
    'scbe102', 'bio lab', 'biology lab', 'แลปชีวะ', 'แล็บชีวะ'
  ]
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
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  hasOAuthConfig,
  SESSION_DEBOUNCE_SECONDS,
  GRACE_PERIOD_MINUTES,
  TIMEZONE,
  CATEGORY_MAP,
  COURSE_CODE_ALIASES,
  SUBJECT_KEYWORDS,
  UNSORTED,
  extractFolderId,
  hasDriveConfig: Boolean(
    (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN) || // OAuth2 (preferred)
    GOOGLE_SERVICE_ACCOUNT_JSON ||                                          // Service Account (fallback)
    fs.existsSync(path.join(__dirname, '../../service_account.json'))
  )
};
