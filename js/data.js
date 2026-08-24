// ============================================================
// data.js — All application data for Study Dashboard
// ============================================================

const TAGS = {
  prayer:   { emoji: '🕌', label: 'ละหมาด',        color: '#a78bfa', bg: 'rgba(167,139,250,0.18)', border: 'rgba(167,139,250,0.4)' },
  sleep:    { emoji: '😴', label: 'นอน/พัก',        color: '#818cf8', bg: 'rgba(129,140,248,0.18)', border: 'rgba(129,140,248,0.4)' },
  morning:  { emoji: '☀️', label: 'กิจวัตรเช้า',    color: '#fbbf24', bg: 'rgba(251,191,36,0.18)',  border: 'rgba(251,191,36,0.4)'  },
  travel:   { emoji: '🚗', label: 'เดินทาง',        color: '#f59e0b', bg: 'rgba(245,158,11,0.18)',  border: 'rgba(245,158,11,0.4)'  },
  class:    { emoji: '🎓', label: 'เรียน',          color: '#38bdf8', bg: 'rgba(56,189,248,0.18)',  border: 'rgba(56,189,248,0.4)'  },
  study:    { emoji: '📚', label: 'ทบทวน',          color: '#60a5fa', bg: 'rgba(96,165,250,0.18)',  border: 'rgba(96,165,250,0.4)'  },
  food:     { emoji: '🍳', label: 'อาหาร',          color: '#fb923c', bg: 'rgba(251,146,60,0.18)',  border: 'rgba(251,146,60,0.4)'  },
  social:   { emoji: '💬', label: 'คุยโทรศัพท์',    color: '#f472b6', bg: 'rgba(244,114,182,0.18)', border: 'rgba(244,114,182,0.4)' },
  prep:     { emoji: '🧹', label: 'เตรียมตัว',      color: '#94a3b8', bg: 'rgba(148,163,184,0.18)', border: 'rgba(148,163,184,0.4)' },
  break:    { emoji: '☕', label: 'พักเบรก',        color: '#34d399', bg: 'rgba(52,211,153,0.18)',  border: 'rgba(52,211,153,0.4)'  },
  freetime: { emoji: '🌴', label: 'ฟรีไทม์',        color: '#6bae8e', bg: 'rgba(107,174,142,0.18)', border: 'rgba(107,174,142,0.4)' },
  family:   { emoji: '🏠', label: 'ครอบครัว',       color: '#d4a96a', bg: 'rgba(212,169,106,0.18)', border: 'rgba(212,169,106,0.4)' },
};

// Subject colors for class schedule
const SUBJECT_COLORS = {
  SCPY161: { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', emoji: '⚡', shortName: 'GenPhy' },
  EGBI122: { color: '#10b981', bg: 'rgba(16,185,129,0.15)', emoji: '💻', shortName: 'CompPro' },
  LAEN182: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', emoji: '📝', shortName: 'English' },
  SCBE102: { color: '#6bae8e', bg: 'rgba(107,174,142,0.15)', emoji: '🔬', shortName: 'Bio Lab' },
  EGBI100: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', emoji: '🏥', shortName: 'BME Real' },
  SCMA101: { color: '#ec4899', bg: 'rgba(236,72,153,0.15)', emoji: '📐', shortName: 'Math' },
  SCSL190: { color: '#22c55e', bg: 'rgba(34,197,94,0.15)', emoji: '🌿', shortName: 'Bio (W.Life)' },
  SCCH161: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', emoji: '⚗️', shortName: 'GenChem' },
  SCPY111: { color: '#0ea5e9', bg: 'rgba(14,165,233,0.15)', emoji: '🔭', shortName: 'PhyLab' },
  SCCH169: { color: '#f97316', bg: 'rgba(249,115,22,0.15)', emoji: '🧪', shortName: 'ChemLab' },
};

// Class schedule data
const CLASS_SCHEDULE = {
  monday: [
    { code: 'SCPY161', name: 'General Physics I', type: 'Lec.', room: 'L2-002', start: '09:30', end: '12:30' },
    { code: 'EGBI122', name: 'Computer Programming', type: 'Lec.', room: 'R335/1, R335/2', start: '13:30', end: '17:30' },
  ],
  tuesday: [
    { code: 'LAEN182', name: 'English for General Academic Purposes', type: 'Lec.', room: 'Room 320', start: '08:30', end: '10:30' },
    { code: 'SCBE102', name: 'General Biology Laboratory 1', type: 'Lab', room: 'Lab SC', start: '13:30', end: '16:30' },
    { code: 'EGBI100', name: 'BME in the Real World', type: 'Lec.', room: 'R238', start: '17:40', end: '18:40' },
  ],
  wednesday: [
    { code: 'SCMA101', name: 'Mathematics I', type: 'Lec.', room: 'SC1-152', start: '09:00', end: '11:00' },
  ],
  thursday: [
    { code: 'SCSL190', name: 'Wonderful Life (Biology)', type: 'Lec.', room: 'SC3-303', start: '09:30', end: '12:30' },
    { code: 'SCCH161', name: 'General Chemistry', type: 'Lec.', room: 'SC2-323', start: '13:30', end: '16:30' },
  ],
  friday: [
    { code: 'SCPY111', name: 'Physics Laboratory I', type: 'Lab', room: 'Lab SC', start: '09:30', end: '12:30' },
    { code: 'SCCH169', name: 'Chemistry Laboratory', type: 'Lab', room: 'L2-201', start: '13:30', end: '16:30' },
  ],
  saturday: [],
  sunday: [],
};

// Daily routines
const ROUTINES = {
  monday: {
    key: 'monday', label: 'จันทร์', labelEn: 'Monday', short: 'จ.',
    status: 'dorm', statusLabel: 'อยู่หอ', statusEmoji: '🏢',
    studyMinutes: 120, sleepMinutes: 450,
    blocks: [
      { id: 'mon-01', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ + อ่านอัซการเช้า', tag: 'prayer', notes: '' },
      { id: 'mon-02', start: '06:15', end: '07:30', title: 'นอนต่อ / พักผ่อน', tag: 'sleep', notes: '1.5 ชม.' },
      { id: 'mon-03', start: '07:45', end: '09:00', title: 'ตื่น • อาบน้ำ • กินข้าวเช้า • ทำกาแฟ', tag: 'morning', notes: '' },
      { id: 'mon-04', start: '09:00', end: '09:30', title: 'ออกจากห้อง — เดินทางไปมหาวิทยาลัย', tag: 'travel', notes: 'เผื่อเวลา 30 นาที' },
      { id: 'mon-05', start: '09:30', end: '12:30', title: 'SCPY161 General Physics I', subtitle: 'L2-002', tag: 'class', isClass: true, classCode: 'SCPY161', notes: '' },
      { id: 'mon-06', start: '12:30', end: '13:30', title: 'พักกลางวัน', tag: 'break', notes: '' },
      { id: 'mon-07', start: '13:30', end: '17:30', title: 'EGBI122 Computer Programming', subtitle: 'R335/1, R335/2', tag: 'class', isClass: true, classCode: 'EGBI122', notes: '' },
      { id: 'mon-08', start: '17:30', end: '18:15', title: 'กลับหอ • ทิ้งตัวพักผ่อน', tag: 'sleep', notes: '' },
      { id: 'mon-09', start: '18:15', end: '18:45', title: 'ทำกับข้าวมื้อเย็น & เช้า + กินข้าว', tag: 'food', notes: '' },
      { id: 'mon-10', start: '18:45', end: '19:00', title: 'ละหมาดมัฆริบ', tag: 'prayer', notes: '' },
      { id: 'mon-11', start: '19:00', end: '20:00', title: 'Study Block 1 — ทบทวนวิชาที่ 1', subtitle: 'GenPhy / CompPro', tag: 'study', isStudyBlock: true, studyBlockIndex: 0, notes: '60 นาที' },
      { id: 'mon-12', start: '20:00', end: '20:30', title: 'พักเบรกยาว + ละหมาดอีชาอ์', tag: 'prayer', notes: '' },
      { id: 'mon-13', start: '20:30', end: '21:30', title: 'Study Block 2 — ทบทวนวิชาที่ 2', subtitle: 'เคลียร์การบ้าน', tag: 'study', isStudyBlock: true, studyBlockIndex: 1, notes: '60 นาที' },
      { id: 'mon-14', start: '21:30', end: '22:00', title: 'Wind Down — เคลียร์ห้อง เตรียมชุด/กระเป๋า', tag: 'prep', notes: '' },
      { id: 'mon-15', start: '22:00', end: '23:00', title: 'โทรคุยกับคุณแม่ + พักผ่อน', tag: 'social', notes: '' },
      { id: 'mon-16', start: '23:00', end: '05:30', title: 'เข้านอน', tag: 'sleep', notes: '~6.5 ชม. รวมงีบ = 8 ชม.' },
    ]
  },

  tuesday: {
    key: 'tuesday', label: 'อังคาร', labelEn: 'Tuesday', short: 'อ.',
    status: 'dorm', statusLabel: 'อยู่หอ', statusEmoji: '🏢',
    studyMinutes: 120, sleepMinutes: 435,
    blocks: [
      { id: 'tue-01', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ + อ่านอัซการเช้า', tag: 'prayer', notes: '' },
      { id: 'tue-02', start: '06:15', end: '07:00', title: 'งีบสั้น', tag: 'sleep', notes: '45 นาที' },
      { id: 'tue-03', start: '07:00', end: '07:35', title: 'อาบน้ำ • แต่งตัว • กินมื้อเช้าง่ายๆ', tag: 'morning', notes: '' },
      { id: 'tue-04', start: '07:35', end: '08:00', title: 'ออกจากห้องไว — เดินทาง', tag: 'travel', notes: 'ไปถึงก่อน 8 โมง หาที่จอดรถ' },
      { id: 'tue-05', start: '08:00', end: '08:30', title: 'ชิลหน้าห้องเรียน รอเริ่มเรียน', tag: 'break', notes: '☕' },
      { id: 'tue-06', start: '08:30', end: '10:30', title: 'LAEN182 English for General Academic', subtitle: 'Room 320', tag: 'class', isClass: true, classCode: 'LAEN182', notes: '' },
      { id: 'tue-07', start: '10:30', end: '13:30', title: 'พักเที่ยง / ห้องชมรมมุสลิม', tag: 'break', notes: 'อาจพักห้องชมรมมุสลิม' },
      { id: 'tue-08', start: '13:30', end: '16:30', title: 'SCBE102 General Biology Laboratory 1', subtitle: 'Lab SC', tag: 'class', isClass: true, classCode: 'SCBE102', notes: '' },
      { id: 'tue-09', start: '16:30', end: '17:40', title: 'พักระหว่างคาบ', tag: 'break', notes: '' },
      { id: 'tue-10', start: '17:40', end: '18:40', title: 'EGBI100 BME in the Real World', subtitle: 'R238', tag: 'class', isClass: true, classCode: 'EGBI100', notes: '' },
      { id: 'tue-11', start: '18:45', end: '19:00', title: 'ละหมาดมัฆริบ', tag: 'prayer', notes: '' },
      { id: 'tue-12', start: '19:00', end: '19:30', title: 'กลับหอ • ทำกับข้าว • กินข้าวเย็น', tag: 'food', notes: '' },
      { id: 'tue-13', start: '19:30', end: '20:30', title: 'Study Block 1 — ทบทวนวิชาที่ 1', subtitle: 'ENG / Bio Lab', tag: 'study', isStudyBlock: true, studyBlockIndex: 0, notes: '60 นาที' },
      { id: 'tue-14', start: '20:30', end: '20:45', title: 'ละหมาดอีชาอ์ + พักเบรก', tag: 'prayer', notes: '' },
      { id: 'tue-15', start: '20:45', end: '21:45', title: 'Study Block 2 — ทบทวนวิชาที่ 2', subtitle: 'BME / เคลียร์การบ้าน', tag: 'study', isStudyBlock: true, studyBlockIndex: 1, notes: '60 นาที' },
      { id: 'tue-16', start: '21:45', end: '22:15', title: 'Wind Down — เตรียมชุด/กระเป๋า', tag: 'prep', notes: '' },
      { id: 'tue-17', start: '22:15', end: '23:00', title: 'โทรคุยกับคุณแม่ + พักผ่อน', tag: 'social', notes: '' },
      { id: 'tue-18', start: '23:00', end: '05:30', title: 'เข้านอน', tag: 'sleep', notes: '' },
    ]
  },

  wednesday: {
    key: 'wednesday', label: 'พุธ', labelEn: 'Wednesday', short: 'พ.',
    status: 'home', statusLabel: 'กลับบ้าน', statusEmoji: '🏠',
    studyMinutes: 60, sleepMinutes: 480,
    blocks: [
      { id: 'wed-01', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ + อ่านอัซการเช้า', tag: 'prayer', notes: '' },
      { id: 'wed-02', start: '06:15', end: '07:30', title: 'นอนต่อ / พักผ่อน', tag: 'sleep', notes: '' },
      { id: 'wed-03', start: '07:30', end: '08:30', title: 'ตื่น • อาบน้ำ • กินข้าวเช้า', tag: 'morning', notes: '' },
      { id: 'wed-04', start: '08:30', end: '09:00', title: 'เดินทางไปมหาวิทยาลัย', tag: 'travel', notes: '' },
      { id: 'wed-05', start: '09:00', end: '11:00', title: 'SCMA101 Mathematics I', subtitle: 'SC1-152', tag: 'class', isClass: true, classCode: 'SCMA101', notes: '' },
      { id: 'wed-06', start: '11:00', end: '12:00', title: 'พักเที่ยง — เตรียมตัวกลับ', tag: 'break', notes: '' },
      { id: 'wed-07', start: '12:00', end: '14:00', title: 'เดินทางกลับบ้าน 🏠', tag: 'travel', notes: 'บ่ายว่าง กลับบ้าน!' },
      { id: 'wed-08', start: '14:00', end: '19:30', title: 'พักผ่อนตามอัธยาศัยกับครอบครัว', tag: 'family', notes: 'อยู่บ้าน 🌴' },
      { id: 'wed-09', start: '19:30', end: '20:30', title: 'Study Block — ทบทวนวิชาช่วงเช้า', subtitle: 'Math', tag: 'study', isStudyBlock: true, studyBlockIndex: 0, notes: '60 นาที' },
      { id: 'wed-10', start: '20:30', end: '23:00', title: 'ฟรีไทม์ — อยู่กับครอบครัว', tag: 'freetime', notes: '💬 เวลาของครอบครัว' },
      { id: 'wed-11', start: '23:00', end: '05:30', title: 'เข้านอน', tag: 'sleep', notes: '' },
    ]
  },

  thursday: {
    key: 'thursday', label: 'พฤหัส', labelEn: 'Thursday', short: 'พฤ.',
    status: 'dorm', statusLabel: 'อยู่หอ', statusEmoji: '🏢',
    studyMinutes: 120, sleepMinutes: 450,
    blocks: [
      { id: 'thu-01', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ + อ่านอัซการเช้า', tag: 'prayer', notes: '' },
      { id: 'thu-02', start: '06:15', end: '07:30', title: 'นอนต่อ / พักผ่อน', tag: 'sleep', notes: '1.5 ชม.' },
      { id: 'thu-03', start: '07:45', end: '09:00', title: 'ตื่น • อาบน้ำ • กินข้าวเช้า • ทำกาแฟ', tag: 'morning', notes: '' },
      { id: 'thu-04', start: '09:00', end: '09:30', title: 'ออกจากห้อง — เดินทางไปมหาวิทยาลัย', tag: 'travel', notes: '' },
      { id: 'thu-05', start: '09:30', end: '12:30', title: 'SCSL190 Wonderful Life (Biology)', subtitle: 'SC3-303', tag: 'class', isClass: true, classCode: 'SCSL190', notes: '' },
      { id: 'thu-06', start: '12:30', end: '13:30', title: 'พักกลางวัน', tag: 'break', notes: '' },
      { id: 'thu-07', start: '13:30', end: '16:30', title: 'SCCH161 General Chemistry', subtitle: 'SC2-323', tag: 'class', isClass: true, classCode: 'SCCH161', notes: '' },
      { id: 'thu-08', start: '16:45', end: '18:15', title: 'ถึงหอ • ทิ้งตัว + ทำกับข้าวมื้อเย็น & เช้า', tag: 'food', notes: '' },
      { id: 'thu-09', start: '18:15', end: '18:45', title: 'กินข้าวเย็น + ล้างจาน', tag: 'food', notes: '' },
      { id: 'thu-10', start: '18:45', end: '19:00', title: 'ละหมาดมัฆริบ', tag: 'prayer', notes: '' },
      { id: 'thu-11', start: '19:00', end: '20:00', title: 'Study Block 1 — ทบทวนวิชาที่ 1', subtitle: 'Bio / Chem', tag: 'study', isStudyBlock: true, studyBlockIndex: 0, notes: '60 นาที' },
      { id: 'thu-12', start: '20:00', end: '20:30', title: 'พักเบรกยาว + ละหมาดอีชาอ์', tag: 'prayer', notes: '' },
      { id: 'thu-13', start: '20:30', end: '21:30', title: 'Study Block 2 — ทบทวนวิชาที่ 2', subtitle: 'เคลียร์การบ้าน', tag: 'study', isStudyBlock: true, studyBlockIndex: 1, notes: '60 นาที' },
      { id: 'thu-14', start: '21:30', end: '22:00', title: 'Wind Down — เตรียมชุด/กระเป๋า', tag: 'prep', notes: '' },
      { id: 'thu-15', start: '22:00', end: '23:00', title: 'โทรคุยกับคุณแม่ + พักผ่อน', tag: 'social', notes: '' },
      { id: 'thu-16', start: '23:00', end: '05:30', title: 'เข้านอน', tag: 'sleep', notes: '' },
    ]
  },

  friday: {
    key: 'friday', label: 'ศุกร์', labelEn: 'Friday', short: 'ศ.',
    status: 'home', statusLabel: 'กลับบ้าน', statusEmoji: '🏠',
    studyMinutes: 0, sleepMinutes: 510,
    blocks: [
      { id: 'fri-01', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ + อ่านอัซการเช้า', tag: 'prayer', notes: '' },
      { id: 'fri-02', start: '06:15', end: '07:30', title: 'นอนต่อ / พักผ่อน', tag: 'sleep', notes: '' },
      { id: 'fri-03', start: '07:45', end: '09:00', title: 'ตื่น • อาบน้ำ • กินข้าวเช้า', tag: 'morning', notes: '' },
      { id: 'fri-04', start: '09:00', end: '09:30', title: 'เดินทางไปมหาวิทยาลัย', tag: 'travel', notes: '' },
      { id: 'fri-05', start: '09:30', end: '12:30', title: 'SCPY111 Physics Laboratory I', subtitle: 'Lab SC', tag: 'class', isClass: true, classCode: 'SCPY111', notes: '' },
      { id: 'fri-06', start: '12:30', end: '13:30', title: 'พักกลางวัน + ละหมาดวันศุกร์ 🕌', tag: 'prayer', notes: 'ละหมาดจุมอะห์' },
      { id: 'fri-07', start: '13:30', end: '16:30', title: 'SCCH169 Chemistry Laboratory', subtitle: 'L2-201', tag: 'class', isClass: true, classCode: 'SCCH169', notes: '' },
      { id: 'fri-08', start: '16:45', end: '19:00', title: 'เดินทางกลับบ้าน 🏠', tag: 'travel', notes: 'กลับบ้าน!' },
      { id: 'fri-09', start: '19:00', end: '23:00', title: 'พักผ่อนเต็มที่ + อยู่กับครอบครัว', tag: 'family', notes: 'งดอ่านหนังสือ 🌴' },
      { id: 'fri-10', start: '23:00', end: '05:30', title: 'เข้านอน', tag: 'sleep', notes: '' },
    ]
  },

  saturday: {
    key: 'saturday', label: 'เสาร์', labelEn: 'Saturday', short: 'ส.',
    status: 'home', statusLabel: 'อยู่บ้าน', statusEmoji: '🏠',
    studyMinutes: 60, sleepMinutes: 540,
    blocks: [
      { id: 'sat-01', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ', tag: 'prayer', notes: '' },
      { id: 'sat-02', start: '06:15', end: '09:00', title: 'พักผ่อนตามอัธยาศัย / งีบ', tag: 'sleep', notes: '🏠 วันหยุด' },
      { id: 'sat-03', start: '09:00', end: '12:00', title: 'กิจกรรมกับครอบครัว ช่วงเช้า', tag: 'family', notes: '' },
      { id: 'sat-04', start: '12:00', end: '15:00', title: 'พักผ่อน / ทำกิจธุระ', tag: 'freetime', notes: '' },
      { id: 'sat-05', start: '15:00', end: '16:00', title: 'Light Review — ทวนเก็บตก', subtitle: 'เลือกวิชาที่ต้องการ', tag: 'study', isStudyBlock: true, studyBlockIndex: 0, notes: '60 นาที | ทบทวนเบาๆ' },
      { id: 'sat-06', start: '16:00', end: '23:00', title: 'ฟรีไทม์ — อยู่กับครอบครัว', tag: 'family', notes: '💬 เวลาครอบครัว' },
      { id: 'sat-07', start: '23:00', end: '05:30', title: 'เข้านอน', tag: 'sleep', notes: '' },
    ]
  },

  sunday: {
    key: 'sunday', label: 'อาทิตย์', labelEn: 'Sunday', short: 'อา.',
    status: 'home', statusLabel: 'อยู่บ้าน', statusEmoji: '🏠',
    studyMinutes: 60, sleepMinutes: 510,
    blocks: [
      { id: 'sun-01', start: '05:30', end: '06:15', title: 'ละหมาดซุบฮิ', tag: 'prayer', notes: '' },
      { id: 'sun-02', start: '06:15', end: '09:00', title: 'พักผ่อนตามอัธยาศัย / งีบ', tag: 'sleep', notes: '🏠 วันหยุด' },
      { id: 'sun-03', start: '09:00', end: '12:00', title: 'กิจกรรมกับครอบครัว ช่วงเช้า', tag: 'family', notes: '' },
      { id: 'sun-04', start: '12:00', end: '15:00', title: 'พักผ่อน / ทำกิจธุระ', tag: 'freetime', notes: '' },
      { id: 'sun-05', start: '15:00', end: '16:00', title: 'Light Review — ทวนเก็บตก', subtitle: 'เตรียมสัปดาห์หน้า', tag: 'study', isStudyBlock: true, studyBlockIndex: 0, notes: '60 นาที' },
      { id: 'sun-06', start: '16:00', end: '20:00', title: 'ฟรีไทม์ + พักผ่อน', tag: 'family', notes: '' },
      { id: 'sun-07', start: '20:00', end: '21:00', title: 'เตรียมตัวกลับหอพักพรุ่งนี้ 🎒', tag: 'prep', notes: 'จัดกระเป๋า เตรียมของ' },
      { id: 'sun-08', start: '21:00', end: '22:30', title: 'โทรคุยกับคุณแม่ + พักผ่อน', tag: 'social', notes: '' },
      { id: 'sun-09', start: '22:30', end: '05:30', title: 'เข้านอน', tag: 'sleep', notes: '😴 พักให้เพียงพอก่อนวันจันทร์' },
    ]
  },
};

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Helper
function getDayKey(jsDay) {
  // JS: 0=Sun, 1=Mon, ...6=Sat
  const map = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  return map[jsDay];
}

// ============================================================
// Study Resources Folders & Default Links
// ============================================================
const DEFAULT_STUDY_FOLDERS = [
  { id: 'f-uploads', name: '📤 ไฟล์ที่อัปโหลด (Uploads)', icon: '📤' },
  { id: 'f-handbook', name: '📘 คู่มือ & ตารางเรียนจำลอง', icon: '📘' },
  { id: 'f-classroom', name: '🏫 Google Classroom รายวิชา', icon: '🏫' },
  { id: 'f-drive', name: '📂 Google Drive ชีท & โค้ด', icon: '📂' },
  { id: 'f-notes', name: '📑 เอกสารประกอบการสอน', icon: '📑' }
];

const DEFAULT_STUDY_LINKS = [
  // ─── Google Classroom Links ───
  {
    id: 'gc-1',
    folderId: 'f-classroom',
    title: '2026_SCPY161 General Physics I',
    sub: 'SCBE#1, ENNM#1, EGBI#1, EGCG#1, EGIT#1',
    type: 'classroom',
    url: 'https://classroom.google.com/u/6/c/ODcwMjc5NzAyMjcy',
    desc: 'Google Classroom ฟิสิกส์ทั่วไป 1 (SCPY161)'
  },
  {
    id: 'gc-2',
    folderId: 'f-classroom',
    title: '2026_SCCH161 General Chemistry',
    sub: 'EGIT#1, EGBI#1, SCBE#1, EGNN#1',
    type: 'classroom',
    url: 'https://classroom.google.com/u/6/c/ODU1NzE4MDAyNzE5',
    desc: 'Google Classroom เคมีทั่วไป (SCCH161)'
  },
  {
    id: 'gc-3',
    folderId: 'f-classroom',
    title: '2026_SCMA101 Mathematics I (Math 1)',
    sub: 'EG (EGBI, EGIT, EGMU), SCBE, ENNM',
    type: 'classroom',
    url: 'https://classroom.google.com/u/6/c/ODcxNjY1MDM2MTY2',
    desc: 'Google Classroom คณิตศาสตร์ 1 (SCMA101)'
  },
  {
    id: 'gc-4',
    folderId: 'f-classroom',
    title: '2026_SCSL 190 Wonderful Life (ชีววิทยา)',
    sub: 'EGBI#1, SCBE#1',
    type: 'classroom',
    url: 'https://classroom.google.com/u/6/c/Nzk4Mzk2MTI3MDI1',
    desc: 'Google Classroom ชีววิทยาสิ่งมีชีวิต (SCSL190)'
  },
  {
    id: 'gc-5',
    folderId: 'f-classroom',
    title: '2026_EGBI100 BME in the Real World',
    sub: 'Biomedical Engineering',
    type: 'classroom',
    url: 'https://classroom.google.com/u/6/c/ODcwMzEwOTI0OTg2',
    desc: 'Google Classroom วิศวกรรมชีวการแพทย์ในโลกจริง (EGBI100)'
  },
  {
    id: 'gc-6',
    folderId: 'f-classroom',
    title: '2026_SCPY111 Physics Laboratory I',
    sub: 'SCBE#1, ENNM#1, EGBI#1, EGCG#1, EGIT#1',
    type: 'classroom',
    url: 'https://classroom.google.com/u/6/c/ODcxMTQzMDA0NzAw',
    desc: 'Google Classroom ปฏิบัติการฟิสิกส์ 1 (SCPY111)'
  },
  {
    id: 'gc-7',
    folderId: 'f-classroom',
    title: '2026_SCBE 102 General Biology Laboratory 1',
    sub: 'SCBE#1, EGBI#1',
    type: 'classroom',
    url: 'https://classroom.google.com/u/6/c/ODY3NjU2OTgwNDEz',
    desc: 'Google Classroom ปฏิบัติการชีววิทยาทั่วไป 1 (SCBE102)'
  },
  {
    id: 'gc-8',
    folderId: 'f-classroom',
    title: '2026_SCCH 159/169 & SCCT Chemistry Laboratory',
    sub: 'SCBE#1, ENNM#1, EGBI#1, EGCG#1,...',
    type: 'classroom',
    url: 'https://classroom.google.com/u/6/c/ODU1NTg5NDU4MDQ1',
    desc: 'Google Classroom ปฏิบัติการเคมี (SCCH169)'
  },

  // ─── Google Drive ───
  {
    id: 'gd-eng',
    folderId: 'f-drive',
    title: 'LAEN182 English for General Academic Purposes',
    sub: 'Google Drive Folder',
    type: 'drive',
    url: 'https://drive.google.com/drive/folders/1mT_NMiY6c0j8mCyVBvsO4ceUFQfgZwri',
    desc: 'โฟลเดอร์ Google Drive ชีทและเอกสารวิชาภาษาอังกฤษ LAEN182'
  },
  {
    id: 'gd-comppro',
    folderId: 'f-drive',
    title: 'EGBI122 Computer Programming (คอมโปร)',
    sub: 'Google Drive Folder',
    type: 'drive',
    url: 'https://drive.google.com/drive/u/0/mobile/folders/1XqQUjsxsj8VvhchExhS44nEJOL20WFto?usp=sharing',
    desc: 'โฟลเดอร์ Google Drive ชีท สไลด์ และโค้ดตัวอย่างวิชา Computer Programming'
  },

  // ─── PDF & Schedule Documents (In-App Preview) ───
  {
    id: 'doc-handbook',
    folderId: 'f-handbook',
    title: '📘 BME Undergraduate Student Handbook 2026',
    sub: 'PDF Document (In-App Preview)',
    type: 'pdf',
    url: '2026_Handbok for Biomedical Engineering Undergraduate Student.pdf',
    desc: 'คู่มือนักศึกษาหลักสูตรวิศวกรรมชีวแพทย์ มหาวิทยาลัยมหิดล'
  },
  {
    id: 'doc-egbi100-l1',
    folderId: 'f-notes',
    title: '🏥 EGBI100 Lecture 1: Intro to BME',
    sub: 'PDF Lecture Slides (In-App Preview)',
    type: 'pdf',
    url: '2026-EGBI100_Lecture1_Intro_PN.pdf',
    desc: 'เอกสารประกอบการสอน BME in the Real World คาบที่ 1'
  },
  {
    id: 'doc-schedule',
    folderId: 'f-handbook',
    title: '📆 ตารางเรียนปี 1 ภาคเรียนที่ 1/2026 (Program B-BI)',
    sub: 'Image Schedule (In-App Preview)',
    type: 'image',
    url: 'egmu-class-schedule-2026-1-program_B-BI.png',
    desc: 'ภาพตารางเรียนหลักสูตร BME ภาคเรียนที่ 1/2026 ความละเอียดสูง'
  },

  // ─── BME Assumed Schedules (Year 1 - Year 4 from BMEASSUMESCHE) ───
  {
    id: 'doc-sche-y1s2',
    folderId: 'f-handbook',
    title: '📅 ตารางเรียนจำลอง ปี 1 เทอม 2 (Year 1 Sem 2)',
    sub: 'BME Assumed Schedule (PDF)',
    type: 'pdf',
    url: 'BMEASSUMESCHE/year1s2.pdf',
    desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 1 ภาคการศึกษาที่ 2'
  },
  {
    id: 'doc-sche-y2s1',
    folderId: 'f-handbook',
    title: '📅 ตารางเรียนจำลอง ปี 2 เทอม 1 (Year 2 Sem 1)',
    sub: 'BME Assumed Schedule (PDF)',
    type: 'pdf',
    url: 'BMEASSUMESCHE/year2s1.pdf',
    desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 2 ภาคการศึกษาที่ 1'
  },
  {
    id: 'doc-sche-y2s2',
    folderId: 'f-handbook',
    title: '📅 ตารางเรียนจำลอง ปี 2 เทอม 2 (Year 2 Sem 2)',
    sub: 'BME Assumed Schedule (PDF)',
    type: 'pdf',
    url: 'BMEASSUMESCHE/year2s2.pdf',
    desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 2 ภาคการศึกษาที่ 2'
  },
  {
    id: 'doc-sche-y3s1',
    folderId: 'f-handbook',
    title: '📅 ตารางเรียนจำลอง ปี 3 เทอม 1 (Year 3 Sem 1)',
    sub: 'BME Assumed Schedule (PDF)',
    type: 'pdf',
    url: 'BMEASSUMESCHE/year3s1.pdf',
    desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 3 ภาคการศึกษาที่ 1'
  },
  {
    id: 'doc-sche-y3s2',
    folderId: 'f-handbook',
    title: '📅 ตารางเรียนจำลอง ปี 3 เทอม 2 (Year 3 Sem 2)',
    sub: 'BME Assumed Schedule (PDF)',
    type: 'pdf',
    url: 'BMEASSUMESCHE/year3s2.pdf',
    desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 3 ภาคการศึกษาที่ 2'
  },
  {
    id: 'doc-sche-y4s1',
    folderId: 'f-handbook',
    title: '📅 ตารางเรียนจำลอง ปี 4 เทอม 1 (Year 4 Sem 1)',
    sub: 'BME Assumed Schedule (PDF)',
    type: 'pdf',
    url: 'BMEASSUMESCHE/year4s1.pdf',
    desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 4 ภาคการศึกษาที่ 1'
  },
  {
    id: 'doc-sche-y4s2',
    folderId: 'f-handbook',
    title: '📅 ตารางเรียนจำลอง ปี 4 เทอม 2 (Year 4 Sem 2)',
    sub: 'BME Assumed Schedule (PDF)',
    type: 'pdf',
    url: 'BMEASSUMESCHE/year4s2.pdf',
    desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 4 ภาคการศึกษาที่ 2'
  }
];

// ============================================================
// 4-Year BME Curriculum Knowledge & Prerequisite Graph Data
// ============================================================
const BME_PILLARS = {
  circuits: {
    id: 'circuits',
    name: 'Electronics & Signals',
    nameTh: '⚡ ฮาร์ดแวร์ & สัญญาณการแพทย์',
    color: '#2563eb',
    bg: 'rgba(37, 99, 235, 0.12)',
    icon: '⚡'
  },
  computing: {
    id: 'computing',
    name: 'AI, Code & Math',
    nameTh: '💻 ปัญญาประดิษฐ์ & ซอฟต์แวร์',
    color: '#059669',
    bg: 'rgba(16, 185, 129, 0.12)',
    icon: '💻'
  },
  biomech: {
    id: 'biomech',
    name: 'Biomechanics & Robotics',
    nameTh: '🦾 ชีวกลศาสตร์ & หุ่นยนต์การแพทย์',
    color: '#d97706',
    bg: 'rgba(217, 119, 6, 0.12)',
    icon: '🦾'
  },
  biomaterials: {
    id: 'biomaterials',
    name: 'Biomaterials & Life Science',
    nameTh: '🧬 วัสดุชีวการแพทย์ & ชีวเคมี',
    color: '#9333ea',
    bg: 'rgba(147, 51, 234, 0.12)',
    icon: '🧬'
  },
  core: {
    id: 'core',
    name: 'BME Core & Capstone',
    nameTh: '🏆 แกนหลัก BME & โครงงานวิจัย',
    color: '#C45A1B',
    bg: 'rgba(196, 90, 27, 0.12)',
    icon: '🏆'
  }
};

const BME_SEMESTERS = [
  { id: 'y1s1', year: 1, sem: 1, label: 'ปี 1 เทอม 1', labelEn: 'Year 1 Sem 1' },
  { id: 'y1s2', year: 1, sem: 2, label: 'ปี 1 เทอม 2', labelEn: 'Year 1 Sem 2' },
  { id: 'y2s1', year: 2, sem: 1, label: 'ปี 2 เทอม 1', labelEn: 'Year 2 Sem 1' },
  { id: 'y2s2', year: 2, sem: 2, label: 'ปี 2 เทอม 2', labelEn: 'Year 2 Sem 2' },
  { id: 'y3s1', year: 3, sem: 1, label: 'ปี 3 เทอม 1', labelEn: 'Year 3 Sem 1' },
  { id: 'y3s2', year: 3, sem: 2, label: 'ปี 3 เทอม 2', labelEn: 'Year 3 Sem 2' },
  { id: 'y4',   year: 4, sem: 0, label: 'ปี 4 (Capstone)', labelEn: 'Year 4 Specializations' },
];

const BME_GRAPH_NODES = [
  // ─── Year 1 Semester 1 ───
  {
    id: 'SCMA101',
    code: 'SCMA 101',
    name: 'Mathematics I',
    nameTh: 'คณิตศาสตร์ 1',
    credits: 2,
    sem: 'y1s1',
    pillar: 'computing',
    prereqs: [],
    unlocks: ['SCMA102', 'EGBI221'],
    desc: 'แคลคูลัส อนุพันธ์ และการอินทิเกรตสำหรับสร้างแบบจำลองทางฟิสิกส์และระบบชีวการแพทย์'
  },
  {
    id: 'SCPY161',
    code: 'SCPY 161',
    name: 'General Physics I',
    nameTh: 'ฟิสิกส์ทั่วไป 1',
    credits: 3,
    sem: 'y1s1',
    pillar: 'biomech',
    prereqs: [],
    unlocks: ['SCPY162', 'EGBI110', 'EGBI260', 'EGBI270'],
    desc: 'กลศาสตร์ของนิวตัน งาน พลังงาน และการเคลื่อนที่ รากฐานสู่ชีวกลศาสตร์และแรงกระทำในกระดูก'
  },
  {
    id: 'SCCH161',
    code: 'SCCH 161',
    name: 'General Chemistry',
    nameTh: 'เคมีทั่วไป',
    credits: 3,
    sem: 'y1s1',
    pillar: 'biomaterials',
    prereqs: [],
    unlocks: ['SCCH172', 'EGBI110', 'EGBI270'],
    desc: 'โครงสร้างอะตอม พันธะเคมี และอุณหพลศาสตร์ รากฐานสู่วัสดุฝังในร่างกายและพอลิเมอร์ทางการแพทย์'
  },
  {
    id: 'SCSL190',
    code: 'SCSL 190',
    name: 'Wonderful Life (Biology)',
    nameTh: 'ชีววิทยาสิ่งมีชีวิต',
    credits: 3,
    sem: 'y1s1',
    pillar: 'biomaterials',
    prereqs: [],
    unlocks: ['SCAN201', 'EGBI252'],
    desc: 'ชีววิทยาระดับเซลล์ สรีรวิทยา และพันธุศาสตร์ รากฐานสู่วิชากายวิภาคศาสตร์และชีวโมเลกุล'
  },
  {
    id: 'EGBI122',
    code: 'EGBI 122',
    name: 'Computer Programming',
    nameTh: 'การเขียนโปรแกรมคอมพิวเตอร์',
    credits: 3,
    sem: 'y1s1',
    pillar: 'computing',
    prereqs: [],
    unlocks: ['EGBI220', 'EGBI223', 'EGBI405'],
    desc: 'การเขียนโค้ด อัลกอริทึม และการประมวลผลข้อมูลตัวเลข สู่การวิเคราะห์ข้อมูลผู้ป่วยและ AI ทางการแพทย์'
  },
  {
    id: 'EGBI100',
    code: 'EGBI 100',
    name: 'BME in the Real World',
    nameTh: 'วิศวกรรมชีวการแพทย์ในโลกจริง',
    credits: 1,
    sem: 'y1s1',
    pillar: 'core',
    prereqs: [],
    unlocks: ['EGBI101', 'EGBI390'],
    desc: 'ภาพรวมวิศวกรรมชีวการแพทย์ นวัตกรรมเครื่องมือแพทย์ และแนวทางการวิจัยในห้องปฏิบัติการ'
  },
  {
    id: 'SCPY111',
    code: 'SCPY 111',
    name: 'Physics Laboratory I',
    nameTh: 'ปฏิบัติการฟิสิกส์ 1',
    credits: 1,
    sem: 'y1s1',
    pillar: 'biomech',
    prereqs: [],
    unlocks: ['EGBI201'],
    desc: 'ปฏิบัติการวัดทางฟิสิกส์ การวิเคราะห์ความคลาดเคลื่อนและการทดลองกลศาสตร์'
  },
  {
    id: 'SCCH169',
    code: 'SCCH 169',
    name: 'Chemistry Laboratory',
    nameTh: 'ปฏิบัติการเคมี',
    credits: 1,
    sem: 'y1s1',
    pillar: 'biomaterials',
    prereqs: [],
    unlocks: ['EGBI252'],
    desc: 'ปฏิบัติการวิเคราะห์เคมีเชิงปริมาณและการสังเคราะห์สารเคมี'
  },
  {
    id: 'SCBE102',
    code: 'SCBE 102',
    name: 'General Biology Lab 1',
    nameTh: 'ปฏิบัติการชีววิทยา 1',
    credits: 1,
    sem: 'y1s1',
    pillar: 'biomaterials',
    prereqs: [],
    unlocks: ['SCAN201'],
    desc: 'ปฏิบัติการส่องกล้องจุลทรรศน์ วิเคราะห์เซลล์และโครงสร้างเนื้อเยื่อสิ่งมีชีวิต'
  },
  {
    id: 'LAEN182',
    code: 'LAEN 182',
    name: 'English for Academic Purposes',
    nameTh: 'ภาษาอังกฤษเชิงวิชาการ',
    credits: 2,
    sem: 'y1s1',
    pillar: 'core',
    prereqs: [],
    unlocks: ['EGBI390', 'EGBI495'],
    desc: 'ภาษาอังกฤษสำหรับการสื่อสารทางวิศวกรรม การเขียนรายงานวิชาการ และนำเสนองานวิจัย'
  },

  // ─── Year 1 Semester 2 ───
  {
    id: 'SCMA102',
    code: 'SCMA 102',
    name: 'Mathematics II',
    nameTh: 'คณิตศาสตร์ 2',
    credits: 4,
    sem: 'y1s2',
    pillar: 'computing',
    prereqs: ['SCMA101'],
    unlocks: ['EGBI202', 'EGBI234', 'EGBI260'],
    desc: 'แคลคูลัสหลายตัวแปร สมการเชิงอนุพันธ์ และอนุกรมฟูเรียร์สำหรับการวิเคราะห์ระบบพลวัตและวงจรไฟฟ้า'
  },
  {
    id: 'SCPY162',
    code: 'SCPY 162',
    name: 'General Physics II',
    nameTh: 'ฟิสิกส์ทั่วไป 2',
    credits: 3,
    sem: 'y1s2',
    pillar: 'circuits',
    prereqs: ['SCPY161'],
    unlocks: ['EGBI234'],
    desc: 'ไฟฟ้าแม่เหล็ก คลื่นแม่เหล็กไฟฟ้า และทัศนศาสตร์ รากฐานสู่อุปกรณ์การแพทย์ เครื่อง X-ray และ MRI'
  },
  {
    id: 'SCCH172',
    code: 'SCCH 172',
    name: 'Organic Chemistry',
    nameTh: 'เคมีอินทรีย์',
    credits: 3,
    sem: 'y1s2',
    pillar: 'biomaterials',
    prereqs: ['SCCH161'],
    unlocks: ['EGBI252'],
    desc: 'โครงสร้างและปฏิกิริยาของโมเลกุลอินทรีย์ สารชีวโมเลกุล และพอลิเมอร์ชีวภาพ'
  },
  {
    id: 'EGBI101',
    code: 'EGBI 101',
    name: 'Basic Engineering Skills in BME',
    nameTh: 'ทักษะวิศวกรรมพื้นฐานใน BME',
    credits: 2,
    sem: 'y1s2',
    pillar: 'core',
    prereqs: ['EGBI100'],
    unlocks: ['EGBI201', 'EGBI301'],
    desc: 'ทักษะวิศวกรรมภาคปฏิบัติ การบัดกรีวงจร การใช้เครื่องมือช่างและแล็บเครื่องมือวัด'
  },
  {
    id: 'EGBI110',
    code: 'EGBI 110',
    name: 'Engineering Materials',
    nameTh: 'วัสดุวิศวกรรม',
    credits: 3,
    sem: 'y1s2',
    pillar: 'biomaterials',
    prereqs: ['SCCH161', 'SCPY161'],
    unlocks: ['EGBI352'],
    desc: 'คุณสมบัติเชิงกล ไฟฟ้า และความร้อนของโลหะ พอลิเมอร์ เซรามิก และวัสดุผสม'
  },
  {
    id: 'EGBI120',
    code: 'EGBI 120',
    name: 'Engineering Drawing & CAD',
    nameTh: 'การเขียนแบบวิศวกรรมและ CAD',
    credits: 3,
    sem: 'y1s2',
    pillar: 'biomech',
    prereqs: [],
    unlocks: ['EGBI301', 'EGBI481'],
    desc: 'การเขียนแบบ 2D/3D Solid Modeling สำหรับออกแบบชิ้นส่วนอวัยวะเทียมและหุ่นยนต์การแพทย์'
  },

  // ─── Year 2 Semester 1 ───
  {
    id: 'SCAN201',
    code: 'SCAN 201',
    name: 'Essential Human Anatomy',
    nameTh: 'กายวิภาคศาสตร์มนุษย์',
    credits: 3,
    sem: 'y2s1',
    pillar: 'biomaterials',
    prereqs: ['SCSL190', 'SCBE102'],
    unlocks: ['EGBI351', 'EGBI403'],
    desc: 'กายวิภาคศาสตร์มนุษย์ โครงสร้างกระดูก กล้ามเนื้อ อวัยวะภายใน ระบบหัวใจและหลอดเลือด'
  },
  {
    id: 'EGBI202',
    code: 'EGBI 202',
    name: 'Engineering Mathematics',
    nameTh: 'คณิตศาสตร์วิศวกรรม',
    credits: 3,
    sem: 'y2s1',
    pillar: 'computing',
    prereqs: ['SCMA102'],
    unlocks: ['EGBI220', 'EGBI340'],
    desc: 'สมการเชิงอนุพันธ์ย่อย ลาปลาซทรานส์ฟอร์ม เมทริกซ์ และการวิเคราะห์เวกเตอร์สำหรับระบบการแพทย์'
  },
  {
    id: 'EGBI221',
    code: 'EGBI 221',
    name: 'Biostatistics and Probability',
    nameTh: 'ชีวสถิติและความน่าจะเป็น',
    credits: 3,
    sem: 'y2s1',
    pillar: 'computing',
    prereqs: ['SCMA101'],
    unlocks: ['EGBI405', 'EGBI495'],
    desc: 'สถิติชีวการแพทย์ การทดสอบสมมติฐานทางคลินิก และการวิเคราะห์ข้อมูลผู้ป่วย'
  },
  {
    id: 'EGBI234',
    code: 'EGBI 234',
    name: 'Electric Circuits for BME',
    nameTh: 'วงจรไฟฟ้าสำหรับ BME',
    credits: 3,
    sem: 'y2s1',
    pillar: 'circuits',
    prereqs: ['SCPY162', 'SCMA102'],
    unlocks: ['EGBI201', 'EGBI223', 'EGBI233', 'EGBI340'],
    desc: 'ทฤษฎีวงจรไฟฟ้า AC/DC โหนด/เมช วงจรกรองความถี่ (Filters) และวงจร RLC ในเครื่องมือแพทย์'
  },
  {
    id: 'EGBI252',
    code: 'EGBI 252',
    name: 'Biochemistry & Molecular Biology',
    nameTh: 'ชีวเคมีและโมเลกุลชีววิทยา',
    credits: 3,
    sem: 'y2s1',
    pillar: 'biomaterials',
    prereqs: ['SCCH172', 'SCSL190'],
    unlocks: ['EGBI352'],
    desc: 'ชีวเคมี โปรตีน เอนไซม์ DNA/RNA และกระบวนการเมแทบอลิซึมระดับเซลล์'
  },
  {
    id: 'EGBI260',
    code: 'EGBI 260',
    name: 'Biomechanics 1',
    nameTh: 'ชีวกลศาสตร์ 1',
    credits: 3,
    sem: 'y2s1',
    pillar: 'biomech',
    prereqs: ['SCPY161', 'SCMA102'],
    unlocks: ['EGBI261'],
    desc: 'สถิตศาสตร์และจลนศาสตร์ของระบบกล้ามเนื้อและกระดูก แรงกระทำในข้อต่อและกระดูกสันหลัง'
  },
  {
    id: 'EGBI270',
    code: 'EGBI 270',
    name: 'Biomedical Thermodynamics',
    nameTh: 'อุณหพลศาสตร์ชีวการแพทย์',
    credits: 3,
    sem: 'y2s1',
    pillar: 'biomech',
    prereqs: ['SCCH161', 'SCPY161'],
    unlocks: ['EGBI330', 'EGBI352'],
    desc: 'อุณหพลศาสตร์ชีวการแพทย์ การถ่ายเทความร้อนในเนื้อเยื่อ และพลังงานในระบบชีววิทยา'
  },

  // ─── Year 2 Semester 2 ───
  {
    id: 'EGBI201',
    code: 'EGBI 201',
    name: 'BME Lab 1',
    nameTh: 'ปฏิบัติการวิศวกรรมชีวการแพทย์ 1',
    credits: 1,
    sem: 'y2s2',
    pillar: 'core',
    prereqs: ['EGBI234', 'EGBI101'],
    unlocks: ['EGBI300'],
    desc: 'ปฏิบัติการวงจรอิเล็กทรอนิกส์ชีวการแพทย์และการทดสอบการทำงานของเซ็นเซอร์'
  },
  {
    id: 'EGBI220',
    code: 'EGBI 220',
    name: 'Computational Methods in BME',
    nameTh: 'ระเบียบวิธีเชิงคำนวณใน BME',
    credits: 3,
    sem: 'y2s2',
    pillar: 'computing',
    prereqs: ['EGBI122', 'EGBI202'],
    unlocks: ['EGBI405'],
    desc: 'ระเบียบวิธีเชิงตัวเลข การแก้สมการเชิงอนุพันธ์ด้วยคอมพิวเตอร์และการจำลองระบบ BME'
  },
  {
    id: 'EGBI223',
    code: 'EGBI 223',
    name: 'Digital Systems & Microprocessors',
    nameTh: 'ระบบดิจิทัลและไมโครโปรเซสเซอร์',
    credits: 3,
    sem: 'y2s2',
    pillar: 'circuits',
    prereqs: ['EGBI234', 'EGBI122'],
    unlocks: ['EGBI330', 'EGBI481'],
    desc: 'ระบบดิจิทัล ไมโครคอนโทรลเลอร์ (ARM/Arduino) สถาปัตยกรรมคอมพิวเตอร์และการรับส่งข้อมูล'
  },
  {
    id: 'EGBI233',
    code: 'EGBI 233',
    name: 'Electrical & Electronics in Medicine',
    nameTh: 'ไฟฟ้าและอิเล็กทรอนิกส์ทางการแพทย์',
    credits: 3,
    sem: 'y2s2',
    pillar: 'circuits',
    prereqs: ['EGBI234'],
    unlocks: ['EGBI330'],
    desc: 'อุปกรณ์กึ่งตัวนำ Op-Amp วงจรขยายสัญญาณชีวภาพ (Biopotential Amplifiers) และความปลอดภัย'
  },
  {
    id: 'EGBI261',
    code: 'EGBI 261',
    name: 'Biomechanics 2',
    nameTh: 'ชีวกลศาสตร์ 2',
    credits: 3,
    sem: 'y2s2',
    pillar: 'biomech',
    prereqs: ['EGBI260'],
    unlocks: ['EGBI301', 'EGBI481', 'EGBI403'],
    desc: 'พลศาสตร์ชีวกลศาสตร์ การวิเคราะห์การเดิน (Gait Analysis) และกลศาสตร์ของไหลชีวภาพ (Hemodynamics)'
  },

  // ─── Year 3 Semester 1 ───
  {
    id: 'EGBI300',
    code: 'EGBI 300',
    name: 'BME Lab 2',
    nameTh: 'ปฏิบัติการวิศวกรรมชีวการแพทย์ 2',
    credits: 1,
    sem: 'y3s1',
    pillar: 'core',
    prereqs: ['EGBI201'],
    unlocks: ['EGBI391', 'EGBI495'],
    desc: 'ปฏิบัติการเครื่องมือแพทย์ระดับสูง การวัดสัญญาณ ECG/EMG/EEG และการทดสอบวัสดุชีวภาพ'
  },
  {
    id: 'EGBI301',
    code: 'EGBI 301',
    name: 'Design for Biomedical Engineering',
    nameTh: 'การออกแบบทางวิศวกรรมชีวการแพทย์',
    credits: 3,
    sem: 'y3s1',
    pillar: 'core',
    prereqs: ['EGBI120', 'EGBI261'],
    unlocks: ['EGBI495', 'EGBI403'],
    desc: 'กระบวนการออกแบบวิศวกรรมการแพทย์ Design Thinking ข้อกำหนดมาตรฐานสากล ISO13485/FDA'
  },
  {
    id: 'EGBI330',
    code: 'EGBI 330',
    name: 'Biomedical Measurement & Instrumentation',
    nameTh: 'การวัดและเครื่องมือวัดชีวการแพทย์',
    credits: 3,
    sem: 'y3s1',
    pillar: 'circuits',
    prereqs: ['EGBI233', 'EGBI223'],
    unlocks: ['EGBI485', 'EGBI495'],
    desc: 'เซ็นเซอร์ชีวการแพทย์ เครื่องตรวจคลื่นไฟฟ้าหัวใจ (ECG), Pulse Oximeter และอัลตราซาวด์'
  },
  {
    id: 'EGBI340',
    code: 'EGBI 340',
    name: 'Biomedical Signals & Systems',
    nameTh: 'สัญญาณและระบบชีวการแพทย์',
    credits: 3,
    sem: 'y3s1',
    pillar: 'circuits',
    prereqs: ['EGBI202', 'EGBI234'],
    unlocks: ['EGBI331', 'EGBI401', 'EGBI441'],
    desc: 'การวิเคราะห์สัญญาณในโดเมนเวลาและความถี่ Fourier/Z-Transform และตัวกรองดิจิทัล'
  },
  {
    id: 'EGBI352',
    code: 'EGBI 352',
    name: 'Biomaterials',
    nameTh: 'วัสดุชีวการแพทย์',
    credits: 3,
    sem: 'y3s1',
    pillar: 'biomaterials',
    prereqs: ['EGBI110', 'EGBI252'],
    unlocks: ['EGBI351', 'EGBI483', 'EGBI485'],
    desc: 'วัสดุชีวการแพทย์ พอลิเมอร์ ไฮโดรเจล สารเคลือบข้อเทียม และปฏิกิริยากับสิ่งแปลกปลอม'
  },
  {
    id: 'EGBI405',
    code: 'EGBI 405',
    name: 'AI in Medical Applications',
    nameTh: 'ปัญญาประดิษฐ์ประยุกต์ทางการแพทย์',
    credits: 3,
    sem: 'y3s1',
    pillar: 'computing',
    prereqs: ['EGBI122', 'EGBI220', 'EGBI221'],
    unlocks: ['EGBI495'],
    desc: 'ปัญญาประดิษฐ์ทางการแพทย์ Machine Learning, Deep Learning วิเคราะห์ภาพรังสีและทำนายสุขภาพ'
  },

  // ─── Year 3 Semester 2 ───
  {
    id: 'EGBI331',
    code: 'EGBI 331',
    name: 'Control Systems for BME',
    nameTh: 'ระบบควบคุมสำหรับ BME',
    credits: 3,
    sem: 'y3s2',
    pillar: 'circuits',
    prereqs: ['EGBI340'],
    unlocks: ['EGBI481'],
    desc: 'ระบบควบคุมป้อนกลับ PID Controller การควบคุมหุ่นยนต์แขนกลผ่าตัดและเครื่องช่วยหายใจ'
  },
  {
    id: 'EGBI351',
    code: 'EGBI 351',
    name: 'Biocompatibility',
    nameTh: 'ความเข้ากันได้ทางชีวภาพ',
    credits: 3,
    sem: 'y3s2',
    pillar: 'biomaterials',
    prereqs: ['EGBI352', 'SCAN201'],
    unlocks: ['EGBI483'],
    desc: 'ความเข้ากันได้ทางชีวภาพ การทดสอบความเป็นพิษต่อเซลล์ (Cytotoxicity) และภูมิคุ้มกัน'
  },
  {
    id: 'EGBI390',
    code: 'EGBI 390',
    name: 'Business for Medical Entrepreneurs',
    nameTh: 'ธุรกิจสำหรับผู้ประกอบการการแพทย์',
    credits: 3,
    sem: 'y3s2',
    pillar: 'core',
    prereqs: ['EGBI100', 'LAEN182'],
    unlocks: ['EGBI495'],
    desc: 'การสร้างธุรกิจนวัตกรรมแพทย์ การจดสิทธิบัตร (Patent) การประเมินเทคโนโลยี และ MedTech Startup'
  },
  {
    id: 'EGBI401',
    code: 'EGBI 401',
    name: 'Medical Imaging',
    nameTh: 'การสร้างภาพทางการแพทย์',
    credits: 3,
    sem: 'y3s2',
    pillar: 'circuits',
    prereqs: ['EGBI340'],
    unlocks: ['EGBI441', 'EGBI495'],
    desc: 'หลักการสร้างภาพทางการแพทย์ X-ray, CT Scan, MRI, Ultrasound และการฟื้นฟูภาพรังสี 3 มิติ'
  },
  {
    id: 'EGBI391',
    code: 'EGBI 391',
    name: 'BME Training / Internship',
    nameTh: 'การฝึกงานวิศวกรรมชีวการแพทย์',
    credits: 3,
    sem: 'y3s2',
    pillar: 'core',
    prereqs: ['EGBI300'],
    unlocks: ['EGBI495'],
    desc: 'การฝึกงานในโรงพยาบาล สถาบันวิจัยชั้นนำ หรือบริษัทยักษ์ใหญ่ด้านอุปกรณ์การแพทย์ (>= 240 ชม.)'
  },

  // ─── Year 4 Specialization & Capstone ───
  {
    id: 'EGBI495',
    code: 'EGBI 495',
    name: 'BME Capstone Project 1',
    nameTh: 'โครงงานวิจัยชีวการแพทย์ 1',
    credits: 3,
    sem: 'y4',
    pillar: 'core',
    prereqs: ['EGBI301', 'EGBI330'],
    unlocks: ['EGBI496'],
    desc: 'โครงงานปริญญานิพนธ์ขั้นที่ 1 ออกแบบและทดสอบต้นแบบนวัตกรรมชีวการแพทย์ร่วมกับอาจารย์ที่ปรึกษา'
  },
  {
    id: 'EGBI496',
    code: 'EGBI 496',
    name: 'BME Capstone Project 2',
    nameTh: 'โครงงานวิจัยชีวการแพทย์ 2',
    credits: 3,
    sem: 'y4',
    pillar: 'core',
    prereqs: ['EGBI495'],
    unlocks: [],
    desc: 'โครงงานปริญญานิพนธ์ขั้นที่ 2 การทดสอบประสิทธิภาพทางคลินิก การเขียนเปเปอร์วิชาการ และนำเสนองาน'
  },
  {
    id: 'EGBI441',
    code: 'EGBI 441',
    name: 'Medical Signal Processing',
    nameTh: 'การประมวลผลสัญญาณการแพทย์',
    credits: 3,
    sem: 'y4',
    pillar: 'circuits',
    prereqs: ['EGBI340'],
    unlocks: ['EGBI444'],
    desc: 'การประมวลผลสัญญาณสมองและประสาทขั้นสูง Wavelet Transform และ Noise Reduction'
  },
  {
    id: 'EGBI444',
    code: 'EGBI 444',
    name: 'Neuroengineering',
    nameTh: 'วิศวกรรมประสาทและสมอง',
    credits: 3,
    sem: 'y4',
    pillar: 'circuits',
    prereqs: ['EGBI441'],
    unlocks: [],
    desc: 'วิศวกรรมระบบประสาท Brain-Computer Interface (BCI) ขาเทียมสั่งการด้วยคลื่นสมอง (MINT LAB)'
  },
  {
    id: 'EGBI481',
    code: 'EGBI 481',
    name: 'Introduction to Medical Robotics',
    nameTh: 'หุ่นยนต์ทางการแพทย์',
    credits: 3,
    sem: 'y4',
    pillar: 'biomech',
    prereqs: ['EGBI331', 'EGBI261', 'EGBI120'],
    unlocks: [],
    desc: 'หุ่นยนต์ทางการแพทย์ แขนกลช่วยผ่าตัดความแม่นยำสูง ระบบนำทางผ่าตัด (BART LAB)'
  },
  {
    id: 'EGBI403',
    code: 'EGBI 403',
    name: 'Artificial Organs & Assistive Tech',
    nameTh: 'อวัยวะเทียมและเทคโนโลยีช่วยเหลือ',
    credits: 3,
    sem: 'y4',
    pillar: 'biomech',
    prereqs: ['EGBI301', 'EGBI261', 'SCAN201'],
    unlocks: [],
    desc: 'อวัยวะเทียม หัวใจเทียม ไตเทียม แขน-ขาเทียมกลไก และเทคโนโลยีช่วยเหลือผู้ป่วย'
  },
  {
    id: 'EGBI483',
    code: 'EGBI 483',
    name: 'Drug Delivery System',
    nameTh: 'ระบบนำส่งยาตรงเป้าหมาย',
    credits: 3,
    sem: 'y4',
    pillar: 'biomaterials',
    prereqs: ['EGBI352', 'EGBI351'],
    unlocks: [],
    desc: 'ระบบนำส่งยาตรงเป้าหมาย อนุภาคนาโนต้านมะเร็ง และพอลิเมอร์ควบคุมการปลดปล่อยยา (BioNEDD LAB)'
  },
  {
    id: 'EGBI485',
    code: 'EGBI 485',
    name: 'Biosensors',
    nameTh: 'ไบโอเซนเซอร์ทางการแพทย์',
    credits: 3,
    sem: 'y4',
    pillar: 'biomaterials',
    prereqs: ['EGBI330', 'EGBI352'],
    unlocks: [],
    desc: 'ไบโอเซนเซอร์ตรวจวัดสารเคมีในเลือด แถบตรวจโรคแบบพกพา (Lab-on-a-chip) (Biosensors LAB)'
  }
];

