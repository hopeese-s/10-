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
