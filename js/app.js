// ============================================================
// app.js — EgBE Memory Engine & Daily Study Dashboard
// Combined Application Logic (9th Functional Engine + 3rd UI/UX)
// ============================================================

(function () {
  'use strict';

  // ─── IndexedDB Local File Storage (Robust across iPadOS, iOS, Android, Mac, Windows) ───
  const LocalFileDB = {
    dbPromise: null,
    getDB() {
      if (!this.dbPromise) {
        this.dbPromise = new Promise((resolve) => {
          if (typeof indexedDB === 'undefined') {
            resolve(null);
            return;
          }
          const req = indexedDB.open('ecalendar_files_db', 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('files')) {
              db.createObjectStore('files');
            }
          };
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = () => resolve(null);
        });
      }
      return this.dbPromise;
    },
    async setFile(id, dataUrl) {
      try {
        const db = await this.getDB();
        if (!db) return false;
        return new Promise((resolve) => {
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put(dataUrl, id);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        });
      } catch (_) { return false; }
    },
    async getFile(id) {
      try {
        const db = await this.getDB();
        if (!db) return null;
        return new Promise((resolve) => {
          const tx = db.transaction('files', 'readonly');
          const req = tx.objectStore('files').get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      } catch (_) { return null; }
    },
    async deleteFile(id) {
      try {
        const db = await this.getDB();
        if (!db) return false;
        return new Promise((resolve) => {
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').delete(id);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        });
      } catch (_) { return false; }
    }
  };
  window.LocalFileDB = LocalFileDB;

  // ─── State ───────────────────────────────────────────────
  const state = {
    // Navigation
    currentTopView: 'home',       // 'home' | 'dashboard' | 'curriculum' | 'study' | 'graph'
    currentDashboardView: 'timeline', // 'timeline' | 'week' | 'schedule'
    currentDay: 'monday',

    // 9th Core Dashboard State
    theme: 'light',
    version: 0,
    updatedAt: new Date().toISOString(),
    checklist: {},      // { 'monday-2026-08-17': { 'mon-11-0': true } }
    subjects: {},       // { 'monday-2026-08-17': { 'mon-11-0': 'GenPhy' } }
    customBlocks: {},   // per-day overrides { monday: [...extra blocks] }
    editingBlock: null,
    addingDay: null,

    // Curriculum View Mode ('grid' | 'list')
    curriculumViewMode: 'grid',

    // Active category filter in Study view ('all' | 'classroom' | 'drive' | 'pdf')
    studyFilter: 'all',

    // Study Resource Links (Classroom, Drive, PDF documents, and custom links)
    studyLinks: [],
    curriculum: []
  };

  
  const DEFAULT_CURRICULUM = [
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

  const DEFAULT_STUDY_LINKS = [
    // ─── Google Classroom (จากบนลงล่างตามภาพ) ───
    {
      id: 'gc-1',
      title: 'SCCH161 General Chemistry',
      sub: 'EGBI/EGCG/EGII Year 1 - 1/2026',
      type: 'classroom',
      url: 'https://classroom.google.com/u/6/c/ODcwMjc5NzAyMjcy',
      desc: 'Google Classroom วิชาเคมีทั่วไป (SCCH161)'
    },
    {
      id: 'gc-2',
      title: 'SCPY111/114/115-(2026-1) Physics Laboratory I',
      sub: 'EGBI, EGCG, EGII, ENNM, SCCT, SCI...',
      type: 'classroom',
      url: 'https://classroom.google.com/u/6/c/ODU1NzE4MDAyNzE5',
      desc: 'Google Classroom ปฏิบัติการฟิสิกส์ 1 (SCPY111)'
    },
    {
      id: 'gc-3',
      title: 'SCMA101 Mathematics I',
      sub: 'SECTION 2',
      type: 'classroom',
      url: 'https://classroom.google.com/u/6/c/ODcxNjY1MDM2MTY2',
      desc: 'Google Classroom วิชาคณิตศาสตร์ 1 (SCMA101 Sec 2)'
    },
    {
      id: 'gc-4',
      title: 'SCSL 190 Wonderful Life (Biology)',
      sub: 'EGBI',
      type: 'classroom',
      url: 'https://classroom.google.com/u/6/c/Nzk4Mzk2MTI3MDI1',
      desc: 'Google Classroom วิชา Wonderful Life (SCSL190)'
    },
    {
      id: 'gc-5',
      title: '2026/27_EGBI 100 Biomedical Engineering in the Real World',
      sub: 'EGBI Year 1',
      type: 'classroom',
      url: 'https://classroom.google.com/u/6/c/ODcwMzEwOTI0OTg2',
      desc: 'Google Classroom วิชา BME in the Real World (EGBI100)'
    },
    {
      id: 'gc-6',
      title: 'SCPY 161 General Physics I',
      sub: 'EGBI Year 1 - 1/2026',
      type: 'classroom',
      url: 'https://classroom.google.com/u/6/c/ODcxMTQzMDA0NzAw',
      desc: 'Google Classroom วิชาฟิสิกส์ทั่วไป 1 (SCPY161)'
    },
    {
      id: 'gc-7',
      title: 'SCBE102 General Biology Laboratory 1',
      sub: 'EGBI, SCBE, SCIN, SCBM, SCME, SC...',
      type: 'classroom',
      url: 'https://classroom.google.com/u/6/c/ODY3NjU2OTgwNDEz',
      desc: 'Google Classroom ปฏิบัติการชีววิทยาทั่วไป 1 (SCBE102)'
    },
    {
      id: 'gc-8',
      title: '2026_SCCH 159/169 & SCCT Chemistry Laboratory',
      sub: 'SCBE#1, ENNM#1, EGBI#1, EGCG#1,...',
      type: 'classroom',
      url: 'https://classroom.google.com/u/6/c/ODU1NTg5NDU4MDQ1',
      desc: 'Google Classroom ปฏิบัติการเคมี (SCCH169)'
    },

    // ─── Google Drive ───
    {
      id: 'gd-eng',
      title: 'LAEN182 English for General Academic Purposes',
      sub: 'Google Drive Folder',
      type: 'drive',
      url: 'https://drive.google.com/drive/folders/1mT_NMiY6c0j8mCyVBvsO4ceUFQfgZwri',
      desc: 'โฟลเดอร์ Google Drive ชีทและเอกสารวิชาภาษาอังกฤษ LAEN182'
    },
    {
      id: 'gd-comppro',
      title: 'EGBI122 Computer Programming (คอมโปร)',
      sub: 'Google Drive Folder',
      type: 'drive',
      url: 'https://drive.google.com/drive/u/0/mobile/folders/1XqQUjsxsj8VvhchExhS44nEJOL20WFto?usp=sharing',
      desc: 'โฟลเดอร์ Google Drive ชีท สไลด์ และโค้ดตัวอย่างวิชา Computer Programming'
    },

    // ─── PDF & Schedule Documents (In-App Preview) ───
    {
      id: 'doc-handbook',
      title: '📘 BME Undergraduate Student Handbook 2026',
      sub: 'PDF Document (In-App Preview)',
      type: 'pdf',
      url: '2026_Handbok for Biomedical Engineering Undergraduate Student.pdf',
      desc: 'คู่มือนักศึกษาหลักสูตรวิศวกรรมชีวแพทย์ มหาวิทยาลัยมหิดล'
    },
    {
      id: 'doc-egbi100-l1',
      title: '🏥 EGBI100 Lecture 1: Intro to BME',
      sub: 'PDF Lecture Slides (In-App Preview)',
      type: 'pdf',
      url: '2026-EGBI100_Lecture1_Intro_PN.pdf',
      desc: 'เอกสารประกอบการสอน BME in the Real World คาบที่ 1'
    },
    {
      id: 'doc-schedule',
      title: '📆 ตารางเรียนปี 1 ภาคเรียนที่ 1/2026 (Program B-BI)',
      sub: 'Image Schedule (In-App Preview)',
      type: 'image',
      url: 'egmu-class-schedule-2026-1-program_B-BI.png',
      desc: 'ภาพตารางเรียนหลักสูตร BME ภาคเรียนที่ 1/2026 ความละเอียดสูง'
    },

    // ─── BME Assumed Schedules (Year 1 - Year 4 from BMEASSUMESCHE) ───
    {
      id: 'doc-sche-y1s2',
      title: '📅 ตารางเรียนจำลอง ปี 1 เทอม 2 (Year 1 Sem 2)',
      sub: 'BME Assumed Schedule (PDF)',
      type: 'pdf',
      url: 'BMEASSUMESCHE/year1s2.pdf',
      desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 1 ภาคการศึกษาที่ 2'
    },
    {
      id: 'doc-sche-y2s1',
      title: '📅 ตารางเรียนจำลอง ปี 2 เทอม 1 (Year 2 Sem 1)',
      sub: 'BME Assumed Schedule (PDF)',
      type: 'pdf',
      url: 'BMEASSUMESCHE/year2s1.pdf',
      desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 2 ภาคการศึกษาที่ 1'
    },
    {
      id: 'doc-sche-y2s2',
      title: '📅 ตารางเรียนจำลอง ปี 2 เทอม 2 (Year 2 Sem 2)',
      sub: 'BME Assumed Schedule (PDF)',
      type: 'pdf',
      url: 'BMEASSUMESCHE/year2s2.pdf',
      desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 2 ภาคการศึกษาที่ 2'
    },
    {
      id: 'doc-sche-y3s1',
      title: '📅 ตารางเรียนจำลอง ปี 3 เทอม 1 (Year 3 Sem 1)',
      sub: 'BME Assumed Schedule (PDF)',
      type: 'pdf',
      url: 'BMEASSUMESCHE/year3s1.pdf',
      desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 3 ภาคการศึกษาที่ 1'
    },
    {
      id: 'doc-sche-y3s2',
      title: '📅 ตารางเรียนจำลอง ปี 3 เทอม 2 (Year 3 Sem 2)',
      sub: 'BME Assumed Schedule (PDF)',
      type: 'pdf',
      url: 'BMEASSUMESCHE/year3s2.pdf',
      desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 3 ภาคการศึกษาที่ 2'
    },
    {
      id: 'doc-sche-y4s1',
      title: '📅 ตารางเรียนจำลอง ปี 4 เทอม 1 (Year 4 Sem 1)',
      sub: 'BME Assumed Schedule (PDF)',
      type: 'pdf',
      url: 'BMEASSUMESCHE/year4s1.pdf',
      desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 4 ภาคการศึกษาที่ 1'
    },
    {
      id: 'doc-sche-y4s2',
      title: '📅 ตารางเรียนจำลอง ปี 4 เทอม 2 (Year 4 Sem 2)',
      sub: 'BME Assumed Schedule (PDF)',
      type: 'pdf',
      url: 'BMEASSUMESCHE/year4s2.pdf',
      desc: 'ผังตารางเรียนและเวลาเรียนจำลองหลักสูตร BME ชั้นปีที่ 4 ภาคการศึกษาที่ 2'
    }
  ];

  // ─── Init ────────────────────────────────────────────────
  async function init() {
    loadFromStorage();
    detectTheme();
    applyTheme();

    const todayIndex = new Date().getDay();
    state.currentDay = getDayKey(todayIndex) || 'monday';

    // Check share route FIRST — before any cloud sync (prevent personal data leak)
    const isShareRoute = await checkPublicShareRoute();

    // Verify authentication on startup if auth token exists
    if (!isShareRoute && window.CloudSync) {
      await CloudSync.checkAuth();
    }

    // Cloud Sync initial smart sync — ALWAYS pull latest data on startup/refresh
    if (!isShareRoute && window.CloudSync && CloudSync.getSyncKey()) {
      const pullRes = await CloudSync.pullFromCloud();
      if (pullRes && pullRes.ok && pullRes.data) {
        syncSmartWithCloud(pullRes.data);
      }
    }
    // Initialize Push Notifications
    if (window.PushClient) {
      PushClient.init().catch(() => {});
    }

    setupGlobalEventListeners();
    setup9thEventListeners();
    startClock();
    startTimeIndicator();

    // Render initial views with URL Hash & Query routing
    renderDayTabs();
    
    const urlParams = new URLSearchParams(window.location.search);
    const hash = (window.location.hash || '').replace('#', '').toLowerCase().trim();
    const targetView = urlParams.get('view') || hash || 'home';
    const targetSubview = urlParams.get('subview');
    const targetFolder = urlParams.get('folder');
    const previewFileId = urlParams.get('preview') || urlParams.get('fileId') || urlParams.get('file');

    if (targetFolder) {
      state.selectedFolderId = targetFolder;
      localStorage.setItem('sd-selected-folder', targetFolder);
      localStorage.setItem('sd-study-active-folder', targetFolder);
    }

    if (['home', 'dashboard', 'curriculum', 'study', 'graph'].includes(targetView)) {
      switchTopView(targetView);
      if (targetView === 'dashboard' && targetSubview && ['timeline', 'week', 'schedule'].includes(targetSubview)) {
        switchDashboardView(targetSubview);
      }
    } else if (['timeline', 'week', 'schedule'].includes(targetView)) {
      switchTopView('dashboard');
      switchDashboardView(targetView);
    } else {
      switchTopView('home');
    }

    // Auto-open file preview if specified in URL query
    if (previewFileId && state.studyLinks && state.studyLinks.length > 0) {
      const match = state.studyLinks.find(l => l.id === previewFileId || (l.url && l.url.includes(previewFileId)));
      if (match) {
        setTimeout(() => openResourcePreview(match), 350);
      }
    }

    window.addEventListener('hashchange', () => {
      const h = (window.location.hash || '').replace('#', '').toLowerCase().trim();
      if (['home', 'dashboard', 'curriculum', 'study', 'graph'].includes(h)) {
        switchTopView(h);
      } else if (['timeline', 'week', 'schedule'].includes(h)) {
        switchTopView('dashboard');
        switchDashboardView(h);
      }
    });

    // Auto sync background polling — ONLY for authenticated users, NOT share-link visitors
    if (!isShareRoute && window.CloudSync && isLoggedIn) {
      CloudSync.startAutoSync(cloudData => {
        if (cloudData) {
          syncSmartWithCloud(cloudData);
        }
      });
    }

    // Window resize listener for responsive SVG graph edges
    window.addEventListener('resize', () => {
      if (state.currentTopView === 'graph') {
        drawGraphSvgEdges();
      }
    });
  }

  // ─── Storage & Smart Cloud Sync ──────────────────────────
  function touchUpdatedAt() {
    state.updatedAt = new Date().toISOString();
    state.version = (parseInt(state.version, 10) || 0) + 1;
    localStorage.setItem('sd-updated-at', state.updatedAt);
    localStorage.setItem('sd-version', String(state.version));
  }

  function syncSmartWithCloud(cloudData) {
    if (!cloudData) return 'no-data';

    // Check if cloud data is different from current local state
    const currentChecklistJson = JSON.stringify(state.checklist || {});
    const cloudChecklistJson   = JSON.stringify(cloudData.checklist || {});
    const currentSubjectsJson  = JSON.stringify(state.subjects || {});
    const cloudSubjectsJson    = JSON.stringify(cloudData.subjects || {});
    const currentCustomJson    = JSON.stringify(state.customBlocks || {});
    const cloudCustomJson      = JSON.stringify(cloudData.customBlocks || {});
    const currentFoldersJson   = JSON.stringify(state.studyFolders || []);
    const cloudFoldersJson     = JSON.stringify(cloudData.studyFolders || []);
    const currentLinksJson     = JSON.stringify(state.studyLinks || []);
    const cloudLinksJson       = JSON.stringify(cloudData.studyLinks || []);
    const currentCurriculumJson = JSON.stringify(state.curriculum || []);
    const cloudCurriculumJson   = JSON.stringify(cloudData.curriculum || []);

    const dataDifferent = (currentChecklistJson !== cloudChecklistJson) ||
                          (currentSubjectsJson !== cloudSubjectsJson) ||
                          (currentCustomJson !== cloudCustomJson) ||
                          (currentFoldersJson !== cloudFoldersJson) ||
                          (currentLinksJson !== cloudLinksJson) ||
                          (currentCurriculumJson !== cloudCurriculumJson);

    if (!dataDifferent) return 'same';

    const localVer = parseInt(state.version, 10) || 0;
    const cloudVer = parseInt(cloudData.version, 10) || 0;
    const localTime = state.updatedAt || '';
    const cloudTime = cloudData.updatedAt || '';

    // 1. Cloud is strictly newer
    if (cloudVer > localVer || (cloudVer === localVer && cloudTime > localTime)) {
      applyCloudData(cloudData);
      reRenderCurrentView();
      return 'pulled';
    }

    // 2. Local is strictly newer -> push local state to cloud
    if (localVer > cloudVer || (localVer === cloudVer && localTime > cloudTime)) {
      if (window.CloudSync) {
        CloudSync.pushToCloud(state);
      }
      return 'pushed';
    }

    // 3. Same versions or unversioned -> apply cloud data
    applyCloudData(cloudData);
    reRenderCurrentView();
    return 'pulled';
  }

  function reRenderCurrentView() {
    const isTyping = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
    if (isTyping) return;

    if (state.currentTopView === 'dashboard') {
      renderDashboardCurrentView();
    } else if (state.currentTopView === 'study') {
      renderStudyView();
    } else if (state.currentTopView === 'curriculum') {
      renderCurriculumView();
    } else if (state.currentTopView === 'graph') {
      renderGraphView();
    }
  }

  function applyCloudData(cloudData) {
    if (cloudData.version !== undefined) {
      state.version = cloudData.version;
      localStorage.setItem('sd-version', state.version);
    }
    if (cloudData.updatedAt) {
      state.updatedAt = cloudData.updatedAt;
      localStorage.setItem('sd-updated-at', state.updatedAt);
    }
    if (cloudData.isBme !== undefined) {
      state.isBme = !!cloudData.isBme;
      localStorage.setItem('sd-is-bme', state.isBme ? 'true' : 'false');
    }
    if (cloudData.checklist)    state.checklist    = cloudData.checklist;
    if (cloudData.subjects)     state.subjects      = cloudData.subjects;
    if (cloudData.customBlocks) state.customBlocks  = cloudData.customBlocks;

    // Curriculum: accept cloudData.curriculum directly (even if [] for non-BME)
    if (cloudData.curriculum && Array.isArray(cloudData.curriculum)) {
      state.curriculum = cloudData.curriculum;
      localStorage.setItem('sd-curriculum', JSON.stringify(state.curriculum));
    }

    // Folders: take cloud version if present
    if (cloudData.studyFolders && Array.isArray(cloudData.studyFolders)) {
      state.studyFolders = cloudData.studyFolders;
      if (state.isBme !== false) {
        const existingFolderIds = new Set(state.studyFolders.map(f => f.id));
        DEFAULT_STUDY_FOLDERS.forEach((df, idx) => {
          if (!existingFolderIds.has(df.id)) {
            state.studyFolders.splice(idx, 0, df);
            existingFolderIds.add(df.id);
          }
        });
      }
      localStorage.setItem('sd-study-folders', JSON.stringify(state.studyFolders));
    }

    // Links: take cloud version if present
    if (cloudData.studyLinks && Array.isArray(cloudData.studyLinks)) {
      state.studyLinks = cloudData.studyLinks;
      localStorage.setItem('sd-study-links', JSON.stringify(state.studyLinks));
    }

    // Files: ensure any files in cloudData.files are represented in studyLinks (excluding deleted files)
    if (cloudData.files && typeof cloudData.files === 'object') {
      const existingUrls = new Set((state.studyLinks || []).map(l => l.url));
      let deletedFiles = new Set();
      try {
        deletedFiles = new Set(JSON.parse(localStorage.getItem('sd-deleted-files') || '[]'));
      } catch (_) {}
      let filesAdded = false;

      Object.values(cloudData.files).forEach(f => {
        if (f && f.url && !existingUrls.has(f.url) && !deletedFiles.has(f.url) && !deletedFiles.has(f.id) && !deletedFiles.has(`file-${f.id}`)) {
          const isPdf = f.name && f.name.toLowerCase().endsWith('.pdf');
          const isImg = f.name && f.name.match(/\.(png|jpe?g|webp|gif)$/i);
          state.studyLinks.unshift({
            id: `file-${f.id || Date.now()}`,
            title: f.name || 'เอกสารที่อัปโหลด',
            sub: `Cloud Vault (${(f.size ? (f.size / 1024).toFixed(1) + ' KB' : '')})`,
            type: isPdf ? 'pdf' : isImg ? 'image' : 'file',
            url: f.url,
            desc: `บันทึกเมื่อ ${f.uploadedAt ? new Date(f.uploadedAt).toLocaleString('th-TH') : 'ก่อนหน้า'}`,
            folderId: 'f-uploads',
            createdAt: f.uploadedAt || new Date().toISOString()
          });
          existingUrls.add(f.url);
          filesAdded = true;
        }
      });
      if (filesAdded) {
        localStorage.setItem('sd-study-links', JSON.stringify(state.studyLinks));
      }
    }

    // Course Grades: sync from cloud
    if (cloudData.courseGrades && typeof cloudData.courseGrades === 'object') {
      state.courseGrades = cloudData.courseGrades;
      localStorage.setItem('sd-course-grades', JSON.stringify(state.courseGrades));
    }

    localStorage.setItem('sd-checklist',     JSON.stringify(state.checklist));
    localStorage.setItem('sd-subjects',      JSON.stringify(state.subjects));
    localStorage.setItem('sd-custom-blocks', JSON.stringify(state.customBlocks));
  }

  function loadFromStorage() {
    try {
      state.theme        = localStorage.getItem('sd-theme') || 'light';
      state.version      = parseInt(localStorage.getItem('sd-version') || '0', 10);
      state.updatedAt    = localStorage.getItem('sd-updated-at') || new Date().toISOString();
      const isBmeStored  = localStorage.getItem('sd-is-bme');
      state.isBme        = isBmeStored !== null ? (isBmeStored === 'true') : true;
      state.checklist    = JSON.parse(localStorage.getItem('sd-checklist') || '{}');
      state.subjects     = JSON.parse(localStorage.getItem('sd-subjects') || '{}');
      state.customBlocks = JSON.parse(localStorage.getItem('sd-custom-blocks') || '{}');
      state.courseGrades = JSON.parse(localStorage.getItem('sd-course-grades') || '{}');

      // Study Folders
      const savedFolders = localStorage.getItem('sd-study-folders');
      if (savedFolders !== null) {
        try {
          const parsed = JSON.parse(savedFolders);
          state.studyFolders = Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          state.studyFolders = state.isBme ? [...DEFAULT_STUDY_FOLDERS] : [];
        }
      } else {
        state.studyFolders = state.isBme ? [...DEFAULT_STUDY_FOLDERS] : [];
      }
      
      if (state.isBme && Array.isArray(state.studyFolders)) {
        const existingFolderIds = new Set(state.studyFolders.map(f => f.id));
        DEFAULT_STUDY_FOLDERS.forEach((df, idx) => {
          if (!existingFolderIds.has(df.id)) {
            state.studyFolders.splice(idx, 0, df);
            existingFolderIds.add(df.id);
          }
        });
      }
      localStorage.setItem('sd-study-folders', JSON.stringify(state.studyFolders));
      state.selectedFolderId = localStorage.getItem('sd-selected-folder') || 'all';

      // Study Links
      const savedLinks = localStorage.getItem('sd-study-links');
      if (savedLinks !== null) {
        try {
          const parsed = JSON.parse(savedLinks);
          state.studyLinks = Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          state.studyLinks = state.isBme ? [...DEFAULT_STUDY_LINKS] : [];
        }
      } else {
        state.studyLinks = state.isBme ? [...DEFAULT_STUDY_LINKS] : [];
        if (state.isBme) saveStudyLinks();
      }

      // Auto-migrate legacy uploaded files into 'f-uploads' folder
      let linksMigrated = false;
      state.studyLinks.forEach(l => {
        if (l && (!l.folderId || l.folderId === 'f-notes') && (
          (l.id && String(l.id).startsWith('file-')) ||
          (l.url && String(l.url).includes('/uploads/')) ||
          (l.sub && (String(l.sub).includes('Upload') || String(l.sub).includes('Cloud Vault'))) ||
          l.type === 'image' ||
          l.type === 'file'
        )) {
          l.folderId = 'f-uploads';
          linksMigrated = true;
        }
      });
      if (linksMigrated) {
        saveStudyLinks();
      }

      state.curriculumViewMode = localStorage.getItem('sd-curriculum-mode') || 'grid';

      // Curriculum — load saved or default
      const savedCurriculum = localStorage.getItem('sd-curriculum');
      if (savedCurriculum !== null) {
        try {
          const parsed = JSON.parse(savedCurriculum);
          if (Array.isArray(parsed)) {
            state.curriculum = parsed;
          } else {
            state.curriculum = state.isBme ? JSON.parse(JSON.stringify(DEFAULT_CURRICULUM)) : [];
          }
        } catch (_) {
          state.curriculum = state.isBme ? JSON.parse(JSON.stringify(DEFAULT_CURRICULUM)) : [];
        }
      } else {
        state.curriculum = state.isBme ? JSON.parse(JSON.stringify(DEFAULT_CURRICULUM)) : [];
      }
    } catch (e) {
      state.curriculum = state.isBme ? JSON.parse(JSON.stringify(DEFAULT_CURRICULUM)) : [];
      state.studyFolders = state.isBme ? [...DEFAULT_STUDY_FOLDERS] : [];
      state.studyLinks = state.isBme ? [...DEFAULT_STUDY_LINKS] : [];
      state.courseGrades = {};
    }
  }

  function saveChecklist() {
    touchUpdatedAt();
    localStorage.setItem('sd-checklist', JSON.stringify(state.checklist));
    if (window.CloudSync) {
      CloudSync.pushToCloud(state).then(res => {
        if (res && res.ok && res.updatedAt) {
          state.updatedAt = res.updatedAt;
          localStorage.setItem('sd-updated-at', state.updatedAt);
        }
      });
    }
  }

  function saveSubjects() {
    touchUpdatedAt();
    localStorage.setItem('sd-subjects', JSON.stringify(state.subjects));
    if (window.CloudSync) {
      CloudSync.pushToCloud(state).then(res => {
        if (res && res.ok && res.updatedAt) {
          state.updatedAt = res.updatedAt;
          localStorage.setItem('sd-updated-at', state.updatedAt);
        }
      });
    }
  }

  function saveCustomBlocks() {
    touchUpdatedAt();
    localStorage.setItem('sd-custom-blocks', JSON.stringify(state.customBlocks));
    if (window.CloudSync) {
      CloudSync.pushToCloud(state).then(res => {
        if (res && res.ok && res.updatedAt) {
          state.updatedAt = res.updatedAt;
          localStorage.setItem('sd-updated-at', state.updatedAt);
        }
      });
    }
  }

  function saveStudyFolders() {
    touchUpdatedAt();
    localStorage.setItem('sd-study-folders', JSON.stringify(state.studyFolders));
    if (window.CloudSync) {
      CloudSync.pushToCloud(state).then(res => {
        if (res && res.ok && res.updatedAt) {
          state.updatedAt = res.updatedAt;
          localStorage.setItem('sd-updated-at', state.updatedAt);
        }
      });
    }
  }

  function saveStudyLinks() {
    touchUpdatedAt();
    localStorage.setItem('sd-study-links', JSON.stringify(state.studyLinks));
    if (window.CloudSync) {
      CloudSync.pushToCloud(state).then(res => {
        if (res && res.ok && res.updatedAt) {
          state.updatedAt = res.updatedAt;
          localStorage.setItem('sd-updated-at', state.updatedAt);
        }
      });
    }
  }

  async function deleteStudyResource(id) {
    const item = state.studyLinks.find(l => l.id === id);
    if (!item) return;

    // Record tombstone in localStorage to prevent resurrection during sync
    try {
      const deletedFiles = JSON.parse(localStorage.getItem('sd-deleted-files') || '[]');
      if (item.url && !deletedFiles.includes(item.url)) deletedFiles.push(item.url);
      if (item.id && !deletedFiles.includes(item.id)) deletedFiles.push(item.id);
      localStorage.setItem('sd-deleted-files', JSON.stringify(deletedFiles));
    } catch (_) {}

    // Remove from state
    state.studyLinks = state.studyLinks.filter(l => l.id !== id);

    // Remove from IndexedDB
    if (window.LocalFileDB) {
      try { await LocalFileDB.deleteFile(id); } catch (_) {}
    }

    // Call server delete API asynchronously
    try {
      fetch('/api/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          url: item.url,
          key: window.CloudSync ? window.CloudSync.getSyncKey() : '1'
        })
      }).catch(() => {});
    } catch (_) {}

    saveStudyLinks();
    renderStudyView();
    showToast('🗑️ ลบเอกสารเรียบร้อย', 'info');
  }

  function saveTheme() {
    localStorage.setItem('sd-theme', state.theme);
  }

  // ─── Theme ───────────────────────────────────────────────
  function detectTheme() {
    if (!localStorage.getItem('sd-theme')) {
      state.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    const mobBtn = document.getElementById('mob-theme-toggle');
    if (mobBtn) {
      const icon = mobBtn.querySelector('.mob-icon');
      if (icon) icon.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    }
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    saveTheme();
  }

  // ─── Navigation Routing ──────────────────────────────────
  function switchTopView(viewName) {
    state.currentTopView = viewName;

    // Update active class on top-level pages
    document.querySelectorAll('.view-page').forEach(el => el.classList.remove('active'));
    const targetPage = document.getElementById(`view-egbe-${viewName}`);
    if (targetPage) targetPage.classList.add('active');

    // Update header nav buttons
    document.querySelectorAll('.nav-link').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update mobile nav buttons
    document.querySelectorAll('.mob-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Handle dashboard sub-nav bar visibility
    const subNavBar = document.getElementById('sub-nav-bar');
    if (subNavBar) {
      subNavBar.style.display = (viewName === 'dashboard') ? 'flex' : 'none';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Render view-specific content
    if (viewName === 'home') {
      renderHomeView();
    } else if (viewName === 'dashboard') {
      renderDashboardCurrentView();
    } else if (viewName === 'curriculum') {
      renderCurriculumView();
    } else if (viewName === 'study') {
      renderStudyView();
    } else if (viewName === 'graph') {
      renderGraphView();
    }
  }

  // ─── View 0: Home Landing Page (E-Calendar for personal use) ─
  function renderHomeView() {
    const container = document.getElementById('view-egbe-home');
    if (!container) return;

    container.innerHTML = `
      <div class="hero-section">
        <div class="hero-badge">
          <span class="hero-badge-dot"></span>
          <span class="hero-badge-text">Personal Productivity &amp; Study Suite</span>
        </div>

        <h1 class="hero-title">
          E-Calendar<br />
          <span class="hero-italic">for personal use</span>
        </h1>

        <p class="hero-subtitle">
          ระบบจัดการเวลา แผนการศึกษา ตารางเรียน และคลังความรู้ส่วนตัว พร้อมระบบ Real-Time Cloud Sync ทุกอุปกรณ์
        </p>

        <div class="hero-ctas">
          <button class="btn-hero-accent" data-view="dashboard">
            <span>📅 เปิด Daily Dashboard</span>
          </button>
          <button class="btn-hero-dark" data-view="study">
            <span>📝 คลังชีท &amp; โฟลเดอร์</span>
          </button>
          <button class="btn-hero-outline" data-view="graph">
            <span>🕸️ Knowledge Graph</span>
          </button>
        </div>

        <div class="hero-features-grid">
          <div class="feature-card" data-view="dashboard">
            <div style="font-size:28px;margin-bottom:12px">📅</div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:6px;color:var(--label)">Daily Study &amp; Checklist</h3>
            <p style="font-size:13px;color:var(--label-2);line-height:1.5">ตารางเรียนรายวัน รูทีนชีวิต ติ๊กงาน Check-off อัตโนมัติ พร้อม Real-Time Clock</p>
          </div>

          <div class="feature-card" data-view="curriculum">
            <div style="font-size:28px;margin-bottom:12px">📚</div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:6px;color:var(--label)">BME Curriculum 139 Credits</h3>
            <p style="font-size:13px;color:var(--label-2);line-height:1.5">โครงสร้างหลักสูตร 4 ชั้นปี เลือกระหว่าง Grid และ List View พร้อมสรุปหน่วยกิต</p>
          </div>

          <div class="feature-card" data-view="study">
            <div style="font-size:28px;margin-bottom:12px">📂</div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:6px;color:var(--label)">Study Folders &amp; Files</h3>
            <p style="font-size:13px;color:var(--label-2);line-height:1.5">จัดระเบียบโฟลเดอร์ ลากไฟล์ Drag &amp; Drop บน iPad และพรีวิว PDF ต่อเนื่องทุกหน้า</p>
          </div>

          <div class="feature-card" data-view="graph">
            <div style="font-size:28px;margin-bottom:12px">🕸️</div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:6px;color:var(--label)">4-Year Prerequisite Graph</h3>
            <p style="font-size:13px;color:var(--label-2);line-height:1.5">แผนผังวิชาต่อเนื่อง Interactive SVG ลากโยงวิชาบังคับก่อนตั้งแต่ปี 1 ถึงปี 4</p>
          </div>
        </div>
      </div>
    `;

    // Click handlers for hero elements
    container.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        const targetView = e.currentTarget.dataset.view;
        if (targetView) switchTopView(targetView);
      });
    });
  }

  function switchDashboardView(subviewName) {
    state.currentDashboardView = subviewName;

    // Show/hide subviews in Dashboard
    document.querySelectorAll('#view-egbe-dashboard .sub-view-panel').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`subview-${subviewName}`);
    if (target) target.classList.add('active');

    // Update segmented control buttons
    document.querySelectorAll('.sub-seg-wrap .nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === subviewName);
    });

    // Day tabs wrapper visibility (only for timeline & week)
    const dayTabsWrap = document.getElementById('day-tabs-wrapper');
    if (dayTabsWrap) {
      dayTabsWrap.style.display = (subviewName === 'timeline' || subviewName === 'week') ? 'block' : 'none';
    }

    renderDashboardCurrentView();
  }

  function renderDashboardCurrentView() {
    if (state.currentDashboardView === 'timeline') {
      renderTimeline(state.currentDay);
    } else if (state.currentDashboardView === 'week') {
      renderWeek();
    } else if (state.currentDashboardView === 'schedule') {
      renderSchedule();
    }
  }

  // ─── Time Helpers (9th Verbatim) ──────────────────────────
  // Note: getDayKey() is provided globally by data.js

  function timeToMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function minutesToHHMM(min) {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function getDuration(start, end) {
    let s = timeToMinutes(start), e = timeToMinutes(end);
    if (e <= s) e += 24 * 60; // overnight
    const diff = e - s;
    if (diff < 60) return `${diff} นาที`;
    const h = Math.floor(diff / 60), m = diff % 60;
    return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
  }

  function getISODate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getDateKey(dayKey) {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const dayOffset = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
    const td = new Date(monday);
    td.setDate(monday.getDate() + (dayOffset[dayKey] || 0));
    return getISODate(td);
  }

  function getCheckKey(dayKey) {
    return `${dayKey}-${getDateKey(dayKey)}`;
  }

  function isWitchayaUser() {
    const currentUser = window.CloudSync ? CloudSync.getCurrentUser() : null;
    if (currentUser && currentUser.username) {
      return currentUser.username.toLowerCase() === 'witchaya';
    }
    const saved = localStorage.getItem('sd-current-user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        if (u && u.username && u.username.toLowerCase() === 'witchaya') return true;
      } catch (_) {}
    }
    const syncKey = window.CloudSync ? CloudSync.getSyncKey() : (localStorage.getItem('sd-sync-key') || '');
    if (syncKey && syncKey.toLowerCase() === 'witchaya') return true;
    return false;
  }

  // ─── Day Tabs (9th Verbatim) ──────────────────────────────
  function renderDayTabs() {
    const container = document.getElementById('day-tabs');
    if (!container) return;
    const todayKey = getDayKey(new Date().getDay());
    const isWitchaya = isWitchayaUser();
    container.innerHTML = '';
    DAY_ORDER.forEach(key => {
      const day = ROUTINES[key];
      const isToday = key === todayKey;
      const isActive = key === state.currentDay;
      const btn = document.createElement('button');
      btn.className = `day-tab ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}`;
      btn.dataset.day = key;
      const statusHtml = isWitchaya ? `<span class="day-tab-status">${day.statusEmoji}</span>` : '';
      btn.innerHTML = `
        <span class="day-tab-short">${day.short}</span>
        <span class="day-tab-en">${day.labelEn.substring(0, 3)}</span>
        ${statusHtml}
      `;
      btn.addEventListener('click', () => selectDay(key));
      container.appendChild(btn);
    });
  }

  function selectDay(key) {
    state.currentDay = key;
    renderDayTabs();
    if (state.currentDashboardView === 'timeline') renderTimeline(key);
  }

  // ─── Timeline (9th Verbatim) ──────────────────────────────
  function renderTimeline(dayKey) {
    const container = document.getElementById('view-timeline');
    if (!container) return;
    const day = ROUTINES[dayKey];
    if (!day) return;

    const isWitchaya = isWitchayaUser();

    // Base blocks: only Witchaya starts with default ROUTINES. Everyone else starts empty.
    let baseBlocks = isWitchaya ? [...day.blocks] : [];

    // Build live class blocks from state.curriculum (override hardcoded ROUTINES class blocks)
    const liveCurriculum = (state.curriculum && state.curriculum.length > 0)
      ? state.curriculum
      : null;

    if (liveCurriculum) {
      // Replace class blocks for this day with live curriculum data
      const dayClasses = liveCurriculum.filter(c => (c.day || '').toLowerCase() === dayKey.toLowerCase() && c.start && c.end);
      if (dayClasses.length > 0) {
        // Remove old hardcoded class blocks for this day, keep non-class blocks
        const nonClassBlocks = baseBlocks.filter(b => !b.isClass);
        const liveClassBlocks = dayClasses.map(c => ({
          id: `live-class-${c.code}`,
          start: c.start,
          end: c.end,
          title: (c.name && c.name.startsWith(c.code)) ? c.name : `${c.code} ${c.name || ''}`.trim(),
          subtitle: c.room ? c.room : '',
          tag: 'class',
          isClass: true,
          classCode: c.code,
          notes: c.room ? `ห้อง ${c.room}` : ''
        }));
        baseBlocks = [...nonClassBlocks, ...liveClassBlocks];
      }
    }

    // Merge base blocks + custom blocks (overrides replace, extras are added)
    const customExtra = (state.customBlocks[dayKey] || []);
    const overrideIds = new Set(customExtra.filter(b => b._override).map(b => b.id));
    const mergedBase = baseBlocks.filter(b => !overrideIds.has(b.id));
    const allBlocks = [...mergedBase, ...customExtra].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    const checkKey = getCheckKey(dayKey);
    const checks = state.checklist[checkKey] || {};
    const subjects = state.subjects[checkKey] || {};

    const statusBadgeHtml = isWitchaya ? `
      <span class="status-badge ${day.status}">
        ${day.statusEmoji} ${day.statusLabel}
      </span>` : '';

    let timelineHtml = '';
    if (allBlocks.length === 0) {
      timelineHtml = `
        <div class="empty-timeline-state" style="text-align:center;padding:3.5rem 1.5rem;background:var(--bg-2);border-radius:var(--r-l);border:1px dashed var(--sep);margin-top:1rem;">
          <div style="font-size:2.5rem;margin-bottom:0.75rem;">📅</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--label);margin-bottom:0.25rem;">ยังไม่มีกิจกรรมในตารางวัน</div>
          <div style="font-size:0.875rem;color:var(--label-3);margin-bottom:1.25rem;">คุณสามารถกดปุ่ม "＋ เพิ่มกิจกรรม" ด้านบนเพื่อเริ่มจัดตารางเรียนหรือกิจกรรมของคุณเองได้เลย</div>
          <button class="add-btn" data-day="${dayKey}" id="empty-add-block-btn" style="margin:0 auto;display:inline-flex;">＋ เพิ่มกิจกรรม</button>
        </div>`;
    } else {
      timelineHtml = allBlocks.map((block) => renderBlock(block, day, checks, subjects, dayKey)).join('');
    }

    container.innerHTML = `
      <div class="stats-bar">
        ${renderStatsBar(day, checks, allBlocks)}
      </div>
      <div class="day-banner">
        <div class="day-banner-text">
          <h2>${day.labelEn} · ${day.label}</h2>
          <p>${formatDayDate(dayKey)}</p>
        </div>
        ${statusBadgeHtml}
        <button class="add-btn" data-day="${dayKey}" id="add-block-btn">
          ＋ เพิ่มกิจกรรม
        </button>
      </div>
      <div class="timeline" id="timeline-${dayKey}">
        <div class="time-now-indicator" id="time-now-indicator" style="display:none">
          <span class="time-now-label" id="time-now-label"></span>
          <div class="time-now-dot"></div>
          <div class="time-now-line"></div>
        </div>
        ${timelineHtml}
      </div>
    `;

    // Attach checklist listeners
    container.querySelectorAll('.study-check-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.study-subject-input')) return;
        const blockId = item.dataset.blockId;
        const sbIdx   = parseInt(item.dataset.sbIdx, 10);
        toggleCheck(dayKey, blockId, sbIdx);
      });
    });

    // Attach subject input listeners (real-time input debounce + change)
    let subjectDebounceTimer = null;
    container.querySelectorAll('.study-subject-input').forEach(inp => {
      const handleSave = () => {
        const blockId = inp.dataset.blockId;
        const sbIdx   = parseInt(inp.dataset.sbIdx, 10);
        const ck = getCheckKey(dayKey);
        if (!state.subjects[ck]) state.subjects[ck] = {};
        state.subjects[ck][`${blockId}-${sbIdx}`] = inp.value;
        saveSubjects();
      };

      inp.addEventListener('input', () => {
        clearTimeout(subjectDebounceTimer);
        subjectDebounceTimer = setTimeout(handleSave, 300);
      });

      inp.addEventListener('change', handleSave);
    });

    // Attach edit listeners
    container.querySelectorAll('.card-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const blockId = btn.dataset.blockId;
        openEditModal(dayKey, blockId, allBlocks);
      });
    });

    // Attach add block btn
    const addBtn = document.getElementById('add-block-btn');
    if (addBtn) addBtn.addEventListener('click', () => openAddModal(dayKey));

    updateTimeIndicator(dayKey, allBlocks);
  }

  function renderBlock(block, day, checks, subjects, dayKey) {
    const tag = TAGS[block.tag] || TAGS.break;
    const checkKey = getCheckKey(dayKey);
    const subjectData = state.subjects[checkKey] || {};

    let cardExtra = '';
    let isClassExtra = '';
    if (block.isClass && block.classCode) {
      const sc = SUBJECT_COLORS[block.classCode] || {};
      isClassExtra = `is-class" data-code="${block.classCode}`;
      cardExtra = block.subtitle ? `
        <div class="card-subtitle">
          <span class="room-badge">📍 ${block.subtitle}</span>
          <span>${sc.shortName || block.classCode}</span>
        </div>` : '';
    } else if (block.subtitle) {
      cardExtra = `<div class="card-subtitle"><span>${block.subtitle}</span></div>`;
    }

    let studyChecklist = '';
    if (block.isStudyBlock) {
      const isDone = checks[`${block.id}-${block.studyBlockIndex}`];
      const savedSubject = subjectData[`${block.id}-${block.studyBlockIndex}`] || '';
      studyChecklist = `
        <div class="study-checklist">
          <div class="study-check-item" data-block-id="${block.id}" data-sb-idx="${block.studyBlockIndex}">
            <div class="study-check-box ${isDone ? 'checked' : ''}">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L5 9L10 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="study-check-label-wrap">
              <div class="study-check-label ${isDone ? 'done' : ''}">
                ${isDone ? '✅' : '📖'} ทำครบแล้ว
              </div>
              <input class="study-subject-input" type="text" 
                placeholder="ระบุวิชาที่จะทบทวน..." 
                value="${escHtml(savedSubject)}"
                data-block-id="${block.id}" data-sb-idx="${block.studyBlockIndex}"
              />
            </div>
          </div>
        </div>`;
    }

    const notesHtml = block.notes ? `<div class="card-notes">${escHtml(block.notes)}</div>` : '';

    return `
      <div class="tl-block" data-block-id="${block.id}">
        <div class="tl-time-col">
          <span class="tl-time">${block.start}</span>
          <span class="tl-time-end">${block.end}</span>
        </div>
        <div class="tl-dot-col">
          <div class="tl-dot" style="border-color:${tag.color}"></div>
        </div>
        <div class="tl-card-col">
          <div class="act-card ${isClassExtra}" data-tag="${block.tag}" data-block-id="${block.id}">
            <div class="card-header">
              <div class="card-header-left">
                <span class="tag-chip" style="color:${tag.color};background:${tag.bg};border-color:${tag.border}">
                  ${tag.emoji} ${tag.label}
                </span>
              </div>
              <span class="card-duration">${getDuration(block.start, block.end)}</span>
              <button class="card-edit-btn" data-block-id="${block.id}" title="แก้ไข">✏️</button>
            </div>
            <div class="card-title">${escHtml(block.title)}</div>
            ${cardExtra}
            ${notesHtml}
            ${studyChecklist}
          </div>
        </div>
      </div>`;
  }

  function formatDayDate(dayKey) {
    const dateStr = getDateKey(dayKey);
    const d = new Date(dateStr + 'T00:00:00');
    const thMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return `${d.getDate()} ${thMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
  }

  // ─── Stats Bar (9th Verbatim) ────────────────────────────
  function renderStatsBar(day, checks, allBlocks = []) {
    const isWitchaya = isWitchayaUser();
    const blocksToUse = (allBlocks && allBlocks.length > 0) ? allBlocks : (isWitchaya ? day.blocks : []);
    const studyBlocks = blocksToUse.filter(b => b.isStudyBlock || b.tag === 'study');
    const totalStudyBlocks = studyBlocks.length;
    const doneBlocks = Object.values(checks).filter(Boolean).length;
    const pct = totalStudyBlocks > 0
      ? Math.round((doneBlocks / totalStudyBlocks) * 100)
      : (isWitchaya && day.studyMinutes === 0 ? 100 : 0);

    let sleepMinutes = 0;
    let studyMinutes = 0;
    if (isWitchaya && allBlocks.length === 0) {
      sleepMinutes = day.sleepMinutes;
      studyMinutes = day.studyMinutes;
    } else {
      blocksToUse.forEach(b => {
        const dur = (timeToMinutes(b.end) - timeToMinutes(b.start));
        if (dur > 0) {
          if (b.tag === 'sleep') sleepMinutes += dur;
          if (b.tag === 'study' || b.isStudyBlock) studyMinutes += dur;
        }
      });
    }

    const sleepH = Math.floor(sleepMinutes / 60);
    const sleepM = sleepMinutes % 60;
    const studyH = Math.floor(studyMinutes / 60);
    const studyM = studyMinutes % 60;
    const studyLabel = studyMinutes === 0 ? 'พักผ่อน'
      : `${studyH > 0 ? studyH + ' ชม.' : ''}${studyM > 0 ? ' ' + studyM + ' น.' : ''}`;

    const r = 20, circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    const ringColor = pct === 100 ? '#34c759' : pct >= 50 ? 'var(--accent)' : '#ff9500';
    const weekStat = calcWeeklyStreak();

    return `
      <div class="stat-item">
        <div class="stat-icon">😴</div>
        <div class="stat-body">
          <div class="stat-label">นอน</div>
          <div class="stat-value">${sleepH}<span> ชม.${sleepM > 0 ? ' ' + sleepM + 'น.' : ''}</span></div>
          <div class="stat-sub">เป้า ~8 ชม.</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon">📖</div>
        <div class="stat-body">
          <div class="stat-label">ทบทวน</div>
          <div class="stat-value">${studyLabel}</div>
          <div class="stat-sub">${totalStudyBlocks} บล็อก · ${doneBlocks} เสร็จแล้ว</div>
        </div>
      </div>
      <div class="progress-ring-wrap">
        <svg width="48" height="48" viewBox="0 0 48 48">
          <circle class="progress-ring-bg" cx="24" cy="24" r="${r}"/>
          <circle class="progress-ring-fg" cx="24" cy="24" r="${r}"
            stroke="${ringColor}"
            stroke-dasharray="${circ.toFixed(1)}"
            stroke-dashoffset="${offset.toFixed(1)}"
            transform="rotate(-90 24 24)"
          />
          <text class="progress-ring-text" x="24" y="24" fill="${ringColor}" font-size="11">${pct}%</text>
        </svg>
        <div class="stat-body">
          <div class="stat-label">วันนี้</div>
          <div class="stat-value" style="color:${ringColor};font-size:15px">${pct === 100 ? 'ครบแล้ว!' : pct + '%'}</div>
          <div class="stat-sub">${pct === 100 ? '🎉' : 'เสร็จ ' + doneBlocks + '/' + totalStudyBlocks}</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon">🔥</div>
        <div class="stat-body">
          <div class="stat-label">สัปดาห์นี้</div>
          <div class="stat-value">${weekStat.done}<span>/${weekStat.total}</span></div>
          <div class="stat-sub">บล็อกสำเร็จ</div>
        </div>
      </div>
    `;
  }

  function calcWeeklyStreak() {
    let done = 0, total = 0;
    const isWitchaya = isWitchayaUser();
    DAY_ORDER.forEach(key => {
      const day = ROUTINES[key];
      const customExtra = state.customBlocks[key] || [];
      const overrideIds = new Set(customExtra.filter(b => b._override).map(b => b.id));
      const baseBlocks = isWitchaya ? (day ? day.blocks : []).filter(b => !overrideIds.has(b.id)) : [];
      const allBlocks = [...baseBlocks, ...customExtra];
      const studyBlocks = allBlocks.filter(b => b.isStudyBlock || b.tag === 'study');

      const checkKey = getCheckKey(key);
      const checks = state.checklist[checkKey] || {};
      total += studyBlocks.length;
      done += Object.values(checks).filter(Boolean).length;
    });
    return { done, total };
  }

  // ─── Checklist Toggle (9th Verbatim) ─────────────────────
  function toggleCheck(dayKey, blockId, sbIdx) {
    const ck = getCheckKey(dayKey);
    if (!state.checklist[ck]) state.checklist[ck] = {};
    const k = `${blockId}-${sbIdx}`;
    state.checklist[ck][k] = !state.checklist[ck][k];
    saveChecklist();
    renderTimeline(dayKey);
    if (state.checklist[ck][k]) showToast('ทำครบแล้ว! ดีมาก 🎉', 'success');
  }

  // ─── Time Indicator (9th Verbatim) ───────────────────────
  function updateTimeIndicator(dayKey, blocks) {
    const indicator = document.getElementById('time-now-indicator');
    if (!indicator) return;
    const todayKey = getDayKey(new Date().getDay());
    if (dayKey !== todayKey) { indicator.style.display = 'none'; return; }

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const label = document.getElementById('time-now-label');
    if (label) label.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const timeline = document.getElementById(`timeline-${dayKey}`);
    if (!timeline) return;

    let targetEl = null;
    for (let i = 0; i < blocks.length - 1; i++) {
      const s = timeToMinutes(blocks[i].start);
      const e = timeToMinutes(blocks[i].end) || (timeToMinutes(blocks[i].start) + 60);
      const se = e <= s ? e + 1440 : e;
      const nowAdj = nowMin < s ? nowMin + 1440 : nowMin;
      if (nowAdj >= s && nowAdj < se) {
        targetEl = timeline.querySelectorAll('.tl-block')[i];
        break;
      }
    }
    if (targetEl) {
      indicator.style.display = 'flex';
      const tRect = timeline.getBoundingClientRect();
      const eRect = targetEl.getBoundingClientRect();
      indicator.style.top = (eRect.top - tRect.top + targetEl.offsetHeight * 0.5) + 'px';
    } else {
      indicator.style.display = 'none';
    }
  }

  function startTimeIndicator() {
    setInterval(() => {
      if (state.currentTopView === 'dashboard' && state.currentDashboardView === 'timeline') {
        const day = ROUTINES[state.currentDay];
        if (!day) return;
        
        const isWitchaya = isWitchayaUser();
        let baseBlocks = isWitchaya ? [...day.blocks] : [];
        if (state.curriculum && state.curriculum.length > 0) {
          const dayClasses = state.curriculum.filter(c => c.day === state.currentDay && c.start && c.end);
          if (dayClasses.length > 0) {
            const nonClassBlocks = baseBlocks.filter(b => !b.isClass);
            const liveClassBlocks = dayClasses.map(c => ({
              id: `live-class-${c.code}`,
              start: c.start,
              end: c.end,
              title: `${c.code} ${c.name}`,
              subtitle: c.room ? c.room : '',
              tag: 'class',
              isClass: true,
              classCode: c.code,
              notes: c.room ? `ห้อง ${c.room}` : ''
            }));
            baseBlocks = [...nonClassBlocks, ...liveClassBlocks];
          }
        }

        const customExtra = state.customBlocks[state.currentDay] || [];
        const overrideIds = new Set(customExtra.filter(b => b._override).map(b => b.id));
        const mergedBase = baseBlocks.filter(b => !overrideIds.has(b.id));
        const allBlocks = [...mergedBase, ...customExtra].sort((a,b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        updateTimeIndicator(state.currentDay, allBlocks);
      }
    }, 30000);
  }

  // Helper: Get classes for day (prefer live curriculum)
  function getClassesForDay(dayKey) {
    if (state.curriculum && Array.isArray(state.curriculum) && state.curriculum.length > 0) {
      const live = state.curriculum.filter(c => (c.day || '').toLowerCase() === dayKey.toLowerCase() && c.start && c.end);
      if (live.length > 0) {
        return live.map(c => ({
          code: c.code,
          name: (c.name && c.name.startsWith(c.code)) ? c.name : `${c.code} ${c.name || ''}`.trim(),
          type: c.type || 'บรรยาย',
          room: c.room || '',
          start: c.start,
          end: c.end
        }));
      }
    }
    return isWitchayaUser() ? (CLASS_SCHEDULE[dayKey] || []) : [];
  }

  // ─── Class Schedule (9th Verbatim) ───────────────────────
  function renderSchedule() {
    const container = document.getElementById('view-schedule');
    if (!container) return;

    const days = ['monday','tuesday','wednesday','thursday','friday'];
    const dayLabels = { monday:'จ. (Mon)', tuesday:'อ. (Tue)', wednesday:'พ. (Wed)', thursday:'พฤ. (Thu)', friday:'ศ. (Fri)' };
    const todayKey = getDayKey(new Date().getDay());
    const isWitchaya = isWitchayaUser();

    const allDaysClasses = days.map(d => ({ day: d, classes: getClassesForDay(d) }));
    const hasAnyClasses = allDaysClasses.some(x => x.classes.length > 0);

    if (!hasAnyClasses && !isWitchaya) {
      container.innerHTML = `
        <div class="schedule-header-row">
          <h2>📆 ตารางเรียนประจำสัปดาห์</h2>
        </div>
        <div style="background:var(--bg-2);border-radius:var(--r-l);border:1px dashed var(--sep);padding:40px 20px;text-align:center;margin-top:12px;">
          <div style="font-size:2.5rem;margin-bottom:12px">📆</div>
          <h3 style="font-size:18px;font-weight:700;color:var(--label);margin-bottom:6px">ยังไม่มีตารางเรียนในระบบ</h3>
          <p style="font-size:14px;color:var(--label-3);max-width:480px;margin:0 auto 20px">คุณสามารถเข้าไปที่แท็บ "หลักสูตร (Curriculum)" เพื่อเพิ่มรายวิชาและวันเวลาเรียนของคุณเองได้เลยครับ</p>
          <button class="primary-btn" id="go-to-curriculum-btn" style="margin:0 auto;display:inline-flex;align-items:center;gap:8px">📖 ไปที่หน้าจัดการหลักสูตร</button>
        </div>
      `;
      const btn = document.getElementById('go-to-curriculum-btn');
      if (btn) btn.addEventListener('click', () => {
        const curNav = document.querySelector('[data-view="curriculum"]');
        if (curNav) curNav.click();
      });
      return;
    }

    let classListHtml = '';
    days.forEach(d => {
      const classes = getClassesForDay(d);
      if (!classes.length) return;
      classListHtml += `<h4 style="font-size:13px;font-weight:700;color:var(--label-2);margin-top:20px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">${dayLabels[d]} ${d === todayKey ? '⭐ วันนี้' : ''}</h4>`;
      classListHtml += `<div class="week-class-list">`;
      classes.forEach(cls => {
        const sc = SUBJECT_COLORS[cls.code] || { color:'#64748b', bg:'rgba(100,116,139,0.15)', emoji:'📘', shortName:cls.code };
        classListHtml += `
          <div class="week-class-item">
            <span class="wci-emoji">${sc.emoji}</span>
            <div class="wci-info">
              <div class="wci-name">${cls.name}</div>
              <div class="wci-meta">📍 ${cls.room ? 'ห้อง ' + cls.room : ''} · ⏰ ${cls.start}–${cls.end} · ${cls.type}</div>
            </div>
            <span class="wci-code" style="background:${sc.bg};color:${sc.color}">${cls.code}</span>
          </div>`;
      });
      classListHtml += `</div>`;
    });

    const legendItems = Object.entries(SUBJECT_COLORS).map(([code, sc]) => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${sc.color}"></div>
        <span style="color:${sc.color};font-weight:700">${code}</span>
        <span>${sc.shortName}</span>
      </div>`).join('');

    const originalImageSection = isWitchaya ? `
      <div class="schedule-image-section">
        <img src="egmu-class-schedule-2026-1-program_B-BI.png" alt="ตารางเรียนต้นฉบับ" />
        <div class="schedule-image-caption">📋 ตารางเรียนต้นฉบับ — 1st Year BME · Mahidol University · Semester 1/2026</div>
      </div>` : '';

    container.innerHTML = `
      <div class="schedule-header-row">
        <h2>📆 ตารางเรียน — ภาคเรียนที่ 1/2026 ${isWitchaya ? '(Program B-BI)' : ''}</h2>
      </div>
      <div style="background:var(--bg-2);border-radius:var(--r-l);border:1px solid var(--sep);padding:20px 24px;box-shadow:var(--shadow-1)">
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px">
          ${days.map(d => {
            const classes = getClassesForDay(d);
            const isToday = d === todayKey;
            return `
              <div style="flex:1;min-width:130px;text-align:center;padding:14px 10px;border-radius:var(--r-m);background:var(--bg-3);border:${isToday ? '2px solid var(--accent)' : '1px solid var(--sep)'}">
                <div style="font-size:13px;font-weight:700;margin-bottom:4px;color:${isToday ? 'var(--accent)' : 'var(--label)'}">${dayLabels[d]} ${isToday ? '⭐' : ''}</div>
                <div style="font-size:11px;color:var(--label-3)">${classes.length} วิชา</div>
                <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
                  ${classes.map(cls => {
                    const sc = SUBJECT_COLORS[cls.code] || { color:'#64748b', bg:'rgba(100,116,139,0.15)', emoji:'📘' };
                    return `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${sc.bg};color:${sc.color};font-weight:600">${sc.emoji} ${cls.code}</span>`;
                  }).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>
        ${classListHtml || '<div style="text-align:center;padding:16px;color:var(--label-3);">ไม่มีวิชาเรียนที่ระบุ</div>'}
      </div>
      <div class="subject-legend">${legendItems}</div>
      ${originalImageSection}
    `;
  }

  // ─── Week Overview (9th Verbatim) ────────────────────────
  function renderWeek() {
    const container = document.getElementById('view-week');
    if (!container) return;
    const todayKey = getDayKey(new Date().getDay());
    const isWitchaya = isWitchayaUser();
    const weekStat = calcWeeklyStreak();
    const weekPct = weekStat.total > 0 ? Math.round(weekStat.done / weekStat.total * 100) : 0;

    const dayCards = DAY_ORDER.map(key => {
      const day = ROUTINES[key];
      const ck = getCheckKey(key);
      const checks = state.checklist[ck] || {};
      const customExtra = state.customBlocks[key] || [];
      const overrideIds = new Set(customExtra.filter(b => b._override).map(b => b.id));
      const baseBlocks = isWitchaya ? (day ? day.blocks : []).filter(b => !overrideIds.has(b.id)) : [];
      const allBlocks = [...baseBlocks, ...customExtra];
      const studyBlocks = allBlocks.filter(b => b.isStudyBlock || b.tag === 'study');
      const done = Object.values(checks).filter(Boolean).length;
      const classes = getClassesForDay(key);
      const isToday = key === todayKey;
      const statusEmojiHtml = isWitchaya ? `<div class="wdc-status">${day.statusEmoji}</div>` : '';
      return `
        <div class="week-day-card ${isToday ? 'today' : ''}" data-day="${key}">
          <div class="wdc-day">${day.short} <span style="font-size:10px;color:var(--label-3)">${day.labelEn.substring(0,3)}</span></div>
          ${statusEmojiHtml}
          <div class="wdc-study">
            ${studyBlocks.length > 0 ? `📚 ${done}/${studyBlocks.length}` : '🌴 พัก'}
          </div>
          <div class="wdc-classes">${classes.map(c => {
            const sc = SUBJECT_COLORS[c.code] || {};
            return `<div style="color:${sc.color};font-weight:600;font-size:10px">${sc.emoji || '📘'} ${sc.shortName || c.code}</div>`;
          }).join('')}</div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div style="background:var(--mat-card);backdrop-filter:var(--blur-m);-webkit-backdrop-filter:var(--blur-m);border:1px solid rgba(255,255,255,0.55);border-radius:var(--r-l);padding:20px;margin-bottom:20px;box-shadow:var(--shadow-2)">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div>
            <div style="font-size:12px;color:var(--label-3);font-weight:600;text-transform:uppercase;letter-spacing:.5px">สรุปสัปดาห์นี้</div>
            <div style="font-size:26px;font-weight:800;letter-spacing:-0.5px">${weekStat.done} / ${weekStat.total} <span style="font-size:14px;font-weight:500;color:var(--label-3)">บล็อกสำเร็จ</span></div>
          </div>
          <div style="flex:1;min-width:180px">
            <div style="height:8px;border-radius:4px;background:var(--bg-3);overflow:hidden">
              <div style="height:100%;border-radius:4px;background:var(--accent);width:${weekPct}%;transition:width 0.8s ease"></div>
            </div>
            <div style="font-size:12px;color:var(--label-3);margin-top:4px">${weekPct}% สำเร็จ</div>
          </div>
        </div>
      </div>
      <div class="week-grid">${dayCards}</div>
    `;

    container.querySelectorAll('.week-day-card').forEach(card => {
      card.addEventListener('click', () => {
        const d = card.dataset.day;
        if (d) {
          state.currentDay = d;
          renderDayTabs();
          switchDashboardView('timeline');
        }
      });
    });
  }

  // ─── View 2: Curriculum (Mahidol BME 2026-1) ─────────────
  function getCurriculumCourses() {
    if (state.curriculum && Array.isArray(state.curriculum) && state.curriculum.length > 0) {
      return state.curriculum;
    }
    const saved = localStorage.getItem('sd-curriculum');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.curriculum = parsed;
          return state.curriculum;
        }
      } catch (_) {}
    }
    if (isWitchayaUser()) {
      state.curriculum = JSON.parse(JSON.stringify(DEFAULT_CURRICULUM));
      return state.curriculum;
    }
    return [];
  }

  function saveCurriculum() {
    touchUpdatedAt();
    try {
      localStorage.setItem('sd-curriculum', JSON.stringify(state.curriculum));
    } catch (_) {}
    if (window.CloudSync) CloudSync.pushToCloud(state);
  }

  // ─── GPAX Calculator & Grade Simulator ────────────────────
  const GRADE_OPTIONS = [
    { label: '– ยังไม่ตัดเกรด', value: '' },
    { label: 'A (4.00)', value: 'A', point: 4.0 },
    { label: 'B+ (3.50)', value: 'B+', point: 3.5 },
    { label: 'B (3.00)', value: 'B', point: 3.0 },
    { label: 'C+ (2.50)', value: 'C+', point: 2.5 },
    { label: 'C (2.00)', value: 'C', point: 2.0 },
    { label: 'D+ (1.50)', value: 'D+', point: 1.5 },
    { label: 'D (1.00)', value: 'D', point: 1.0 },
    { label: 'F (0.00)', value: 'F', point: 0.0 },
    { label: 'S (Pass)', value: 'S', point: null },
    { label: 'U (Fail)', value: 'U', point: null }
  ];

  function getGradePoint(g) {
    const opt = GRADE_OPTIONS.find(o => o.value === g);
    return opt ? opt.point : null;
  }

  function calculateCurriculumGPA() {
    const courses = getCurriculumCourses();
    const grades = state.courseGrades || {};
    let totalPoints = 0;
    let totalGradedCredits = 0;
    let totalAttemptedCredits = 0;
    let gradedCount = 0;

    courses.forEach(c => {
      const rawCredit = parseFloat(c.credits) || 3;
      totalAttemptedCredits += rawCredit;
      const g = grades[c.code];
      const pt = getGradePoint(g);
      if (pt !== null && pt !== undefined) {
        totalPoints += pt * rawCredit;
        totalGradedCredits += rawCredit;
        gradedCount++;
      }
    });

    const gpax = totalGradedCredits > 0 ? (totalPoints / totalGradedCredits).toFixed(2) : '0.00';
    return {
      gpax: parseFloat(gpax),
      gpaxStr: gpax,
      totalGradedCredits,
      totalAttemptedCredits,
      gradedCount,
      totalCourses: courses.length
    };
  }

  function renderCurriculumView() {
    const container = document.getElementById('view-egbe-curriculum');
    if (!container) return;

    const curriculumCourses = getCurriculumCourses();
    const isList = state.curriculumViewMode === 'list';
    const gpaInfo = calculateCurriculumGPA();

    let honorsBadgeHtml = '';
    let honorsText = '🎓 ปกติ';
    if (gpaInfo.totalGradedCredits >= 15) {
      if (gpaInfo.gpax >= 3.50) {
        honorsBadgeHtml = '<span class="tag-chip" style="background:rgba(16,185,129,0.15);color:#059669;font-weight:700">🏆 เกียรตินิยมอันดับ 1</span>';
        honorsText = '🏆 เกียรตินิยมอันดับ 1 (≥ 3.50)';
      } else if (gpaInfo.gpax >= 3.25) {
        honorsBadgeHtml = '<span class="tag-chip" style="background:rgba(59,130,246,0.15);color:#2563eb;font-weight:700">🥈 เกียรตินิยมอันดับ 2</span>';
        honorsText = '🥈 เกียรตินิยมอันดับ 2 (≥ 3.25)';
      } else {
        honorsText = '🎓 ผ่านเกณฑ์ปกติ';
      }
    }

    let contentHtml = '';
    if (curriculumCourses.length === 0) {
      contentHtml = `
        <div style="padding:48px 24px;text-align:center;background:var(--bg-2);border-radius:var(--r-l);border:1px dashed var(--sep);margin:1.5rem 0">
          <div style="font-size:42px;margin-bottom:12px">📚</div>
          <h3 style="font-size:16px;font-weight:700;color:var(--label);margin-bottom:6px">ยังไม่มีรายวิชาในหลักสูตร</h3>
          <p style="font-size:13px;color:var(--label-2);max-width:460px;margin:0 auto 16px">
            คุณสามารถเพิ่มวิชาเรียนของคุณเอง หรือกดปุ่มโหลดหลักสูตร BME Mahidol (10 วิชา) ได้ตลอดเวลา
          </p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" id="btn-load-bme-curriculum" style="font-size:12.5px;padding:8px 18px">
              🧬 โหลดหลักสูตร BME Mahidol (10 วิชา)
            </button>
          </div>
        </div>
      `;
    } else if (isList) {
      // List Mode
      contentHtml = `
        <div class="curriculum-list-wrap">
          ${curriculumCourses.map(c => {
            const sc = SUBJECT_COLORS[c.code] || { color: 'var(--accent)', bg: 'var(--accent-bg)', emoji: '📘' };
            const currentGrade = (state.courseGrades && state.courseGrades[c.code]) || '';
            return `
              <div class="curriculum-list-row course-card-clickable" data-code="${c.code}" style="cursor:pointer">
                <div class="clr-badge-col">
                  <span class="tag-chip" style="background:${sc.bg};color:${sc.color}">
                    ${c.code}
                  </span>
                  <div style="font-size:11px;font-weight:600;color:var(--label-3);margin-top:4px">${c.credits}</div>
                </div>
                <div class="clr-main-col">
                  <h3 style="font-size:14.5px;font-weight:700;color:var(--label);margin-bottom:3px">${escHtml(c.name)} <span style="font-size:12px;font-weight:500;color:var(--label-3)">(${c.type})</span></h3>
                  <p style="font-size:12px;color:var(--label-2);line-height:1.45">${escHtml(c.desc)}</p>
                </div>
                <div class="clr-meta-col" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                  <div style="display:flex;align-items:center;gap:6px" onclick="event.stopPropagation()">
                    <span style="font-size:11px;color:var(--label-3);font-weight:600">เกรด:</span>
                    <select class="grade-picker-select" data-code="${c.code}">
                      ${GRADE_OPTIONS.map(opt => `
                        <option value="${opt.value}" ${currentGrade === opt.value ? 'selected' : ''}>${opt.label}</option>
                      `).join('')}
                    </select>
                  </div>
                  <div style="font-size:11.5px;color:var(--label-3)">⏰ ${escHtml(c.schedule || '-')}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      // Grid Mode
      contentHtml = `
        <div class="cards-grid">
          ${curriculumCourses.map(c => {
            const sc = SUBJECT_COLORS[c.code] || { color: 'var(--accent)', bg: 'var(--accent-bg)', emoji: '📘' };
            const currentGrade = (state.courseGrades && state.courseGrades[c.code]) || '';
            return `
              <div class="card-item course-card-clickable" data-code="${c.code}" style="cursor:pointer">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                  <span class="tag-chip" style="background:${sc.bg};color:${sc.color}">
                    ${c.code}
                  </span>
                  <span style="font-size:11.5px;font-weight:600;color:var(--label-3)">${c.credits}</span>
                </div>
                <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;color:var(--label)">${escHtml(c.name)}</h3>
                <p style="font-size:12.5px;color:var(--label-2);line-height:1.5;margin-bottom:12px">${escHtml(c.desc)}</p>
                <div style="font-size:11.5px;color:var(--label-3);border-top:1px solid var(--sep);padding-top:10px;display:flex;flex-direction:column;gap:6px">
                  <div style="display:flex;justify-content:space-between;align-items:center" onclick="event.stopPropagation()">
                    <span style="font-weight:600">เกรดวิชานี้:</span>
                    <select class="grade-picker-select" data-code="${c.code}">
                      ${GRADE_OPTIONS.map(opt => `
                        <option value="${opt.value}" ${currentGrade === opt.value ? 'selected' : ''}>${opt.label}</option>
                      `).join('')}
                    </select>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <span>ห้อง: <strong>${escHtml(c.room || '-')}</strong></span>
                    <span>เวลา: <strong>${escHtml(c.schedule || '-')}</strong></span>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      `;
    }

    const curriculumHeaderTitle = state.isBme !== false ? 'หลักสูตรวิศวกรรมชีวแพทย์ (BME Mahidol 2026)' : 'โครงสร้างหลักสูตรและรายวิชา (Curriculum)';
    const curriculumHeaderDesc = state.isBme !== false ? 'โครงสร้างรายวิชาปีที่ 1 ภาคเรียนที่ 1 รวมทั้งสิ้น 21 หน่วยกิต (คลิกการ์ดเพื่อดูรายละเอียด/แก้ไข)' : 'จัดการรายวิชา หน่วยกิต และจำลองผลการเรียน (คลิกการ์ดเพื่อดูรายละเอียด/แก้ไข)';

    container.innerHTML = `
      <div class="curriculum-header-row" style="margin-bottom:1.25rem">
        <div>
          <h2 style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;margin-bottom:4px">${curriculumHeaderTitle}</h2>
          <p style="font-size:13.5px;color:var(--label-2)">${curriculumHeaderDesc}</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="view-mode-toggle" aria-label="รูปแบบการแสดงผล">
            <button class="view-mode-btn ${!isList ? 'active' : ''}" data-mode="grid" title="แสดงแบบการ์ด">
              <span>⊞</span> การ์ด (Grid)
            </button>
            <button class="view-mode-btn ${isList ? 'active' : ''}" data-mode="list" title="แสดงแบบรายการ">
              <span>☰</span> รายการ (List)
            </button>
          </div>
        </div>
      </div>

      <!-- GPAX Calculator Card -->
      <div class="gpax-banner-card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:2px;display:flex;align-items:center;gap:8px">
              📊 GPAX Calculator &amp; Grade Simulator
              ${honorsBadgeHtml}
            </h3>
            <p style="font-size:12.5px;color:var(--label-2)">เลือกเกรดรายวิชาด้านล่างเพื่อคำนวณและจำลองเกรดล่วงหน้า (บันทึกและซิงค์ Cloud อัตโนมัติ)</p>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-secondary" id="gpa-sim-a" style="font-size:11.5px;padding:4px 10px;border-radius:var(--r-pill)">✨ จำลอง A ล้วน</button>
            <button class="btn btn-secondary" id="gpa-sim-bplus" style="font-size:11.5px;padding:4px 10px;border-radius:var(--r-pill)">📈 จำลอง B+ ล้วน</button>
            <button class="btn btn-secondary" id="gpa-reset" style="font-size:11.5px;padding:4px 10px;border-radius:var(--r-pill);color:var(--label-3)">🔄 ล้างเกรด</button>
          </div>
        </div>
        <div class="gpax-stats-grid">
          <div class="gpax-stat-box">
            <span class="gpax-stat-label">เกรดเฉลี่ยสะสม (GPAX)</span>
            <span class="gpax-stat-val" style="color:var(--accent)">${gpaInfo.gpaxStr}</span>
          </div>
          <div class="gpax-stat-box">
            <span class="gpax-stat-label">หน่วยกิตที่คำนวณ</span>
            <span class="gpax-stat-val">${gpaInfo.totalGradedCredits} <span style="font-size:12px;font-weight:500;color:var(--label-3)">/ ${gpaInfo.totalAttemptedCredits} cr</span></span>
          </div>
          <div class="gpax-stat-box">
            <span class="gpax-stat-label">จำนวนวิชาที่ตัดเกรด</span>
            <span class="gpax-stat-val">${gpaInfo.gradedCount} <span style="font-size:12px;font-weight:500;color:var(--label-3)">/ ${gpaInfo.totalCourses} วิชา</span></span>
          </div>
          <div class="gpax-stat-box">
            <span class="gpax-stat-label">สถานะเกียรตินิยม</span>
            <span style="font-size:12.5px;font-weight:700;color:var(--label);margin-top:4px">${honorsText}</span>
          </div>
        </div>
      </div>

      ${contentHtml}
    `;

    document.getElementById('btn-load-bme-curriculum')?.addEventListener('click', () => {
      state.isBme = true;
      localStorage.setItem('sd-is-bme', 'true');
      state.curriculum = JSON.parse(JSON.stringify(DEFAULT_CURRICULUM));
      saveCurriculum();
      if (!state.studyFolders || state.studyFolders.length === 0) {
        state.studyFolders = [...DEFAULT_STUDY_FOLDERS];
        localStorage.setItem('sd-study-folders', JSON.stringify(state.studyFolders));
      }
      if (!state.studyLinks || state.studyLinks.length === 0) {
        state.studyLinks = [...DEFAULT_STUDY_LINKS];
        saveStudyLinks();
      }
      showToast('🧬 โหลดหลักสูตรและคลัง BME เรียบร้อย!', 'success');
      renderCurriculumView();
    });

    // Attach switch listener
    container.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.mode;
        if (mode && mode !== state.curriculumViewMode) {
          state.curriculumViewMode = mode;
          localStorage.setItem('sd-curriculum-mode', mode);
          renderCurriculumView();
        }
      });
    });

    // Attach grade selector change listeners
    container.querySelectorAll('.grade-picker-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const code = e.target.dataset.code;
        const val = e.target.value;
        if (!state.courseGrades) state.courseGrades = {};
        if (val) {
          state.courseGrades[code] = val;
        } else {
          delete state.courseGrades[code];
        }
        localStorage.setItem('sd-course-grades', JSON.stringify(state.courseGrades));
        touchUpdatedAt();
        if (window.CloudSync) CloudSync.pushToCloud(state);
        renderCurriculumView();
      });
    });

    // Attach Simulation Buttons
    document.getElementById('gpa-sim-a')?.addEventListener('click', () => {
      if (!state.courseGrades) state.courseGrades = {};
      curriculumCourses.forEach(c => { state.courseGrades[c.code] = 'A'; });
      localStorage.setItem('sd-course-grades', JSON.stringify(state.courseGrades));
      touchUpdatedAt();
      if (window.CloudSync) CloudSync.pushToCloud(state);
      renderCurriculumView();
      showToast('✨ จำลองเกรด A ทุกวิชาเรียบร้อย!', 'success');
    });

    document.getElementById('gpa-sim-bplus')?.addEventListener('click', () => {
      if (!state.courseGrades) state.courseGrades = {};
      curriculumCourses.forEach(c => { state.courseGrades[c.code] = 'B+'; });
      localStorage.setItem('sd-course-grades', JSON.stringify(state.courseGrades));
      touchUpdatedAt();
      if (window.CloudSync) CloudSync.pushToCloud(state);
      renderCurriculumView();
      showToast('📈 จำลองเกรด B+ ทุกวิชาเรียบร้อย!', 'success');
    });

    document.getElementById('gpa-reset')?.addEventListener('click', () => {
      state.courseGrades = {};
      localStorage.setItem('sd-course-grades', JSON.stringify(state.courseGrades));
      touchUpdatedAt();
      if (window.CloudSync) CloudSync.pushToCloud(state);
      renderCurriculumView();
      showToast('🔄 ล้างเกรดทั้งหมดเรียบร้อย', 'info');
    });

    // Attach course click listeners
    container.querySelectorAll('.course-card-clickable').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'SELECT' || e.target.closest('select')) return;
        const code = card.dataset.code;
        if (code) openCourseModal(code);
      });
    });
  }

  // ─── Course Inspector & Details Modal ──────────────────────
  let activeEditingCourseCode = null;

  function openCourseModal(courseCode) {
    const modal = document.getElementById('course-modal');
    if (!modal) return;

    const courses = getCurriculumCourses();
    const course = courses.find(c => c.code.toLowerCase() === courseCode.toLowerCase());
    if (!course) return;

    activeEditingCourseCode = course.code;

    const badgeEl = document.getElementById('course-modal-badge');
    const titleEl = document.getElementById('course-modal-title');
    const roomEl = document.getElementById('course-view-room');
    const schedEl = document.getElementById('course-view-schedule');
    const descEl = document.getElementById('course-view-desc');
    const classroomBtn = document.getElementById('course-classroom-btn');
    const driveBtn = document.getElementById('course-drive-btn');
    const relatedDocsEl = document.getElementById('course-related-docs');

    const viewBody = document.getElementById('course-view-body');
    const editBody = document.getElementById('course-edit-body');
    const viewActions = document.getElementById('course-view-actions');
    const editActions = document.getElementById('course-edit-actions');

    const sc = SUBJECT_COLORS[course.code] || { color: 'var(--accent)', bg: 'var(--accent-bg)' };

    if (badgeEl) {
      badgeEl.textContent = course.code;
      badgeEl.style.background = sc.bg;
      badgeEl.style.color = sc.color;
    }
    if (titleEl) titleEl.textContent = course.name;
    if (roomEl) roomEl.textContent = course.room || '-';
    if (schedEl) schedEl.textContent = course.schedule || '-';
    if (descEl) descEl.textContent = course.desc || '-';

    // Classroom & Drive URLs
    const classroomUrl = course.classroomUrl || (state.studyLinks || []).find(l => l.type === 'classroom' && l.title && l.title.includes(course.code))?.url || '';
    const driveUrl = course.driveUrl || (state.studyLinks || []).find(l => l.type === 'drive' && l.title && l.title.includes(course.code))?.url || '';

    if (classroomBtn) {
      if (classroomUrl) {
        classroomBtn.href = classroomUrl;
        classroomBtn.style.display = 'inline-flex';
      } else {
        classroomBtn.style.display = 'none';
      }
    }

    if (driveBtn) {
      if (driveUrl) {
        driveBtn.href = driveUrl;
        driveBtn.style.display = 'inline-flex';
      } else {
        driveBtn.style.display = 'none';
      }
    }

    // Related study files list
    if (relatedDocsEl) {
      const code = course.code.toLowerCase();
      const matched = (state.studyLinks || []).filter(l => (l.title && l.title.toLowerCase().includes(code)) || (l.desc && l.desc.toLowerCase().includes(code)));
      if (matched.length === 0) {
        relatedDocsEl.innerHTML = '<div style="font-size:12px;color:var(--label-3)">ยังไม่มีไฟล์หรือชีทที่ผูกกับวิชานี้</div>';
      } else {
        relatedDocsEl.innerHTML = matched.map(m => `
          <div class="course-related-item" data-id="${m.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-3);border-radius:var(--r-s);border:1px solid var(--sep);cursor:pointer">
            <div style="font-size:12.5px;font-weight:600;color:var(--label);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(m.title)}</div>
            <button class="btn btn-secondary" style="font-size:11px;padding:3px 8px">เปิดดู</button>
          </div>
        `).join('');

        relatedDocsEl.querySelectorAll('.course-related-item').forEach(el => {
          el.addEventListener('click', () => {
            const id = el.dataset.id;
            const item = state.studyLinks.find(l => l.id === id);
            if (item) {
              closeModal('course-modal');
              openResourcePreview(item);
            }
          });
        });
      }
    }

    // Reset view vs edit state
    function setEditMode(isEditing) {
      if (viewBody) viewBody.style.display = isEditing ? 'none' : 'block';
      if (viewActions) viewActions.style.display = isEditing ? 'none' : 'flex';
      if (editBody) editBody.style.display = isEditing ? 'block' : 'none';
      if (editActions) editActions.style.display = isEditing ? 'flex' : 'none';

      if (isEditing) {
        const roomInp = document.getElementById('course-edit-room-inp');
        const schedInp = document.getElementById('course-edit-schedule-inp');
        const crInp = document.getElementById('course-edit-classroom-inp');
        const drInp = document.getElementById('course-edit-drive-inp');
        const descInp = document.getElementById('course-edit-desc-inp');

        if (roomInp) roomInp.value = course.room || '';
        if (schedInp) schedInp.value = course.schedule || '';
        if (crInp) crInp.value = course.classroomUrl || '';
        if (drInp) drInp.value = course.driveUrl || '';
        if (descInp) descInp.value = course.desc || '';
      }
    }

    setEditMode(false);

    document.getElementById('course-edit-toggle-btn').onclick = () => setEditMode(true);
    document.getElementById('course-edit-cancel-btn').onclick = () => setEditMode(false);
    document.getElementById('course-close-btn').onclick = () => closeModal('course-modal');
    document.getElementById('course-modal-close').onclick = () => closeModal('course-modal');

    // Save edited course
    document.getElementById('course-edit-save-btn').onclick = () => {
      const roomInp = document.getElementById('course-edit-room-inp');
      const schedInp = document.getElementById('course-edit-schedule-inp');
      const crInp = document.getElementById('course-edit-classroom-inp');
      const drInp = document.getElementById('course-edit-drive-inp');
      const descInp = document.getElementById('course-edit-desc-inp');

      course.room = roomInp?.value.trim() || course.room;
      const schedStr = schedInp?.value.trim() || course.schedule;
      course.schedule = schedStr;
      course.classroomUrl = crInp?.value.trim() || '';
      course.driveUrl = drInp?.value.trim() || '';
      course.desc = descInp?.value.trim() || course.desc;

      // Parse day & start/end times from schedule string
      const dayThaiMap = {
        'จันทร์': 'monday', 'จ.': 'monday', 'จ ': 'monday', 'mon': 'monday',
        'อังคาร': 'tuesday', 'อ.': 'tuesday', 'อ ': 'tuesday', 'tue': 'tuesday',
        'พุธ': 'wednesday', 'พ.': 'wednesday', 'พ ': 'wednesday', 'wed': 'wednesday',
        'พฤหัส': 'thursday', 'พฤหัสบดี': 'thursday', 'พฤ.': 'thursday', 'พฤ ': 'thursday', 'thu': 'thursday',
        'ศุกร์': 'friday', 'ศ.': 'friday', 'ศ ': 'friday', 'fri': 'friday',
        'เสาร์': 'saturday', 'ส.': 'saturday', 'ส ': 'saturday', 'sat': 'saturday',
        'อาทิตย์': 'sunday', 'อา.': 'sunday', 'อา ': 'sunday', 'sun': 'sunday'
      };
      const timeMatch = schedStr.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
      if (timeMatch) {
        course.start = timeMatch[1].padStart(5, '0');
        course.end = timeMatch[2].padStart(5, '0');
      }
      for (const [thDay, enKey] of Object.entries(dayThaiMap)) {
        if (schedStr.toLowerCase().includes(thDay.toLowerCase())) {
          course.day = enKey;
          break;
        }
      }

      saveCurriculum();
      renderCurriculumView();
      renderTimeline(state.currentDay);
      if (state.currentDashboardView === 'schedule') renderSchedule();
      if (state.currentDashboardView === 'week') renderWeek();
      showToast(`บันทึกข้อมูลวิชา ${course.code} เรียบร้อยแล้ว`, 'success');
      closeModal('course-modal');
    };

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }


  
  // ─── View 3: Study Resources (Folders, Search, Multi-Page PDF.js, Drag & Drop) ─
  let studySearchQuery = '';
  let studyViewMode = localStorage.getItem('sd-study-mode') || 'grid';
  let studyFolderLayout = localStorage.getItem('sd-folder-layout') || 'horizontal'; // 'horizontal' | 'vertical'

  function renderStudyView() {
    const container = document.getElementById('view-egbe-study');
    if (!container) return;

    let currentFolder = localStorage.getItem('sd-study-active-folder') || 'all';
    const folderExists = currentFolder === 'all' || state.studyFolders.some(f => f.id === currentFolder);
    if (!folderExists) { currentFolder = 'all'; localStorage.setItem('sd-study-active-folder', 'all'); }

    const filteredLinks = state.studyLinks.filter(item => {
      const matchFolder = currentFolder === 'all' || item.folderId === currentFolder || (!item.folderId && currentFolder === 'f-notes');
      const q = studySearchQuery.toLowerCase().trim();
      const matchSearch = !q || (item.title && item.title.toLowerCase().includes(q)) || (item.desc && item.desc.toLowerCase().includes(q)) || (item.sub && item.sub.toLowerCase().includes(q));
      return matchFolder && matchSearch;
    });

    const totalCount = state.studyLinks.length;
    const isListMode = studyViewMode === 'list';

    // Build Folder Section HTML based on layout
    let folderSectionHtml = `
        <div class="study-folder-bar-wrapper" style="position:relative;display:flex;align-items:center;margin-bottom:1.25rem">
          <button class="folder-scroll-arrow folder-scroll-left" id="folder-scroll-left" aria-label="เลื่อนซ้าย" title="เลื่อนโฟลเดอร์ไปทางซ้าย">◀</button>
          <div class="study-folder-bar" id="study-folder-bar" style="cursor:grab;overflow-x:auto;-webkit-overflow-scrolling:touch">
            <button class="study-folder-pill ${currentFolder === 'all' ? 'active' : ''}" data-folder="all">
              <span>📁 ทั้งหมด</span>
              <span class="study-folder-count">${totalCount}</span>
            </button>
            ${state.studyFolders.map(f => {
              const fCount = state.studyLinks.filter(l => l.folderId === f.id || (!l.folderId && f.id === 'f-notes')).length;
              const isDefault = DEFAULT_STUDY_FOLDERS.some(df => df.id === f.id);
              return `
                <div class="study-folder-pill ${currentFolder === f.id ? 'active' : ''}" data-folder="${f.id}">
                  <span>${escHtml(f.name)}</span>
                  <span class="study-folder-count">${fCount}</span>
                  ${!isDefault ? `
                    <button class="folder-del-btn" data-folder-id="${f.id}" title="ลบโฟลเดอร์" style="background:none;border:none;cursor:pointer;color:currentColor;opacity:0.6;font-size:11px;padding:0 2px">✕</button>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
          <button class="folder-scroll-arrow folder-scroll-right" id="folder-scroll-right" aria-label="เลื่อนขวา" title="เลื่อนโฟลเดอร์ไปทางขวา">▶</button>
        </div>
      `;

    const studyHeaderDesc = state.isBme !== false
      ? 'คลังเอกสาร ชีทสรุป Google Classroom และคู่มือ BME พร้อมระบบโฟลเดอร์'
      : 'คลังเอกสาร ชีทสรุป และไฟล์ส่วนตัวของคุณ พร้อมระบบโฟลเดอร์';

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem;flex-wrap:wrap;gap:1rem">
        <div>
          <h2 style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;margin-bottom:4px">Study Resources &amp; Documents</h2>
          <p style="font-size:13px;color:var(--label-2)">${studyHeaderDesc}</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <!-- Grid / List toggle -->
          <div class="view-mode-toggle" aria-label="รูปแบบการแสดงผล">
            <button class="view-mode-btn ${!isListMode ? 'active' : ''}" data-study-mode="grid" title="แสดงแบบการ์ด"><span>⊞</span> Grid</button>
            <button class="view-mode-btn ${isListMode ? 'active' : ''}" data-study-mode="list" title="แสดงแบบรายการ"><span>☰</span> List</button>
          </div>
          <button class="btn btn-secondary" id="study-share-btn" style="font-size:12px;padding:6px 13px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;border-radius:var(--r-pill);font-weight:600" title="แชร์คลังชีทเรียนให้เพื่อน">
            <span>🔗</span> แชร์คลัง
          </button>
          <button class="btn btn-secondary" id="create-folder-btn" style="font-size:12px;padding:6px 13px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;border-radius:var(--r-pill);font-weight:600">
            <span>📁</span> + โฟลเดอร์
          </button>
          <button class="btn btn-primary" id="add-resource-btn" style="font-size:12px;padding:6px 15px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;border-radius:var(--r-pill);font-weight:700">
            <span>+</span> เพิ่มเอกสาร
          </button>
        </div>
      </div>

      <!-- Search & Status Bar -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
        <div style="position:relative;flex:1;max-width:360px">
          <input type="text" id="study-search-inp" class="form-input" placeholder="ค้นหาชีทเรียน, รหัสวิชา, หรือ Drive..." value="${escHtml(studySearchQuery)}" style="padding-left:14px;font-size:12.5px;border-radius:var(--r-pill)" />
          ${studySearchQuery ? `<button id="study-clear-search" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--label-3);font-size:12px">✕</button>` : ''}
        </div>
        <div style="font-size:11.5px;color:var(--label-3);font-weight:600">
          ${filteredLinks.length} เอกสาร
        </div>
      </div>

      ${folderSectionHtml}

      <!-- File Cards (Grid or List) -->
      ${filteredLinks.length === 0 ? `
        <div style="padding:3.5rem 1.5rem;text-align:center;color:var(--label-3);background:var(--bg-2);border-radius:var(--r-l);border:1px dashed var(--sep)">
          <div style="font-size:36px;margin-bottom:8px">📂</div>
          <div style="font-weight:700;font-size:15px;color:var(--label)">ยังไม่มีเอกสารในคลัง</div>
          <p style="font-size:12.5px;color:var(--label-2);margin-top:4px;margin-bottom:16px">กดปุ่ม "+ เพิ่มเอกสาร" เพื่ออัปโหลดไฟล์ PDF, รูปภาพ หรือเพิ่มลิงก์เอกสาร</p>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="document.getElementById('add-resource-btn')?.click()" style="font-size:12px;padding:6px 14px">
              <span>+</span> เพิ่มเอกสารแรก
            </button>
            ${state.isBme === false ? `
              <button class="btn btn-secondary" id="btn-load-bme-study" style="font-size:12px;padding:6px 14px">
                🧬 โหลดชีทและโฟลเดอร์ BME
              </button>
            ` : ''}
          </div>
        </div>
      ` : isListMode ? `
        <div class="study-list-view" id="study-cards-grid">
          ${filteredLinks.map(item => {
            let badgeColor = 'var(--accent)'; let badgeBg = 'var(--accent-bg)'; let typeIcon = 'Link';
            if (item.type === 'classroom') { badgeColor = '#2563eb'; badgeBg = 'rgba(59,130,246,0.12)'; typeIcon = 'Classroom'; }
            else if (item.type === 'drive') { badgeColor = '#059669'; badgeBg = 'rgba(16,185,129,0.12)'; typeIcon = 'Drive'; }
            else if (item.type === 'pdf') { badgeColor = '#dc2626'; badgeBg = 'rgba(239,68,68,0.12)'; typeIcon = 'PDF'; }
            else if (item.type === 'image') { badgeColor = '#d97706'; badgeBg = 'rgba(217,119,6,0.12)'; typeIcon = 'Image'; }
            else if (item.type === 'local') { badgeColor = '#7c3aed'; badgeBg = 'rgba(124,58,237,0.12)'; typeIcon = 'Upload'; }
            const isDefault = DEFAULT_STUDY_LINKS.some(d => d.id === item.id);
            const folderName = state.studyFolders.find(f => f.id === item.folderId)?.name || '';
            return `
              <div class="study-list-item study-card" data-id="${item.id}" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:var(--r-m);background:var(--bg-2);border:1px solid var(--sep);cursor:pointer;transition:background 0.15s">
                <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:var(--r-pill);background:${badgeBg};color:${badgeColor}">${typeIcon}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:700;font-size:13.5px;color:var(--label);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(item.title)}</div>
                  <div style="font-size:11.5px;color:var(--label-3);margin-top:2px">${escHtml(folderName ? 'โฟลเดอร์: ' + folderName : (item.sub || item.desc || ''))}</div>
                </div>
                <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
                  <button class="btn btn-secondary btn-move-doc study-action-btn" data-id="${item.id}" title="ย้ายโฟลเดอร์" style="font-size:11px;padding:4px 8px">ย้าย</button>
                  ${!isDefault ? `
                    <button class="btn btn-danger btn-del-doc study-action-btn" data-id="${item.id}" title="ลบเอกสาร" style="font-size:11px;padding:4px 8px">ลบ</button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="cards-grid" id="study-cards-grid">
          ${filteredLinks.map(item => {
            let badgeColor = 'var(--accent)'; let badgeBg = 'var(--accent-bg)'; let typeIcon = 'Link';
            if (item.type === 'classroom') { badgeColor = '#2563eb'; badgeBg = 'rgba(59,130,246,0.12)'; typeIcon = 'Classroom'; }
            else if (item.type === 'drive') { badgeColor = '#059669'; badgeBg = 'rgba(16,185,129,0.12)'; typeIcon = 'Drive'; }
            else if (item.type === 'pdf') { badgeColor = '#dc2626'; badgeBg = 'rgba(239,68,68,0.12)'; typeIcon = 'PDF'; }
            else if (item.type === 'image') { badgeColor = '#d97706'; badgeBg = 'rgba(217,119,6,0.12)'; typeIcon = 'Image'; }
            else if (item.type === 'local') { badgeColor = '#7c3aed'; badgeBg = 'rgba(124,58,237,0.12)'; typeIcon = 'Upload'; }
            const isDefault = DEFAULT_STUDY_LINKS.some(d => d.id === item.id);
            const folderName = state.studyFolders.find(f => f.id === item.folderId)?.name || '';
            return `
              <div class="card-item study-card" data-id="${item.id}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                  <span class="tag-chip" style="color:${badgeColor};background:${badgeBg};font-weight:700">
                    ${typeIcon}
                  </span>
                  <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
                    <button class="btn-move-doc study-action-btn" data-id="${item.id}" title="ย้ายโฟลเดอร์" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--label-3);padding:2px 4px">ย้าย</button>
                    ${!isDefault ? `
                      <button class="btn-del-doc study-action-btn" data-id="${item.id}" title="ลบเอกสาร" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--label-3);padding:2px 4px">✕</button>
                    ` : ''}
                  </div>
                </div>
                <h3 style="font-size:14.5px;font-weight:700;margin-bottom:4px;color:var(--label);line-height:1.35">${escHtml(item.title)}</h3>
                ${item.sub ? `<div style="font-size:12px;color:var(--label-2);margin-bottom:8px">${escHtml(item.sub)}</div>` : ''}
                ${item.desc ? `<p style="font-size:12px;color:var(--label-3);line-height:1.4;margin-bottom:12px">${escHtml(item.desc)}</p>` : ''}
                <div style="margin-top:auto;display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid var(--sep)">
                  <span style="font-size:11px;color:var(--label-3)">${escHtml(folderName || 'General')}</span>
                  <span style="font-size:11.5px;font-weight:600;color:var(--accent)">เปิดเอกสาร ↗</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;

    document.getElementById('btn-load-bme-study')?.addEventListener('click', () => {
      state.isBme = true;
      localStorage.setItem('sd-is-bme', 'true');
      state.studyFolders = [...DEFAULT_STUDY_FOLDERS];
      state.studyLinks = [...DEFAULT_STUDY_LINKS];
      localStorage.setItem('sd-study-folders', JSON.stringify(state.studyFolders));
      saveStudyLinks();
      showToast('🧬 โหลดคลังเอกสาร BME เรียบร้อย!', 'success');
      renderStudyView();
    });

    // Attach Folder Layout Toggle
    
    document.getElementById('toggle-folder-v')?.addEventListener('click', () => {
      studyFolderLayout = 'vertical';
      localStorage.setItem('sd-folder-layout', 'vertical');
      renderStudyView();
    });

    // Share button
    document.getElementById('study-share-btn')?.addEventListener('click', () => openShareModal());

    // Horizontal folder scroll arrows
    const scrollBar = document.getElementById('study-folder-bar');
    document.getElementById('folder-scroll-left')?.addEventListener('click', () => {
      if (scrollBar) scrollBar.scrollBy({ left: -250, behavior: 'smooth' });
    });
    document.getElementById('folder-scroll-right')?.addEventListener('click', () => {
      if (scrollBar) scrollBar.scrollBy({ left: 250, behavior: 'smooth' });
    });

    // Mouse wheel horizontal scroll on folder bar
    if (scrollBar) {
      scrollBar.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // let native horizontal scroll work
        e.preventDefault();
        scrollBar.scrollBy({ left: e.deltaY > 0 ? 120 : -120, behavior: 'smooth' });
      }, { passive: false });
    }

    // Drag-to-scroll on folder bar
    if (scrollBar) {
      let isDown = false, startX = 0, scrollLeft = 0;
      scrollBar.addEventListener('mousedown', (e) => {
        isDown = true; scrollBar.style.cursor = 'grabbing';
        startX = e.pageX - scrollBar.offsetLeft;
        scrollLeft = scrollBar.scrollLeft;
      });
      scrollBar.addEventListener('mouseleave', () => { isDown = false; scrollBar.style.cursor = 'grab'; });
      scrollBar.addEventListener('mouseup', () => { isDown = false; scrollBar.style.cursor = 'grab'; });
      scrollBar.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - scrollBar.offsetLeft;
        const walk = (x - startX) * 1.5;
        scrollBar.scrollLeft = scrollLeft - walk;
      });
    }

    // Grid/List toggle
    container.querySelectorAll('[data-study-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        studyViewMode = btn.dataset.studyMode;
        localStorage.setItem('sd-study-mode', studyViewMode);
        renderStudyView();
      });
    });

    // Folder selection (horizontal pills + vertical cards)
    container.querySelectorAll('.study-folder-pill, .study-folder-card').forEach(pill => {
      pill.addEventListener('click', (e) => {
        if (e.target.closest('.folder-del-btn')) return;
        const fId = pill.dataset.folder;
        if (fId) {
          state.selectedFolderId = fId;
          localStorage.setItem('sd-selected-folder', fId);
          localStorage.setItem('sd-study-active-folder', fId);
          renderStudyView();
        }
      });
    });

    // Delete custom folder
    container.querySelectorAll('.folder-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fId = btn.dataset.folderId;
        if (confirm('คุณต้องการลบโฟลเดอร์นี้หรือไม่? (เอกสารในโฟลเดอร์จะไม่ถูกลบ)')) {
          state.studyFolders = state.studyFolders.filter(f => f.id !== fId);
          state.studyLinks.forEach(l => { if (l.folderId === fId) l.folderId = 'f-notes'; });
          if (state.selectedFolderId === fId) state.selectedFolderId = 'all';
          saveStudyFolders();
          saveStudyLinks();
          renderStudyView();
          showToast('🗑️ ลบโฟลเดอร์เรียบร้อย', 'info');
        }
      });
    });

    // Search input
    const searchInp = document.getElementById('study-search-inp');
    searchInp?.addEventListener('input', (e) => {
      studySearchQuery = e.target.value;
      renderStudyView();
    });
    document.getElementById('study-clear-search')?.addEventListener('click', () => {
      studySearchQuery = '';
      renderStudyView();
    });

    // Create folder button
    document.getElementById('create-folder-btn')?.addEventListener('click', () => {
      openFolderModal();
    });

    // Add resource button
    document.getElementById('add-resource-btn')?.addEventListener('click', () => {
      openAddResourceModal();
    });

    // Card click -> Preview
    container.querySelectorAll('.study-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.study-action-btn') || e.target.closest('.resource-open-link')) return;
        const id = card.dataset.id;
        const item = state.studyLinks.find(l => l.id === id);
        if (item) openResourcePreview(item);
      });
    });

    // Quick move button click (1-tap on iPad)
    container.querySelectorAll('.move-link-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        openMoveFileModal(id);
      });
    });

    // Move document
    container.querySelectorAll('.btn-move-doc').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        openMoveFileModal(id);
      });
    });

    // Delete document
    container.querySelectorAll('.btn-del-doc').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('คุณต้องการลบเอกสารนี้หรือไม่?')) {
          await deleteStudyResource(id);
        }
      });
    });

    // Preview button & direct-open button click
    container.querySelectorAll('.preview-trigger-btn, .direct-open-trigger-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = state.studyLinks.find(l => l.id === id);
        if (item) openResourcePreview(item);
      });
    });

    // Delete link button
    container.querySelectorAll('.delete-link-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        await deleteStudyResource(id);
      });
    });

    // Desktop HTML5 Drag and Drop Handlers
    container.querySelectorAll('.study-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        const id = card.dataset.id;
        e.dataTransfer.setData('text/plain', id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });
    });

    container.querySelectorAll('.study-folder-pill').forEach(pill => {
      pill.addEventListener('dragover', (e) => {
        e.preventDefault();
        pill.classList.add('drag-over');
      });
      pill.addEventListener('dragleave', () => {
        pill.classList.remove('drag-over');
      });
      pill.addEventListener('drop', (e) => {
        e.preventDefault();
        pill.classList.remove('drag-over');
        const linkId = e.dataTransfer.getData('text/plain');
        const targetFolder = pill.dataset.folder;
        if (linkId && targetFolder) {
          moveLinkToFolder(linkId, targetFolder);
        }
      });
    });
  }

  function moveLinkToFolder(linkId, targetFolderId) {
    const link = state.studyLinks.find(l => l.id === linkId);
    if (!link) return;
    if (targetFolderId === 'all') {
      link.folderId = 'f-notes';
    } else {
      link.folderId = targetFolderId;
    }
    saveStudyLinks();
    renderStudyView();
    const folderObj = state.studyFolders.find(f => f.id === targetFolderId);
    showToast(`📂 ย้ายไปยัง "${folderObj ? folderObj.name : 'โฟลเดอร์'}" สำเร็จ!`, 'success');
  }

  function openFolderModal() {
    const modal = document.getElementById('folder-modal');
    if (!modal) return;
    const nameInp = document.getElementById('folder-name-input');
    if (nameInp) nameInp.value = '';

    let selectedIcon = '📁';
    modal.querySelectorAll('.folder-icon-choice').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.icon === '📁') btn.classList.add('active');
      btn.onclick = () => {
        modal.querySelectorAll('.folder-icon-choice').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedIcon = btn.dataset.icon || '📁';
      };
    });

    const saveBtn = document.getElementById('folder-save-btn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        const name = nameInp?.value.trim();
        if (!name) {
          showToast('กรุณากรอกชื่อโฟลเดอร์', 'warning');
          return;
        }
        const newFolder = {
          id: `f-custom-${Date.now()}`,
          name: `${selectedIcon} ${name}`,
          icon: selectedIcon
        };
        state.studyFolders.push(newFolder);
        saveStudyFolders();
        state.selectedFolderId = newFolder.id;
        modal.classList.remove('open');
        document.body.style.overflow = '';
        renderStudyView();
        showToast('สร้างโฟลเดอร์ใหม่สำเร็จ!', 'success');
      };
    }

    const folderCloseBtn = document.getElementById('folder-modal-close');
    if (folderCloseBtn) folderCloseBtn.onclick = () => closeModal('folder-modal');
    const folderCancelBtn = document.getElementById('folder-cancel-btn');
    if (folderCancelBtn) folderCancelBtn.onclick = () => closeModal('folder-modal');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  
  // ─── Calendar & Auth Modal Controllers ──────────────────────
  let currentAuthTab = 'login'; // 'login' or 'register'

  function openCalendarModal() {
    const modal = document.getElementById('calendar-modal');
    if (!modal) return;

    const optStudy = document.getElementById('cal-opt-study');
    const optClass = document.getElementById('cal-opt-class');
    const optRoutines = document.getElementById('cal-opt-routines');
    const urlInput = document.getElementById('cal-feed-url-input');
    const appleBtn = document.getElementById('cal-apple-btn');
    const googleBtn = document.getElementById('cal-google-btn');
    const downloadBtn = document.getElementById('cal-download-ics-btn');

    function refreshCalendarUrls() {
      const includeRoutines = optRoutines ? optRoutines.checked : false;
      const includeStudy = optStudy ? optStudy.checked : true;
      const includeClass = optClass ? optClass.checked : true;
      const { httpsUrl, webcalUrl } = CloudSync.getCalendarFeedUrl(includeRoutines, includeStudy, includeClass);

      if (urlInput) urlInput.value = webcalUrl;
      if (appleBtn) appleBtn.href = webcalUrl;
      if (googleBtn) {
        googleBtn.href = 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcalUrl);
      }
      if (downloadBtn) {
        downloadBtn.href = httpsUrl;
      }
    }

    if (optRoutines) optRoutines.onchange = refreshCalendarUrls;
    if (optStudy) optStudy.onchange = refreshCalendarUrls;
    if (optClass) optClass.onchange = refreshCalendarUrls;
    refreshCalendarUrls();

    document.getElementById('cal-copy-url-btn').onclick = () => {
      if (urlInput) {
        navigator.clipboard.writeText(urlInput.value).then(() => {
          showToast('คัดลอก Calendar Feed URL แล้ว!', 'success');
        });
      }
    };

    document.getElementById('calendar-modal-close').onclick = () => closeModal('calendar-modal');
    document.getElementById('cal-done-btn').onclick = () => closeModal('calendar-modal');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function openAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    const user = CloudSync.getCurrentUser();
    const formContainer = document.getElementById('auth-form-container');
    const profileContainer = document.getElementById('auth-profile-container');
    const formActions = document.getElementById('auth-form-actions');
    const tabLogin = document.getElementById('auth-tab-login');
    const tabRegister = document.getElementById('auth-tab-register');
    const nameGroup = document.getElementById('auth-name-group');
    const bmeGroup = document.getElementById('auth-bme-group');
    const isBmeCheckbox = document.getElementById('auth-is-bme-checkbox');
    const submitBtn = document.getElementById('auth-submit-btn');

    const usernameInp = document.getElementById('auth-username-input');
    const passwordInp = document.getElementById('auth-password-input');
    const nameInp = document.getElementById('auth-name-input');

    if (user) {
      // Show Profile view
      if (formContainer) formContainer.style.display = 'none';
      if (formActions) formActions.style.display = 'none';
      if (profileContainer) profileContainer.style.display = 'block';

      const displayNameEl = document.getElementById('auth-display-name');
      const usernameTagEl = document.getElementById('auth-username-tag');
      const roleBadgeEl = document.getElementById('auth-role-badge');
      const avatarIconEl = document.getElementById('auth-avatar-icon');

      if (displayNameEl) displayNameEl.textContent = user.displayName || user.username;
      if (usernameTagEl) usernameTagEl.textContent = '@' + user.username;
      if (roleBadgeEl) {
        roleBadgeEl.textContent = user.role === 'admin' ? '👑 MASTER ADMIN' : (user.isBme !== false ? '🧬 BME STUDENT' : '👤 STUDENT');
        roleBadgeEl.style.background = user.role === 'admin' ? 'var(--accent-bg)' : 'rgba(59,130,246,0.12)';
        roleBadgeEl.style.color = user.role === 'admin' ? 'var(--accent)' : '#2563eb';
      }
      if (avatarIconEl) avatarIconEl.textContent = user.role === 'admin' ? '👑' : '🎓';

      document.getElementById('auth-open-calendar-btn').onclick = () => {
        closeModal('auth-modal');
        openCalendarModal();
      };

      document.getElementById('auth-logout-btn').onclick = async () => {
        if (confirm('คุณต้องการออกจากระบบหรือไม่?')) {
          await CloudSync.logout();
          closeModal('auth-modal');
          showToast('🚪 ออกจากระบบเรียบร้อย', 'info');
          setTimeout(() => window.location.reload(), 500);
        }
      };
    } else {
      // Show Login/Register Form
      if (profileContainer) profileContainer.style.display = 'none';
      if (formContainer) formContainer.style.display = 'block';
      if (formActions) formActions.style.display = 'flex';

      function setAuthTab(tab) {
        currentAuthTab = tab;
        if (tab === 'login') {
          if (tabLogin) { tabLogin.style.background = 'var(--accent-bg)'; tabLogin.style.color = 'var(--accent)'; tabLogin.style.fontWeight = '700'; }
          if (tabRegister) { tabRegister.style.background = 'transparent'; tabRegister.style.color = 'var(--label-2)'; tabRegister.style.fontWeight = '600'; }
          if (nameGroup) nameGroup.style.display = 'none';
          if (bmeGroup) bmeGroup.style.display = 'none';
          if (submitBtn) submitBtn.textContent = 'เข้าสู่ระบบ';
        } else {
          if (tabRegister) { tabRegister.style.background = 'var(--accent-bg)'; tabRegister.style.color = 'var(--accent)'; tabRegister.style.fontWeight = '700'; }
          if (tabLogin) { tabLogin.style.background = 'transparent'; tabLogin.style.color = 'var(--label-2)'; tabLogin.style.fontWeight = '600'; }
          if (nameGroup) nameGroup.style.display = 'block';
          if (bmeGroup) bmeGroup.style.display = 'block';
          if (submitBtn) submitBtn.textContent = 'สร้างบัญชี & เริ่มใช้งาน';
        }
      }

      if (tabLogin) tabLogin.onclick = () => setAuthTab('login');
      if (tabRegister) tabRegister.onclick = () => setAuthTab('register');
      setAuthTab('login');

      if (submitBtn) {
        submitBtn.onclick = async () => {
          const username = usernameInp?.value.trim();
          const password = passwordInp?.value;
          const displayName = nameInp?.value.trim();

          if (!username || !password) {
            showToast('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'warning');
            return;
          }

          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ กำลังประมวลผล...';

          if (currentAuthTab === 'login') {
            const res = await CloudSync.login(username, password);
            if (res.ok) {
              closeModal('auth-modal');
              showToast(`✅ ยินดีต้อนรับ ${res.user.displayName}!`, 'success');
              
              // Pull user data
              const pull = await CloudSync.pullFromCloud();
              if (pull.ok && pull.data) {
                applyCloudData(pull.data);
                reRenderCurrentView();
                if (state.currentTopView === 'study') renderStudyView();
                if (state.currentTopView === 'dashboard') renderDashboardCurrentView();
                if (state.currentTopView === 'curriculum') renderCurriculumView();
                if (state.currentTopView === 'graph') renderGraphView();
              }

              // Start background auto sync
              CloudSync.startAutoSync(cloudData => {
                if (cloudData) {
                  syncSmartWithCloud(cloudData);
                }
              });
            } else {
              showToast(`⚠️ ${res.error}`, 'warning');
            }
          } else {
            const isBme = isBmeCheckbox ? isBmeCheckbox.checked : true;
            const res = await CloudSync.register(username, password, displayName, isBme);
            if (res.ok) {
              closeModal('auth-modal');
              state.isBme = isBme;
              localStorage.setItem('sd-is-bme', isBme ? 'true' : 'false');
              showToast(`🎉 สมัครสมาชิกสำเร็จ ยินดีต้อนรับ ${res.user.displayName}!`, 'success');
              
              // Pull initial template
              const pull = await CloudSync.pullFromCloud();
              if (pull.ok && pull.data) {
                applyCloudData(pull.data);
                reRenderCurrentView();
                if (state.currentTopView === 'study') renderStudyView();
                if (state.currentTopView === 'dashboard') renderDashboardCurrentView();
                if (state.currentTopView === 'curriculum') renderCurriculumView();
                if (state.currentTopView === 'graph') renderGraphView();
              }

              // Start background auto sync
              CloudSync.startAutoSync(cloudData => {
                if (cloudData) {
                  syncSmartWithCloud(cloudData);
                }
              });
            } else {
              showToast(`⚠️ ${res.error}`, 'warning');
            }
          }

          submitBtn.disabled = false;
          submitBtn.textContent = currentAuthTab === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี & เริ่มใช้งาน';
        };
      }
    }

    document.getElementById('auth-modal-close').onclick = () => closeModal('auth-modal');
    document.getElementById('auth-cancel-btn').onclick = () => closeModal('auth-modal');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }


  
  // ─── Share Bundles Modal (select files/folders → generate token link) ──
  let _shareSelected = new Set(); // ids of selected resources + folders

  function openShareModal() {
    const modal = document.getElementById('share-modal');
    if (!modal) return;

    const listEl = document.getElementById('share-select-list');
    const countEl = document.getElementById('share-selected-count');
    const linkBox = document.getElementById('share-link-box');
    const urlInput = document.getElementById('share-url-input');
    const generateBtn = document.getElementById('share-generate-btn');
    const copyBtn = document.getElementById('share-copy-btn');

    _shareSelected = new Set();

    function renderList() {
      if (!listEl) return;
      const folders = state.studyFolders || [];
      const links = state.studyLinks || [];

      const folderIds = new Set(links.map(l => l.folderId).filter(Boolean));

      let html = '';

      // Folders section
      html += `<div style="font-size:11px;font-weight:700;color:var(--label-3);letter-spacing:.5px;margin:4px 2px 6px">โฟลเดอร์</div>`;
      folders.forEach(f => {
        const count = links.filter(l => l.folderId === f.id || (!l.folderId && f.id === 'f-notes')).length;
        const checked = _shareSelected.has('folder:' + f.id);
        html += `
          <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r-s);cursor:pointer;background:${checked ? 'var(--accent-bg)' : 'transparent'};border:1px solid ${checked ? 'var(--accent)' : 'transparent'}">
            <input type="checkbox" data-share-folder="${f.id}" ${checked ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;flex-shrink:0" />
            <span style="font-size:12.5px;font-weight:600;color:var(--label)">${escHtml(f.name)}</span>
            <span style="margin-left:auto;font-size:11px;color:var(--label-3)">${count} ไฟล์</span>
          </label>`;
      });

      // Files section
      html += `<div style="font-size:11px;font-weight:700;color:var(--label-3);letter-spacing:.5px;margin:12px 2px 6px">ไฟล์</div>`;
      if (links.length === 0) {
        html += `<div style="font-size:12px;color:var(--label-3);padding:6px 2px">ยังไม่มีเอกสารในคลัง</div>`;
      }
      links.forEach(l => {
        const checked = _shareSelected.has('res:' + l.id);
        const typeIcon = { classroom: '🎓', drive: '📁', pdf: '📄', image: '🖼️', local: '💾', link: '🔗' }[l.type] || '🔗';
        html += `
          <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r-s);cursor:pointer;background:${checked ? 'var(--accent-bg)' : 'transparent'};border:1px solid ${checked ? 'var(--accent)' : 'transparent'}">
            <input type="checkbox" data-share-res="${l.id}" ${checked ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;flex-shrink:0" />
            <span style="font-size:12.5px;color:var(--label)">${typeIcon} ${escHtml(l.title)}</span>
          </label>`;
      });

      listEl.innerHTML = html;

      // Wire checkbox handlers
      listEl.querySelectorAll('input[data-share-folder]').forEach(cb => {
        cb.addEventListener('change', () => {
          const key = 'folder:' + cb.dataset.shareFolder;
          if (cb.checked) _shareSelected.add(key); else _shareSelected.delete(key);
          updateCount();
        });
      });
      listEl.querySelectorAll('input[data-share-res]').forEach(cb => {
        cb.addEventListener('change', () => {
          const key = 'res:' + cb.dataset.shareRes;
          if (cb.checked) _shareSelected.add(key); else _shareSelected.delete(key);
          updateCount();
        });
      });
    }

    function updateCount() {
      const selectedFolders = [..._shareSelected].filter(k => k.startsWith('folder:')).length;
      const selectedRes = [..._shareSelected].filter(k => k.startsWith('res:')).length;
      if (countEl) {
        countEl.textContent = `เลือก ${selectedFolders} โฟลเดอร์ และ ${selectedRes} ไฟล์`;
      }
    }

    function resetLinkBox() {
      if (linkBox) linkBox.style.display = 'none';
      if (urlInput) urlInput.value = '';
    }

    renderList();
    updateCount();
    resetLinkBox();

    // Generate link
    if (generateBtn) {
      generateBtn.onclick = async () => {
        if (_shareSelected.size === 0) {
          showToast('กรุณาเลือกไฟล์หรือโฟลเดอร์อย่างน้อย 1 รายการ', 'warning');
          return;
        }

        const resourceIds = [];
        const folderIds = [];
        _shareSelected.forEach(key => {
          if (key.startsWith('res:')) resourceIds.push(key.slice(4));
          else if (key.startsWith('folder:')) folderIds.push(key.slice(7));
        });

        generateBtn.disabled = true;
        generateBtn.textContent = '⏳ กำลังสร้างลิงก์...';

        // FORCE PUSH to ensure server has the latest files before sharing
          if (window.CloudSync) {
            try { await CloudSync.pushToCloud(state); } catch(e) {}
          }
          const res = await CloudSync.createShareBundle(resourceIds, folderIds);
        if (res && res.ok && res.token) {
          // Always use the current origin so the link points to the server that holds the token
          const shareUrl = `${window.location.origin}/?share=${res.token}`;
          if (urlInput) urlInput.value = shareUrl;
          if (linkBox) linkBox.style.display = 'block';
          showToast('สร้างลิงก์แชร์เรียบร้อย!', 'success');
        } else {
          showToast(res && res.error ? res.error : 'สร้างลิงก์ไม่สำเร็จ', 'warning');
        }

        generateBtn.disabled = false;
        generateBtn.textContent = '✨ สร้างลิงก์แชร์';
      };
    }

    // Copy link
    if (copyBtn) {
      copyBtn.onclick = () => {
        if (urlInput && urlInput.value) {
          navigator.clipboard.writeText(urlInput.value).then(() => {
            showToast('คัดลอกลิงก์แชร์เรียบร้อยแล้ว', 'success');
          });
        }
      };
    }

    document.getElementById('share-modal-close').onclick = () => closeModal('share-modal');
    document.getElementById('share-close-btn').onclick = () => closeModal('share-modal');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  async function openPushModal() {
    const modal = document.getElementById('push-modal');
    if (!modal) return;

    modal.classList.add('open');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const accountEl = document.getElementById('push-current-account');
    const switchAccBtn = document.getElementById('push-switch-acc-btn');
    const statusHeading = document.getElementById('push-status-heading');
    const statusDesc = document.getElementById('push-status-desc');
    const statusIcon = document.getElementById('push-status-icon');
    const enableBtn = document.getElementById('push-enable-device-btn');
    const broadcastBtn = document.getElementById('push-broadcast-test-btn');
    const resultEl = document.getElementById('push-broadcast-result');

    if (resultEl) resultEl.textContent = '';

    // Show current user account badge
    const currentUser = window.CloudSync ? CloudSync.getCurrentUser() : null;
    if (accountEl) {
      if (currentUser) {
        accountEl.textContent = `@${currentUser.username} (${currentUser.displayName || currentUser.username})`;
        accountEl.style.color = 'var(--accent)';
      } else {
        accountEl.textContent = 'โหมดทั่วไป (Default Account)';
        accountEl.style.color = 'var(--label)';
      }
    }

    if (switchAccBtn) {
      switchAccBtn.onclick = () => {
        closeHandler();
        openAuthModal();
      };
    }

    // Automatically sync current device push token to backend under current account
    if (window.PushClient) {
      await PushClient.syncCurrentSubscription();
    }

    const pushStatus = window.PushClient ? PushClient.getStatus() : { supported: false, subscribed: false };

    // Fetch total device count from backend
    let deviceCount = 1;
    try {
      const authToken = localStorage.getItem('sd-auth-token') || '';
      const syncKey = (window.CloudSync && CloudSync.getSyncKey()) || '1';
      const res = await fetch('/api/push/status', {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          'X-Sync-Key': syncKey
        }
      });
      const data = await res.json();
      if (data && typeof data.deviceCount === 'number') {
        deviceCount = data.deviceCount;
      }
    } catch (_) {}

    if (pushStatus.subscribed) {
      if (statusIcon) statusIcon.textContent = '🟢';
      if (statusHeading) statusHeading.textContent = 'เปิดการแจ้งเตือนบนเครื่องนี้แล้ว';
      if (statusDesc) statusDesc.textContent = `📱 มี ${deviceCount} อุปกรณ์ที่ผูกกับบัญชีนี้ (จะเด้งพร้อมกันทุกเครื่อง)`;
      if (enableBtn) {
        enableBtn.style.display = 'inline-block';
        enableBtn.textContent = '🔄 ต่ออายุ Token';
      }
    } else {
      if (statusIcon) statusIcon.textContent = '⚪';
      if (statusHeading) statusHeading.textContent = 'ยังไม่ได้เปิดบนเครื่องนี้';
      if (statusDesc) statusDesc.textContent = 'คลิกปุ่มเพื่อเปิดรับการแจ้งเตือนเตือนคาบเรียนล่วงหน้า 15 นาที';
      if (enableBtn) {
        enableBtn.style.display = 'inline-block';
        enableBtn.textContent = 'เปิดบนเครื่องนี้';
      }
    }

    if (enableBtn) {
      enableBtn.onclick = async () => {
        enableBtn.disabled = true;
        enableBtn.textContent = 'กำลังเชื่อมต่อ...';
        const subRes = await PushClient.subscribe();
        if (subRes.ok) {
          showToast('🔔 อัปเดตและต่ออายุ Token เครื่องนี้สำเร็จ!', 'success');
          await openPushModal();
        } else if (subRes.isIOSPrompt) {
          alert('📱 คำแนะนำสำหรับ iPhone / iPad:\n\n1. กดปุ่มแชร์ (Share) ที่แถบด้านล่างของ Safari\n2. เลือก "เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)\n3. เปิดแอป E-Calendar จากหน้าจอโฮม แล้วกดปุ่ม 🔔 อีกครั้งเพื่อเปิดการแจ้งเตือนครับ');
          enableBtn.disabled = false;
          enableBtn.textContent = pushStatus.subscribed ? '🔄 ต่ออายุ Token' : 'เปิดบนเครื่องนี้';
        } else {
          showToast(`❌ ${subRes.error}`, 'error');
          enableBtn.disabled = false;
          enableBtn.textContent = pushStatus.subscribed ? '🔄 ต่ออายุ Token' : 'เปิดบนเครื่องนี้';
        }
      };
    }

    // Broadcast test button
    if (broadcastBtn) {
      broadcastBtn.onclick = async () => {
        broadcastBtn.disabled = true;
        broadcastBtn.textContent = '⚡ กำลังยิงการแจ้งเตือนไปยังทุกเครื่อง...';
        if (resultEl) resultEl.innerHTML = '📡 กำลังส่งข้อมูลไปยังเซิร์ฟเวอร์...';

        const testRes = await PushClient.testNotification();
        if (testRes.ok && (testRes.sent > 0 || !testRes.error)) {
          showToast(`🚀 ยิงแจ้งเตือนถึง ${testRes.sent || 1} อุปกรณ์สำเร็จ!`, 'success');
          if (resultEl) resultEl.innerHTML = `✅ ส่งแจ้งเตือนถึง ${testRes.sent || 1}/${testRes.totalDevices || 1} อุปกรณ์พร้อมกันเรียบร้อยแล้ว! 🎉`;
        } else {
          showToast(`⚠️ ${testRes.error || 'ส่งแจ้งเตือนไม่สำเร็จ'}`, 'warning');
          if (resultEl) {
            resultEl.innerHTML = `
              <div style="color:#ef4444;font-size:11.5px;margin-bottom:6px">❌ ${testRes.error || 'เกิดข้อผิดพลาดในการส่ง'}</div>
              <button id="push-auto-renew-btn" class="btn btn-secondary" style="font-size:11px;padding:5px 12px;background:var(--bg-1);cursor:pointer">
                🔧 ซ่อมแซม & ต่ออายุ Token เดี๋ยวนี้
              </button>
            `;
            document.getElementById('push-auto-renew-btn')?.addEventListener('click', async () => {
              if (enableBtn) enableBtn.click();
            });
          }
        }

        broadcastBtn.disabled = false;
        broadcastBtn.textContent = '⚡ ยิงแจ้งเตือนทดสอบทุกเครื่องเดี๋ยวนี้';
      };
    }

    // ─── LINE Bot UI Logic ───
    const lineBadge = document.getElementById('line-status-badge');
    const lineDesc = document.getElementById('line-status-desc');
    const lineCmd = document.getElementById('line-link-command');
    const lineCopyBtn = document.getElementById('line-copy-cmd-btn');
    const lineTestBtn = document.getElementById('line-test-btn');
    const lineTestResult = document.getElementById('line-test-result');

    const usernameForLink = currentUser ? currentUser.username : (window.CloudSync ? CloudSync.getSyncKey() : '1');
    const linkCommandText = `/link ${usernameForLink}`;
    if (lineCmd) lineCmd.textContent = linkCommandText;

    if (lineCopyBtn) {
      lineCopyBtn.onclick = () => {
        navigator.clipboard.writeText(linkCommandText).then(() => {
          showToast(`📋 คัดลอกคำสั่ง "${linkCommandText}" แล้ว! ส่งในแชท LINE ได้เลย`, 'success');
        }).catch(() => {
          showToast(`คัดลอก: ${linkCommandText}`, 'info');
        });
      };
    }

    try {
      const authToken = localStorage.getItem('sd-auth-token') || '';
      const syncKey = (window.CloudSync && CloudSync.getSyncKey()) || '1';
      const lineRes = await fetch('/api/line/status', {
        headers: {
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
          'X-Sync-Key': syncKey
        }
      });
      const lineData = await lineRes.json();

      if (!lineData.configured) {
        if (lineBadge) {
          lineBadge.textContent = '⚠️ ยังไม่ตั้งค่า Token';
          lineBadge.style.background = 'rgba(239,68,68,0.15)';
          lineBadge.style.color = '#ef4444';
        }
        if (lineDesc) {
          lineDesc.textContent = 'กรุณาใส่ LINE_CHANNEL_ACCESS_TOKEN และ LINE_CHANNEL_SECRET ใน Railway Variables เพื่อเปิดใช้งาน';
        }
      } else if (lineData.linked) {
        if (lineBadge) {
          lineBadge.textContent = '🟢 ผูกบัญชีแล้ว';
          lineBadge.style.background = 'rgba(6,199,85,0.15)';
          lineBadge.style.color = '#06c755';
        }
        if (lineDesc) {
          lineDesc.textContent = '✅ ผูกกับ LINE เรียบร้อย! ระบบจะส่งการแจ้งเตือนคาบเรียนล่วงหน้า 15 นาทีเข้า LINE ของคุณโดยอัตโนมัติ';
        }
      } else {
        if (lineBadge) {
          lineBadge.textContent = '⚪ ยังไม่ผูกบัญชี';
          lineBadge.style.background = 'rgba(156,163,175,0.2)';
          lineBadge.style.color = 'var(--label-2)';
        }
        if (lineDesc) {
          lineDesc.textContent = 'พิมพ์คำสั่งด้านล่างนี้ในแชท LINE Official Account ของคุณเพื่อเชื่อมต่อบัญชีเข้ากับระบบ:';
        }
      }
    } catch (_) {}

    if (lineTestBtn) {
      lineTestBtn.onclick = async () => {
        lineTestBtn.disabled = true;
        lineTestBtn.textContent = '📡 กำลังส่ง...';
        if (lineTestResult) lineTestResult.textContent = 'กำลังยิงเข้า LINE...';

        try {
          const authToken = localStorage.getItem('sd-auth-token') || '';
          const syncKey = (window.CloudSync && CloudSync.getSyncKey()) || '1';
          const res = await fetch('/api/line/test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
              'X-Sync-Key': syncKey
            },
            body: JSON.stringify({ syncKey })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast('📲 ยิงแจ้งเตือนเข้า LINE สำเร็จ!', 'success');
            if (lineTestResult) lineTestResult.innerHTML = '✅ ส่งการ์ดแจ้งเตือนเข้า LINE เรียบร้อยแล้ว! 🎉';
          } else {
            showToast(`❌ ${data.error || 'ส่งเข้า LINE ไม่สำเร็จ'}`, 'error');
            if (lineTestResult) lineTestResult.innerHTML = `<span style="color:#ef4444">❌ ${data.error || 'ส่งไม่สำเร็จ'}</span>`;
          }
        } catch (e) {
          if (lineTestResult) lineTestResult.innerHTML = '<span style="color:#ef4444">❌ เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</span>';
        }

        lineTestBtn.disabled = false;
        lineTestBtn.textContent = '📲 ทดสอบยิงเข้า LINE';
      };
    }

    function closeHandler() {
      modal.classList.remove('open');
      modal.style.display = '';
      document.body.style.overflow = '';
    }

    document.getElementById('push-modal-close').onclick = closeHandler;
    document.getElementById('push-modal-cancel-btn').onclick = closeHandler;
    modal.onclick = (e) => {
      if (e.target === modal) closeHandler();
    };
  }

  // Check URL params on startup for shared bundle token
  async function checkPublicShareRoute() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareParam = urlParams.get('share');
    if (!shareParam) return false;

    // 1. ISOLATE PERSONAL DATA: Clear memory so personal data does not leak into the preview
    state.checklist = {};
    state.subjects = {};
    state.customBlocks = {};
    state.curriculum = [];
    state.studyFolders = [];
    state.studyLinks = [];

    // 2. HIDE PRIVATE TABS & ACTIONS
    document.querySelectorAll('.nav-link[data-view="home"], .nav-link[data-view="dashboard"], .nav-link[data-view="graph"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.mob-btn[data-view="home"], .mob-btn[data-view="dashboard"], .mob-btn[data-view="graph"]').forEach(el => el.style.display = 'none');
    
    const calBtn = document.getElementById('calendar-sync-btn');
    const cloudBtn = document.getElementById('cloud-sync-btn');
    const authBtn = document.getElementById('auth-user-btn');
    if(calBtn) calBtn.style.setProperty('display', 'none', 'important');
    if(cloudBtn) cloudBtn.style.setProperty('display', 'none', 'important');
    if(authBtn) authBtn.style.setProperty('display', 'none', 'important');

    // Token-based share bundle (sh_xxxxxxxxxxxxxxxx)
    if (/^sh_[a-f0-9]{18}$/i.test(shareParam)) {
      try {
        const bundle = await CloudSync.fetchShareBundle(shareParam);
        
        // Also fetch public curriculum so the Curriculum tab isn't blank
        try {
          const hub = await CloudSync.getPublicHub();
          if (hub && hub.curriculum && hub.curriculum.length > 0) {
            state.curriculum = hub.curriculum;
          }
        } catch (_) {}

        if (bundle && bundle.resources) {
          const safeLinks = bundle.resources.map(r => ({
            id: r.id,
            title: r.title,
            sub: r.sub || '',
            type: r.type || 'link',
            url: r.url || '',
            desc: r.desc || '',
            folderId: 'f-shared'
          }));
          state.studyFolders = [{ id: 'f-shared', name: `🔗 ${bundle.label || 'เอกสารที่แชร์'}` }];
          state.studyLinks = safeLinks;
          state.selectedFolderId = 'f-shared';
          setTimeout(() => {
            switchTopView('study');
            showToast(`โหมดเปิดอ่าน: ${bundle.label || 'เอกสารที่แชร์'}`, 'info');
          }, 100);
          return true;
        } else {
          showToast('ลิงก์แชร์นี้ไม่มีข้อมูลหรือหมดอายุแล้ว', 'warning');
        }
      } catch (_) {
        showToast('ไม่สามารถโหลดลิงก์แชร์ได้', 'warning');
      }
      setTimeout(() => switchTopView('study'), 100);
      return true;
    }

    // Legacy public hub (curriculum, study, hub)
    if (shareParam === 'curriculum' || shareParam === 'study' || shareParam === 'hub') {
      try {
        const hub = await CloudSync.getPublicHub();
        if (hub) {
          if (hub.curriculum && hub.curriculum.length > 0) {
            state.curriculum = hub.curriculum;
          }
          if (hub.studyFolders && hub.studyFolders.length > 0) {
            state.studyFolders = hub.studyFolders;
          }
          if (hub.studyLinks && hub.studyLinks.length > 0) {
            state.studyLinks = hub.studyLinks;
          }
        }
      } catch (_) {}
      const targetView = shareParam === 'hub' ? 'study' : shareParam;
      setTimeout(() => {
        switchTopView(targetView);
        showToast(`โหมดเปิดอ่านสาธารณะ: ${shareParam === 'curriculum' ? 'หน้ารายวิชา' : 'คลังเอกสาร'}`, 'info');
      }, 100);
      return true;
    }

    // Invalid/unknown share param
    showToast('ลิงก์แชร์ไม่ถูกต้อง', 'warning');
    setTimeout(() => switchTopView('study'), 100);
    return true;
  }


  function openMoveFileModal(linkId) {
    const link = state.studyLinks.find(l => l.id === linkId);
    if (!link) return;
    const modal = document.getElementById('move-file-modal');
    if (!modal) return;

    const fileNameEl = document.getElementById('move-file-name');
    if (fileNameEl) fileNameEl.textContent = `📄 ${link.title}`;

    const optsContainer = document.getElementById('move-folder-options');
    if (optsContainer) {
      optsContainer.innerHTML = state.studyFolders.map(f => {
        const isCurrent = link.folderId === f.id;
        return `
          <button class="btn btn-secondary move-dest-btn" data-folder-id="${f.id}" style="justify-content:space-between;text-align:left;padding:10px 14px;border-radius:var(--r-m);${isCurrent ? 'border-color:var(--accent);background:var(--accent-bg);' : ''}">
            <span style="font-weight:600">${escHtml(f.name)}</span>
            ${isCurrent ? '<span style="font-size:11px;color:var(--accent);font-weight:700">✓ อยู่ที่นี่</span>' : ''}
          </button>
        `;
      }).join('');

      optsContainer.querySelectorAll('.move-dest-btn').forEach(btn => {
        btn.onclick = () => {
          const fId = btn.dataset.folderId;
          if (fId) {
            moveLinkToFolder(linkId, fId);
            closeModal('move-file-modal');
          }
        };
      });
    }

    const moveCloseBtn = document.getElementById('move-modal-close');
    if (moveCloseBtn) moveCloseBtn.onclick = () => closeModal('move-file-modal');
    const moveCancelBtn = document.getElementById('move-cancel-btn');
    if (moveCancelBtn) moveCancelBtn.onclick = () => closeModal('move-file-modal');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

    let currentUploadMode = 'file'; // 'file' or 'link'
  let currentUploadedFileData = null;
  let currentUploadedFileType = 'pdf';
  let currentUploadedFileName = '';

  function openAddResourceModal() {
    const modal = document.getElementById('resource-modal');
    if (!modal) return;

    const titleInp = document.getElementById('res-title');
    const folderSel = document.getElementById('res-folder');
    const urlInp = document.getElementById('res-url');
    const descInp = document.getElementById('res-desc');
    const typeSel = document.getElementById('res-type');
    const fileInp = document.getElementById('res-file-input');
    const pickBtn = document.getElementById('res-pick-file-btn');
    const chosenBox = document.getElementById('res-file-chosen-box');
    const chosenText = document.getElementById('res-file-chosen');
    const removeBtn = document.getElementById('res-file-remove-btn');
    const tabFile = document.getElementById('res-tab-file');
    const tabLink = document.getElementById('res-tab-link');
    const filePanel = document.getElementById('res-file-panel');
    const linkPanel = document.getElementById('res-link-panel');
    const saveBtn = document.getElementById('res-save-btn');

    // Reset inputs
    if (titleInp) titleInp.value = '';
    if (urlInp) urlInp.value = '';
    if (descInp) descInp.value = '';
    if (fileInp) fileInp.value = '';
    if (chosenBox) chosenBox.style.display = 'none';
    if (chosenText) chosenText.textContent = '';
    currentUploadedFileData = null;
    currentUploadedFileName = '';
    currentUploadedFileType = 'pdf';
    currentUploadMode = 'file';

    // Update Tab UI
    function setUploadMode(mode) {
      currentUploadMode = mode;
      if (mode === 'file') {
        if (tabFile) { tabFile.style.background = 'var(--accent-bg)'; tabFile.style.color = 'var(--accent)'; tabFile.style.fontWeight = '700'; }
        if (tabLink) { tabLink.style.background = 'transparent'; tabLink.style.color = 'var(--label-2)'; tabLink.style.fontWeight = '600'; }
        if (filePanel) filePanel.style.display = 'block';
        if (linkPanel) linkPanel.style.display = 'none';
      } else {
        if (tabLink) { tabLink.style.background = 'var(--accent-bg)'; tabLink.style.color = 'var(--accent)'; tabLink.style.fontWeight = '700'; }
        if (tabFile) { tabFile.style.background = 'transparent'; tabFile.style.color = 'var(--label-2)'; tabFile.style.fontWeight = '600'; }
        if (filePanel) filePanel.style.display = 'none';
        if (linkPanel) linkPanel.style.display = 'block';
      }
    }

    if (tabFile) tabFile.onclick = () => setUploadMode('file');
    if (tabLink) tabLink.onclick = () => setUploadMode('link');
    setUploadMode('file');

    // File selection
    if (pickBtn && fileInp) {
      pickBtn.onclick = () => fileInp.click();
    }

    if (fileInp) {
      fileInp.onchange = () => {
        const file = fileInp.files && fileInp.files[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) {
          showToast('ไฟล์มีขนาดเกิน 25MB กรุณาเลือกไฟล์ที่เล็กลง', 'warning');
          fileInp.value = '';
          return;
        }
        const ext = file.name.split('.').pop().toLowerCase();
        currentUploadedFileType = ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'image' : 'pdf';
        currentUploadedFileName = file.name;

        if (titleInp && !titleInp.value.trim()) {
          titleInp.value = file.name.replace(/\.[^.]+$/, '');
        }

        if (chosenBox && chosenText) {
          chosenBox.style.display = 'flex';
          chosenText.textContent = `✅ ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
          currentUploadedFileData = ev.target.result;
        };
        reader.readAsDataURL(file);
      };
    }

    // Drag & Drop on file panel
    if (filePanel) {
      filePanel.ondragover = (e) => { e.preventDefault(); filePanel.style.background = 'var(--bg-3)'; };
      filePanel.ondragleave = () => { filePanel.style.background = 'var(--accent-bg)'; };
      filePanel.ondrop = (e) => {
        e.preventDefault();
        filePanel.style.background = 'var(--accent-bg)';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          fileInp.files = e.dataTransfer.files;
          fileInp.dispatchEvent(new Event('change'));
        }
      };
    }

    if (removeBtn) {
      removeBtn.onclick = () => {
        if (fileInp) fileInp.value = '';
        currentUploadedFileData = null;
        currentUploadedFileName = '';
        if (chosenBox) chosenBox.style.display = 'none';
      };
    }

    if (folderSel) {
      folderSel.innerHTML = state.studyFolders.map(f => `
        <option value="${f.id}" ${(state.selectedFolderId === f.id || (state.selectedFolderId === 'all' && f.id === 'f-uploads')) ? 'selected' : ''}>${escHtml(f.name)}</option>
      `).join('');
    }

    // Save Button Handler
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const title = titleInp?.value.trim();
        const folderId = folderSel?.value || (state.selectedFolderId !== 'all' ? state.selectedFolderId : (currentUploadMode === 'file' ? 'f-uploads' : 'f-notes'));
        const desc = descInp?.value.trim();

        if (!title) {
          showToast('กรุณาระบุชื่อเอกสาร / ชีทเรียน', 'warning');
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ กำลังบันทึก...';

        try {
          if (currentUploadMode === 'file') {
            const file = fileInp?.files && fileInp.files[0];
            if (!file && !currentUploadedFileData) {
              showToast('กรุณากดเลือกไฟล์จากเครื่องก่อนบันทึก', 'warning');
              saveBtn.disabled = false;
              saveBtn.textContent = '💾 บันทึกเอกสาร';
              return;
            }

            // Ensure FileReader is finished
            if (file && !currentUploadedFileData) {
              currentUploadedFileData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
            }

            let serverFileUrl = '';
            const authToken = localStorage.getItem('sd-auth-token') || '';
            const syncKey = (window.CloudSync && CloudSync.getSyncKey()) || '1';

            // Attempt direct server upload so file is accessible on all devices (mobile, tablet, desktop)
            if (file) {
              try {
                const uploadRes = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, {
                  method: 'POST',
                  headers: {
                    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
                    'X-Sync-Key': syncKey
                  },
                  body: file
                });
                if (uploadRes.ok) {
                  const uploadData = await uploadRes.json();
                  if (uploadData && uploadData.success && uploadData.file && uploadData.file.url) {
                    serverFileUrl = uploadData.file.url;
                  }
                }
              } catch (upErr) {
                console.warn('Server upload failed, using local offline fallback', upErr);
              }
            }

            const newId = `link-${Date.now()}`;
            const finalUrl = serverFileUrl || currentUploadedFileData || '';

            // Store in IndexedDB for instant offline preview
            if (currentUploadedFileData) {
              await LocalFileDB.setFile(newId, currentUploadedFileData);
            }

            state.studyLinks.push({
              id: newId,
              folderId,
              title,
              type: currentUploadedFileType || 'pdf',
              url: finalUrl,
              desc,
              isLocal: !serverFileUrl,
              fileSize: file ? file.size : undefined,
              createdAt: new Date().toISOString()
            });

            saveStudyLinks();
            closeModal('resource-modal');
            renderStudyView();
            showToast('อัพโหลดและบันทึกไฟล์เรียบร้อย!', 'success');
          } else {
            // Web Link Mode
            const url = urlInp?.value.trim();
            const type = typeSel?.value || 'link';

            if (!url) {
              showToast('กรุณาระบุ URL ลิงค์ปลายทาง', 'warning');
              saveBtn.disabled = false;
              saveBtn.textContent = '💾 บันทึกเอกสาร';
              return;
            }

            state.studyLinks.push({
              id: `link-${Date.now()}`,
              folderId,
              title,
              type,
              url,
              desc,
              isLocal: false,
              createdAt: new Date().toISOString()
            });

            saveStudyLinks();
            closeModal('resource-modal');
            renderStudyView();
            showToast('บันทึกลิงค์เรียบร้อย!', 'success');
          }
        } catch (err) {
          console.error('Error saving resource:', err);
          showToast('เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง', 'warning');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 บันทึกเอกสาร';
        }
      };
    }

    const resCloseBtn = document.getElementById('resource-modal-close');
    if (resCloseBtn) resCloseBtn.onclick = () => closeModal('resource-modal');
    const resCancelBtn = document.getElementById('res-cancel-btn');
    if (resCancelBtn) resCancelBtn.onclick = () => closeModal('resource-modal');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // ─── High-Performance PDF Viewer with Page & Scroll Modes ─
  // Track keydown handler for cleanup
  let _pdfKeydownHandler = null;

  async function renderPdfWithPdfJs(url, bodyEl, title) {
    // Clean up previous keydown handler
    if (_pdfKeydownHandler) {
      document.removeEventListener('keydown', _pdfKeydownHandler);
      _pdfKeydownHandler = null;
    }

    bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;gap:12px;min-height:300px;text-align:center">
        <div style="font-size:32px">⏳</div>
        <div style="font-size:14px;font-weight:600;color:var(--label)">กำลังเปิดเอกสาร PDF...</div>
        <div style="font-size:12px;color:var(--label-3)">รองรับทั้งโหมดทีละหน้าและโหมดเลื่อนดูทุกหน้าต่อเนื่อง</div>
      </div>
    `;

    try {
      if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js library is not available');
      }

      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      let pdfParam;
      if (url.startsWith('data:')) {
        const base64Index = url.indexOf(';base64,');
        if (base64Index !== -1) {
          const b64 = url.substring(base64Index + 8);
          const binStr = window.atob(b64);
          const len = binStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binStr.charCodeAt(i);
          }
          pdfParam = { data: bytes };
        } else {
          pdfParam = { url };
        }
      } else {
        let resolvedUrl = url;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const matchR2 = url.match(/\/([a-f0-9]{16}\.[a-z0-9]+)$/i) || url.match(/\/uploads\/([^\/\?#]+)$/i);
          if (matchR2) {
            resolvedUrl = `/uploads/${matchR2[1]}`;
          } else if (!url.startsWith(window.location.origin)) {
            resolvedUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
          }
        }
        pdfParam = { url: resolvedUrl };
      }

      pdfParam.cMapUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/';
      pdfParam.cMapPacked = true;

      const loadingTask = pdfjsLib.getDocument(pdfParam);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      let currentPage = 1;
      let currentScale = 1.0;
      let viewMode = 'page'; // 'page' or 'scroll'
      let renderedPages = {}; // cache for scroll mode
      let currentRenderTask = null;

      bodyEl.innerHTML = `
        <div class="pdf-viewer-bar" style="position:sticky;top:0;z-index:15;background:var(--bg-1);border-bottom:1px solid var(--sep);padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <!-- Page Navigation (page mode only) -->
          <div style="display:flex;align-items:center;gap:6px" id="pdf-nav-btns">
            <button id="pdf-prev-btn" class="btn btn-secondary" style="padding:5px 12px;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:4px">
              ◀️ ก่อนหน้า
            </button>
            <div style="display:flex;align-items:center;gap:4px;font-size:12.5px;font-weight:600;color:var(--label-2)">
              <span>หน้า</span>
              <input type="number" id="pdf-page-num-input" min="1" max="${numPages}" value="1" 
                style="width:48px;padding:3px 6px;text-align:center;border:1px solid var(--sep);border-radius:var(--r-s);background:var(--bg-2);color:var(--label);font-weight:700;font-size:12px" />
              <span>/ <strong>${numPages}</strong></span>
            </div>
            <button id="pdf-next-btn" class="btn btn-secondary" style="padding:5px 12px;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:4px">
              ถัดไป ▶️
            </button>
          </div>

          <!-- View Mode Toggle + Zoom -->
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <div style="display:flex;border-radius:var(--r-pill);overflow:hidden;border:1px solid var(--sep)">
              <button id="pdf-mode-page" class="btn btn-secondary" style="padding:4px 10px;font-size:11.5px;font-weight:700;border-radius:0;background:var(--accent-bg);color:var(--accent)">📄 ทีละหน้า</button>
              <button id="pdf-mode-scroll" class="btn btn-secondary" style="padding:4px 10px;font-size:11.5px;font-weight:600;border-radius:0">📜 เลื่อนดู</button>
            </div>
            <button id="pdf-zoom-out" class="btn btn-secondary" style="padding:4px 10px;font-size:12px;font-weight:600" title="ย่อ">🔍 -</button>
            <span id="pdf-zoom-val" style="font-size:12px;font-weight:600;min-width:42px;text-align:center;color:var(--label)">100%</span>
            <button id="pdf-zoom-in" class="btn btn-secondary" style="padding:4px 10px;font-size:12px;font-weight:600" title="ขยาย">🔍 +</button>
            <button id="pdf-zoom-fit" class="btn btn-secondary" style="padding:4px 10px;font-size:12px;font-weight:600" title="ปรับให้พอดีความกว้างหน้าจอ">📐 พอดีจอ</button>
          </div>
        </div>

        <div id="pdf-page-container" style="display:block;text-align:center;padding:16px 8px;background:var(--bg-3);overflow-y:auto;overflow-x:auto;-webkit-overflow-scrolling:touch;min-height:350px;max-height:calc(90vh - 170px)">
          <div id="pdf-single-page-wrapper" style="display:inline-block;position:relative;background:#fff;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.15);overflow:hidden;margin:0 auto;text-align:left">
            <canvas id="pdf-canvas" style="display:block;margin:0 auto"></canvas>
          </div>
          <div id="pdf-scroll-container" style="display:none;flex-direction:column;align-items:center;gap:16px;width:100%;margin:0 auto"></div>
        </div>
      `;

      const canvas = bodyEl.querySelector('#pdf-canvas');
      const pageInput = bodyEl.querySelector('#pdf-page-num-input');
      const zoomValEl = bodyEl.querySelector('#pdf-zoom-val');
      const prevBtn = bodyEl.querySelector('#pdf-prev-btn');
      const nextBtn = bodyEl.querySelector('#pdf-next-btn');
      const container = bodyEl.querySelector('#pdf-page-container');
      const singleWrapper = bodyEl.querySelector('#pdf-single-page-wrapper');
      const scrollContainer = bodyEl.querySelector('#pdf-scroll-container');
      const navBtns = bodyEl.querySelector('#pdf-nav-btns');

      // Calculate initial auto-fit scale
      const firstPage = await pdf.getPage(1);
      const initialVp = firstPage.getViewport({ scale: 1.0 });
      const availableWidth = Math.max(260, (container.clientWidth || window.innerWidth * 0.9) - 36);
      currentScale = Math.min(1.5, Math.max(0.3, availableWidth / initialVp.width));
      if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;

      async function renderCurrentPage() {
        if (currentRenderTask) {
          try { currentRenderTask.cancel(); } catch (_) {}
          currentRenderTask = null;
        }

        if (prevBtn) prevBtn.disabled = (currentPage <= 1);
        if (nextBtn) nextBtn.disabled = (currentPage >= numPages);
        if (pageInput) pageInput.value = currentPage;

        try {
          const page = await pdf.getPage(currentPage);
          const viewport = page.getViewport({ scale: currentScale });

          const outputScale = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = Math.floor(viewport.width) + "px";
          canvas.style.height = Math.floor(viewport.height) + "px";
          canvas.style.display = "block";
          canvas.style.maxWidth = "none";

          if (singleWrapper) {
            singleWrapper.style.width = Math.floor(viewport.width) + "px";
            singleWrapper.style.maxWidth = "none";
          }

          const context = canvas.getContext('2d');
          const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

          const renderContext = {
            canvasContext: context,
            transform: transform,
            viewport: viewport
          };

          currentRenderTask = page.render(renderContext);
          await currentRenderTask.promise;
        } catch (e) {
          if (e && e.name === 'RenderingCancelledException') return;
          console.error('Error rendering page:', e);
        } finally {
          currentRenderTask = null;
        }
      }

      async function renderAllPagesScroll() {
        scrollContainer.innerHTML = '';
        renderedPages = {};

        for (let i = 1; i <= numPages; i++) {
          try {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: currentScale });
            const outputScale = window.devicePixelRatio || 1;

            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = Math.floor(viewport.width * outputScale);
            pageCanvas.height = Math.floor(viewport.height * outputScale);
            pageCanvas.style.width = Math.floor(viewport.width) + "px";
            pageCanvas.style.height = Math.floor(viewport.height) + "px";
            pageCanvas.style.display = 'block';
            pageCanvas.style.maxWidth = 'none';

            const ctx = pageCanvas.getContext('2d');
            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            await page.render({
              canvasContext: ctx,
              transform: transform,
              viewport: viewport
            }).promise;

            const wrapper = document.createElement('div');
            wrapper.style.cssText = `background:#fff;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.15);overflow:hidden;width:${Math.floor(viewport.width)}px;max-width:none;text-align:center;margin:0 auto;display:flex;flex-direction:column;align-items:center;`;
            wrapper.appendChild(pageCanvas);

            const pageLabel = document.createElement('div');
            pageLabel.style.cssText = 'text-align:center;font-size:11px;color:var(--label-3);padding:6px 0;background:var(--bg-2);width:100%;border-top:1px solid var(--sep)';
            pageLabel.textContent = `หน้า ${i} / ${numPages}`;
            wrapper.appendChild(pageLabel);

            scrollContainer.appendChild(wrapper);
            renderedPages[i] = true;
          } catch (e) {
            if (e && e.name === 'RenderingCancelledException') continue;
            console.error('Error rendering page ' + i + ':', e);
          }
        }
      }

      function switchViewMode(mode) {
        viewMode = mode;
        const pageModeBtn = bodyEl.querySelector('#pdf-mode-page');
        const scrollModeBtn = bodyEl.querySelector('#pdf-mode-scroll');

        if (mode === 'page') {
          singleWrapper.style.display = 'inline-block';
          scrollContainer.style.display = 'none';
          navBtns.style.display = 'flex';
          if (prevBtn) prevBtn.disabled = (currentPage <= 1);
          if (nextBtn) nextBtn.disabled = (currentPage >= numPages);
          if (pageInput) pageInput.value = currentPage;
          if (pageModeBtn) { pageModeBtn.style.background = 'var(--accent-bg)'; pageModeBtn.style.color = 'var(--accent)'; pageModeBtn.style.fontWeight = '700'; }
          if (scrollModeBtn) { scrollModeBtn.style.background = ''; scrollModeBtn.style.color = ''; scrollModeBtn.style.fontWeight = '600'; }
          container.scrollTop = 0;
          renderCurrentPage();
        } else {
          singleWrapper.style.display = 'none';
          scrollContainer.style.display = 'flex';
          navBtns.style.display = 'none';
          if (pageModeBtn) { pageModeBtn.style.background = ''; pageModeBtn.style.color = ''; pageModeBtn.style.fontWeight = '600'; }
          if (scrollModeBtn) { scrollModeBtn.style.background = 'var(--accent-bg)'; scrollModeBtn.style.color = 'var(--accent)'; scrollModeBtn.style.fontWeight = '700'; }
          container.scrollTop = 0;
          renderAllPagesScroll();
        }
      }

      await renderCurrentPage();

      // Mode toggle buttons
      bodyEl.querySelector('#pdf-mode-page')?.addEventListener('click', () => switchViewMode('page'));
      bodyEl.querySelector('#pdf-mode-scroll')?.addEventListener('click', () => switchViewMode('scroll'));

      // Page change handlers — reset scroll to top on explicit navigation
      prevBtn?.addEventListener('click', async () => {
        if (currentPage > 1) {
          currentPage--;
          container.scrollTop = 0;
          await renderCurrentPage();
        }
      });

      nextBtn?.addEventListener('click', async () => {
        if (currentPage < numPages) {
          currentPage++;
          container.scrollTop = 0;
          await renderCurrentPage();
        }
      });

      pageInput?.addEventListener('change', async () => {
        let val = parseInt(pageInput.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > numPages) val = numPages;
        currentPage = val;
        container.scrollTop = 0;
        await renderCurrentPage();
      });

      // Zoom handlers (supports smooth scaling & cancels pending renders)
      bodyEl.querySelector('#pdf-zoom-in')?.addEventListener('click', async () => {
        currentScale = Math.min(3.5, currentScale + 0.25);
        if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;
        if (viewMode === 'scroll') { await renderAllPagesScroll(); }
        else { await renderCurrentPage(); }
      });

      bodyEl.querySelector('#pdf-zoom-out')?.addEventListener('click', async () => {
        currentScale = Math.max(0.2, currentScale - 0.25);
        if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;
        if (viewMode === 'scroll') { await renderAllPagesScroll(); }
        else { await renderCurrentPage(); }
      });

      bodyEl.querySelector('#pdf-zoom-fit')?.addEventListener('click', async () => {
        const page = await pdf.getPage(currentPage);
        const vp = page.getViewport({ scale: 1.0 });
        const availableW = Math.max(260, (container.clientWidth || window.innerWidth * 0.9) - 36);
        currentScale = Math.max(0.2, Math.min(2.5, availableW / vp.width));
        if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;
        if (viewMode === 'scroll') { await renderAllPagesScroll(); }
        else { await renderCurrentPage(); }
      });

      // Native Touch Pinch-to-Zoom Gesture for Mobile PDF Preview
      let touchStartDist = 0;
      let touchStartScale = currentScale;
      let isPinching = false;
      let pinchTimeout = null;

      container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          isPinching = true;
          touchStartDist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
          );
          touchStartScale = currentScale;
        }
      }, { passive: true });

      container.addEventListener('touchmove', (e) => {
        if (isPinching && e.touches.length === 2 && touchStartDist > 0) {
          const currentDist = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
          );
          const factor = currentDist / touchStartDist;
          currentScale = Math.max(0.3, Math.min(3.5, touchStartScale * factor));
          if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;

          clearTimeout(pinchTimeout);
          pinchTimeout = setTimeout(async () => {
            if (viewMode === 'scroll') { await renderAllPagesScroll(); }
            else { await renderCurrentPage(); }
          }, 120);
        }
      }, { passive: true });

      container.addEventListener('touchend', async (e) => {
        if (e.touches.length < 2 && isPinching) {
          isPinching = false;
          if (viewMode === 'scroll') { await renderAllPagesScroll(); }
          else { await renderCurrentPage(); }
        }
      }, { passive: true });

      // Keyboard left/right arrows for page turning (page mode only)
      _pdfKeydownHandler = async (e) => {
        if (!document.getElementById('preview-modal')?.classList.contains('open')) {
          document.removeEventListener('keydown', _pdfKeydownHandler);
          _pdfKeydownHandler = null;
          return;
        }
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        if (viewMode !== 'page') return;
        if (e.key === 'ArrowLeft' && currentPage > 1) {
          currentPage--;
          await renderCurrentPage();
        } else if (e.key === 'ArrowRight' && currentPage < numPages) {
          currentPage++;
          await renderCurrentPage();
        }
      };
      document.addEventListener('keydown', _pdfKeydownHandler);

    } catch (err) {
      console.warn('PDF.js rendering fallback:', err);
      bodyEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:36px 20px;gap:14px;min-height:300px;text-align:center">
          <div style="font-size:44px">📄</div>
          <div style="font-size:16px;font-weight:700;color:var(--label)">${escHtml(title || 'เอกสาร PDF')}</div>
          <div style="font-size:13px;color:var(--label-2);max-width:440px;line-height:1.5">
            บันทึกไฟล์เรียบร้อยแล้ว คุณสามารถกดเปิดอ่านผ่านแท็บใหม่ หรือดาวน์โหลดลงเครื่องได้ทันที
          </div>
          <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;justify-content:center">
            <a href="${escHtml(url)}" download="${escHtml(title || 'document')}.pdf" class="btn btn-secondary" style="display:inline-flex;padding:8px 18px;font-size:12.5px;font-weight:600;text-decoration:none;border-radius:var(--r-pill)">
              📥 ดาวน์โหลด PDF
            </a>
            <a href="viewer.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title || 'เอกสาร')}&type=pdf" target="_blank" class="btn btn-primary" style="display:inline-flex;padding:8px 20px;font-size:12.5px;font-weight:700;text-decoration:none;border-radius:var(--r-pill)">
              🚀 เปิดในโปรแกรมอ่านเต็มจอ
            </a>
          </div>
        </div>`;
    }
  }

  // ─── In-App Resource Preview ──────────────────────────────
    // ─── In-App Resource Preview ────────────────────────────
  async function openResourcePreview(item) {
    const modal = document.getElementById('preview-modal');
    if (!modal) return;

    // Set title and badge
    const titleEl = document.getElementById('preview-modal-title');
    if (titleEl) titleEl.textContent = item.title || 'ตัวอย่างเอกสาร';

    const badge = document.getElementById('preview-badge');
    if (badge) {
      const typeMap = { pdf: '📄 PDF', drive: '📁 Drive', classroom: '🎓 Classroom', image: '🖼️ Image', link: '🔗 Link', local: '💾 Upload' };
      badge.textContent = typeMap[item.type] || '🔗 LINK';
    }

    // Meta info
    const metaEl = document.getElementById('preview-meta-info');
    if (metaEl) metaEl.textContent = item.sub || item.desc || '';

    // Retrieve file data URL from IndexedDB if not in memory
    let fileUrl = item.url || '';
    if (item.isLocal && (!fileUrl || fileUrl === '')) {
      fileUrl = (await LocalFileDB.getFile(item.id)) || '';
    }

    // External open button -> opens dedicated viewer.html with persistent Back to E-Calendar bar!
    const extBtn = document.getElementById('preview-open-ext-btn');
    if (extBtn) {
      extBtn.style.display = 'inline-flex';
      if (item.type === 'local' || (fileUrl && fileUrl.startsWith('data:'))) {
        extBtn.href = `viewer.html?id=${encodeURIComponent(item.id)}&title=${encodeURIComponent(item.title || 'เอกสาร')}&type=${encodeURIComponent(item.type || 'pdf')}`;
        extBtn.onclick = () => {
          try {
            if (fileUrl) sessionStorage.setItem('viewer_data_' + item.id, fileUrl);
          } catch (_) {}
        };
      } else {
        extBtn.href = `viewer.html?url=${encodeURIComponent(fileUrl || item.url || '')}&title=${encodeURIComponent(item.title || 'เอกสาร')}&type=${encodeURIComponent(item.type || 'pdf')}`;
        extBtn.onclick = null;
      }
    }

    // Copy link button
    const copyBtn = document.getElementById('preview-copy-link-btn');
    if (copyBtn) {
      if (item.type === 'local') {
        copyBtn.style.display = 'none';
      } else {
        copyBtn.style.display = 'inline-flex';
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(item.url || '').then(() => showToast('คัดลอกลิงค์แล้ว', 'success'));
        };
      }
    }

    // Back button
    const backBtn = document.getElementById('preview-back-btn');
    if (backBtn) {
      backBtn.onclick = () => closeModal('preview-modal');
    }

    // Populate preview body
    const body = document.getElementById('preview-modal-body');
    if (body) {
      body.innerHTML = '';

      const isPdfFile = (item.type === 'pdf' || (fileUrl && (fileUrl.endsWith('.pdf') || fileUrl.includes('.pdf') || fileUrl.startsWith('data:application/pdf') || (item.type === 'local' && !fileUrl.startsWith('data:image/')))));
      const isImageFile = (item.type === 'image' || (fileUrl && (fileUrl.match(/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i) || fileUrl.startsWith('data:image/'))));

      if (isPdfFile && fileUrl) {
        // Multi-page PDF rendering via PDF.js (works on iPad, iPhone, PC)
        renderPdfWithPdfJs(fileUrl, body, item.title);
      } else if (isImageFile && fileUrl) {
        const resolvedUrl = (fileUrl.startsWith('/') && !fileUrl.startsWith('//')) ? `${window.location.origin}${fileUrl}` : fileUrl;
        body.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;min-height:300px;max-height:calc(90vh - 130px);overflow:auto">
            <img src="${escHtml(resolvedUrl)}" alt="${escHtml(item.title)}" style="max-width:100%;height:auto;max-height:75vh;object-fit:contain;border-radius:var(--r-m);box-shadow:var(--shadow-2)" />
            <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
              <a href="${escHtml(resolvedUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="font-size:12.5px;padding:8px 18px;text-decoration:none;border-radius:var(--r-pill);font-weight:600">🔍 ดูภาพขนาดเต็ม ↗</a>
              <a href="${escHtml(resolvedUrl)}" download="${escHtml(item.title || 'image')}" class="btn btn-primary" style="font-size:12.5px;padding:8px 18px;text-decoration:none;border-radius:var(--r-pill);font-weight:700">📥 ดาวน์โหลดรูปภาพ</a>
            </div>
          </div>`;
      } else {
        // Google Drive / Classroom / generic link — show rich card + open button
        const typeEmoji = { drive: '📁', classroom: '🎓', link: '🔗' };
        const emoji = typeEmoji[item.type] || '🔗';
        
          body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;gap:20px;min-height:280px;text-align:center">
              <div style="font-size:52px">${emoji}</div>
              <div>
                <div style="font-size:17px;font-weight:700;color:var(--label);margin-bottom:6px">${escHtml(item.title)}</div>
                ${item.sub ? `<div style="font-size:13px;color:var(--label-3);margin-bottom:4px">${escHtml(item.sub)}</div>` : ''}
                ${item.desc ? `<div style="font-size:13px;color:var(--label-2)">${escHtml(item.desc)}</div>` : ''}
              </div>
              <div style="font-size:12px;color:var(--label-3);background:var(--bg-3);border-radius:var(--r-m);padding:10px 16px;word-break:break-all;max-width:100%">${escHtml(item.url)}</div>
              <a href="${escHtml(item.url)}" target="_blank" rel="noopener noreferrer"
                 style="display:inline-flex;align-items:center;gap:8px;padding:12px 28px;background:var(--accent);color:#fff;border-radius:var(--r-pill);font-weight:700;font-size:14px;text-decoration:none;box-shadow:0 4px 14px rgba(196,90,27,0.3);transition:transform 0.15s"
                 onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''"
              >🚀 เปิด ${item.type === 'classroom' ? 'Google Classroom' : item.type === 'drive' ? 'Google Drive' : 'ลิงค์'}</a>
            </div>`;
      }
    }

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // ─── View 4: Interactive 4-Year BME Prerequisite Node Graph ─
  let graphState = {
    selectedNodeId: null,
    filterPillar: 'all',
    searchQuery: '',
    zoom: 1
  };

  function renderGraphView() {
    const container = document.getElementById('view-egbe-graph');
    if (!container) return;

    if (state.isBme === false) {
      container.innerHTML = `
        <div style="padding:60px 24px;text-align:center;background:var(--bg-2);border-radius:var(--r-l);border:1px dashed var(--sep);max-width:680px;margin:2rem auto">
          <div style="font-size:48px;margin-bottom:14px">🗺️</div>
          <h2 style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;margin-bottom:8px">BME Prerequisite Road Map</h2>
          <p style="font-size:13.5px;color:var(--label-2);line-height:1.6;margin-bottom:20px">
            แผนผังเส้นทางวิชาต่อเนื่อง (Prerequisite) นี้เป็นโครงสร้างเฉพาะของหลักสูตรวิศวกรรมชีวแพทย์ (BME Mahidol)<br>
            เนื่องจากคุณลงทะเบียนในฐานะผู้ใช้งานทั่วไป ระบบจึงเว้นว่างไว้เพื่อความเป็นส่วนตัวของคุณ
          </p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" id="btn-graph-enable-bme" style="font-size:12.5px;padding:8px 18px">
              🧬 เปิดใช้งานโครงสร้างวิชา BME Road Map
            </button>
          </div>
        </div>
      `;
      document.getElementById('btn-graph-enable-bme')?.addEventListener('click', () => {
        state.isBme = true;
        localStorage.setItem('sd-is-bme', 'true');
        if (!state.curriculum || state.curriculum.length === 0) {
          state.curriculum = JSON.parse(JSON.stringify(DEFAULT_CURRICULUM));
          saveCurriculum();
        }
        if (!state.studyFolders || state.studyFolders.length === 0) {
          state.studyFolders = [...DEFAULT_STUDY_FOLDERS];
          localStorage.setItem('sd-study-folders', JSON.stringify(state.studyFolders));
        }
        if (!state.studyLinks || state.studyLinks.length === 0) {
          state.studyLinks = [...DEFAULT_STUDY_LINKS];
          saveStudyLinks();
        }
        showToast('🧬 เปิดใช้งานแผนผังและหลักสูตร BME เรียบร้อย!', 'success');
        renderGraphView();
      });
      return;
    }

    const currentPillar = graphState.filterPillar || 'all';
    const query = (graphState.searchQuery || '').toLowerCase().trim();

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem;flex-wrap:wrap;gap:1rem">
        <div>
          <h2 style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;margin-bottom:4px">BME Prerequisite &amp; Career Road Map (ปี 1 → ปี 4)</h2>
          <p style="font-size:13px;color:var(--label-2)">แผนผังเชื่อมโยงเส้นทางการเรียนรู้วิศวกรรมชีวแพทย์ คลิกที่ Node วิชาเพื่อดูเส้นทาง Prerequisite และวิชาที่จะได้เรียนต่อจนถึงปี 4</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--label-2);background:var(--bg-2);padding:6px 12px;border-radius:var(--r-pill);border:1px solid var(--sep)">
          <span>💡 คลิกที่การ์ดเพื่อ Trace เส้นทางไปต่อ</span>
        </div>
      </div>

      <!-- Graph Toolbar & Filters -->
      <div class="node-graph-wrapper">
        <div class="graph-toolbar">
          <div class="graph-filter-group">
            <button class="graph-btn-pill ${currentPillar === 'all' ? 'active' : ''}" data-pillar="all">
              🌈 ทุกสายวิชา (All)
            </button>
            ${Object.values(BME_PILLARS).map(p => `
              <button class="graph-btn-pill ${currentPillar === p.id ? 'active' : ''}" data-pillar="${p.id}">
                ${p.icon} ${escHtml(p.nameTh)}
              </button>
            `).join('')}
          </div>

          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="position:relative">
              <input type="text" id="graph-search-input" placeholder="🔍 ค้นหาวิชา เช่น 122, Phy, AI..." value="${escHtml(graphState.searchQuery || '')}" style="padding:6px 12px 6px 28px;font-size:12px;border-radius:var(--r-pill);border:1px solid var(--sep);background:var(--bg-1);color:var(--label);outline:none;width:180px" />
              <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--label-3);pointer-events:none">🔍</span>
              ${graphState.searchQuery ? `<button id="graph-clear-search" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--label-3);font-size:11px">✕</button>` : ''}
            </div>

            <div class="graph-controls">
              <button class="graph-control-btn" id="graph-zoom-in" title="ซูมเข้า">➕</button>
              <button class="graph-control-btn" id="graph-zoom-out" title="ซูมออก">➖</button>
              <button class="graph-control-btn" id="graph-zoom-reset" title="รีเซ็ต">↺</button>
            </div>
          </div>
        </div>

        <!-- Interactive Canvas Viewport -->
        <div class="graph-viewport" id="graph-viewport">
          <div class="graph-canvas" id="graph-canvas" style="transform: scale(${graphState.zoom})">
            <!-- Dynamic SVG Connectors Layer -->
            <svg class="graph-svg-layer" id="graph-svg-layer">
              <defs>
                <marker id="arrow-forward" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
                </marker>
                <marker id="arrow-backward" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#10b981" />
                </marker>
                <marker id="arrow-default" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill="rgba(150,150,150,0.4)" />
                </marker>
              </defs>
              <g id="graph-svg-edges-group"></g>
            </svg>

            <!-- Semester Columns -->
            ${BME_SEMESTERS.map(sem => {
              const semNodes = BME_GRAPH_NODES.filter(node => node.sem === sem.id);
              return `
                <div class="graph-column" data-sem="${sem.id}">
                  <div class="graph-col-header">${escHtml(sem.label)}</div>
                  ${semNodes.map(node => {
                    const pillar = BME_PILLARS[node.pillar] || BME_PILLARS.core;
                    const matchesFilter = (currentPillar === 'all' || node.pillar === currentPillar) &&
                                          (!query || node.code.toLowerCase().includes(query) || node.name.toLowerCase().includes(query) || node.nameTh.toLowerCase().includes(query));
                    return `
                      <div class="graph-node ${!matchesFilter ? 'dimmed' : ''}" id="gnode-${node.id}" data-id="${node.id}" data-pillar="${node.pillar}">
                        <div class="graph-node-top">
                          <span class="graph-node-code">${escHtml(node.code)}</span>
                          <span class="graph-node-credits">${node.credits} หน่วยกิต</span>
                        </div>
                        <div class="graph-node-title">${escHtml(node.nameTh)}</div>
                        <div style="font-size:10px;color:var(--label-3);line-height:1.2">${escHtml(node.name)}</div>
                        <div class="graph-node-stream-tag" style="background:${pillar.bg};color:${pillar.color}">
                          ${pillar.icon} ${escHtml(pillar.name.split(' ')[0])}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `;
            }).join('')}
          </div>

          <!-- Slide-Up Course Inspector Panel -->
          <div id="graph-inspector-container"></div>
        </div>
      </div>
    `;

    // Attach Filter Buttons
    container.querySelectorAll('.graph-btn-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pillar = e.currentTarget.dataset.pillar;
        if (pillar) {
          graphState.filterPillar = pillar;
          renderGraphView();
        }
      });
    });

    // Search Input
    const searchInp = document.getElementById('graph-search-input');
    searchInp?.addEventListener('input', (e) => {
      graphState.searchQuery = e.target.value;
      updateGraphFiltering();
    });
    document.getElementById('graph-clear-search')?.addEventListener('click', () => {
      graphState.searchQuery = '';
      renderGraphView();
    });

    // Zoom Controls
    document.getElementById('graph-zoom-in')?.addEventListener('click', () => {
      graphState.zoom = Math.min(graphState.zoom + 0.15, 1.6);
      const canvas = document.getElementById('graph-canvas');
      if (canvas) canvas.style.transform = `scale(${graphState.zoom})`;
      drawGraphSvgEdges();
    });
    document.getElementById('graph-zoom-out')?.addEventListener('click', () => {
      graphState.zoom = Math.max(graphState.zoom - 0.15, 0.65);
      const canvas = document.getElementById('graph-canvas');
      if (canvas) canvas.style.transform = `scale(${graphState.zoom})`;
      drawGraphSvgEdges();
    });
    document.getElementById('graph-zoom-reset')?.addEventListener('click', () => {
      graphState.zoom = 1;
      const canvas = document.getElementById('graph-canvas');
      if (canvas) canvas.style.transform = 'scale(1)';
      drawGraphSvgEdges();
    });

    // Node click
    container.querySelectorAll('.graph-node').forEach(nodeEl => {
      nodeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = nodeEl.dataset.id;
        if (graphState.selectedNodeId === id) {
          clearGraphSelection();
        } else {
          selectGraphNode(id);
        }
      });
    });

    // Click outside node -> clear
    const viewport = document.getElementById('graph-viewport');
    viewport?.addEventListener('click', (e) => {
      if (!e.target.closest('.graph-node') && !e.target.closest('.graph-inspector-panel') && !e.target.closest('.graph-toolbar')) {
        clearGraphSelection();
      }
    });

    // Draw initial SVG edges after DOM renders
    requestAnimationFrame(() => {
      drawGraphSvgEdges();
      if (graphState.selectedNodeId) {
        selectGraphNode(graphState.selectedNodeId);
      }
    });
    setTimeout(() => {
      drawGraphSvgEdges();
      if (graphState.selectedNodeId) {
        selectGraphNode(graphState.selectedNodeId);
      }
    }, 150);
  }

  function updateGraphFiltering() {
    const currentPillar = graphState.filterPillar || 'all';
    const query = (graphState.searchQuery || '').toLowerCase().trim();

    document.querySelectorAll('.graph-node').forEach(nodeEl => {
      const id = nodeEl.dataset.id;
      const node = BME_GRAPH_NODES.find(n => n.id === id);
      if (!node) return;
      const matches = (currentPillar === 'all' || node.pillar === currentPillar) &&
                      (!query || node.code.toLowerCase().includes(query) || node.name.toLowerCase().includes(query) || node.nameTh.toLowerCase().includes(query));
      if (matches) {
        nodeEl.classList.remove('dimmed');
      } else {
        nodeEl.classList.add('dimmed');
      }
    });
  }

  function drawGraphSvgEdges() {
    const svgGroup = document.getElementById('graph-svg-edges-group');
    const canvas = document.getElementById('graph-canvas');
    if (!svgGroup || !canvas) return;

    svgGroup.innerHTML = '';
    const canvasRect = canvas.getBoundingClientRect();
    const zoom = graphState.zoom || 1;

    BME_GRAPH_NODES.forEach(sourceNode => {
      const sourceEl = document.getElementById(`gnode-${sourceNode.id}`);
      if (!sourceEl) return;

      const sRect = sourceEl.getBoundingClientRect();
      const x1 = (sRect.right - canvasRect.left) / zoom;
      const y1 = (sRect.top + sRect.height / 2 - canvasRect.top) / zoom;

      (sourceNode.unlocks || []).forEach(targetId => {
        const targetEl = document.getElementById(`gnode-${targetId}`);
        if (!targetEl) return;

        const tRect = targetEl.getBoundingClientRect();
        const x2 = (tRect.left - canvasRect.left) / zoom;
        const y2 = (tRect.top + tRect.height / 2 - canvasRect.top) / zoom;

        const dx = Math.max(x2 - x1, 40);
        const d = `M ${x1} ${y1} C ${x1 + dx * 0.45} ${y1}, ${x2 - dx * 0.45} ${y2}, ${x2} ${y2}`;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'graph-edge');
        path.setAttribute('marker-end', 'url(#arrow-default)');
        path.dataset.source = sourceNode.id;
        path.dataset.target = targetId;

        svgGroup.appendChild(path);
      });
    });
  }

  function getDownstreamNodes(startId, visited = new Set()) {
    const res = new Set();
    function traverse(nodeId) {
      const node = BME_GRAPH_NODES.find(n => n.id === nodeId);
      if (!node || !node.unlocks) return;
      node.unlocks.forEach(childId => {
        if (!res.has(childId)) {
          res.add(childId);
          traverse(childId);
        }
      });
    }
    traverse(startId);
    return res;
  }

  function getUpstreamNodes(startId) {
    const res = new Set();
    function traverse(nodeId) {
      const node = BME_GRAPH_NODES.find(n => n.id === nodeId);
      if (!node || !node.prereqs) return;
      node.prereqs.forEach(parentId => {
        if (!res.has(parentId)) {
          res.add(parentId);
          traverse(parentId);
        }
      });
    }
    traverse(startId);
    return res;
  }

  function selectGraphNode(nodeId) {
    graphState.selectedNodeId = nodeId;
    const node = BME_GRAPH_NODES.find(n => n.id === nodeId);
    if (!node) return;

    const downstream = getDownstreamNodes(nodeId);
    const upstream   = getUpstreamNodes(nodeId);
    const activeNodes = new Set([nodeId, ...downstream, ...upstream]);

    // Update node highlights
    document.querySelectorAll('.graph-node').forEach(el => {
      const id = el.dataset.id;
      el.classList.remove('active-focus', 'active-downstream', 'active-upstream', 'dimmed');

      if (id === nodeId) {
        el.classList.add('active-focus');
      } else if (downstream.has(id)) {
        el.classList.add('active-downstream');
      } else if (upstream.has(id)) {
        el.classList.add('active-upstream');
      } else {
        el.classList.add('dimmed');
      }
    });

    // Update edge highlights
    document.querySelectorAll('.graph-edge').forEach(edge => {
      const s = edge.dataset.source;
      const t = edge.dataset.target;
      edge.classList.remove('edge-active-forward', 'edge-active-backward', 'edge-dimmed');

      if ((s === nodeId || downstream.has(s)) && downstream.has(t)) {
        edge.classList.add('edge-active-forward');
        edge.setAttribute('marker-end', 'url(#arrow-forward)');
      } else if (upstream.has(s) && (t === nodeId || upstream.has(t))) {
        edge.classList.add('edge-active-backward');
        edge.setAttribute('marker-end', 'url(#arrow-backward)');
      } else {
        edge.classList.add('edge-dimmed');
        edge.setAttribute('marker-end', 'url(#arrow-default)');
      }
    });

    // Render Inspector Panel
    renderGraphInspector(node, upstream, downstream);
  }

  function clearGraphSelection() {
    graphState.selectedNodeId = null;
    document.querySelectorAll('.graph-node').forEach(el => {
      el.classList.remove('active-focus', 'active-downstream', 'active-upstream', 'dimmed');
    });
    document.querySelectorAll('.graph-edge').forEach(edge => {
      edge.classList.remove('edge-active-forward', 'edge-active-backward', 'edge-dimmed');
      edge.setAttribute('marker-end', 'url(#arrow-default)');
    });
    const inspectorContainer = document.getElementById('graph-inspector-container');
    if (inspectorContainer) inspectorContainer.innerHTML = '';
    updateGraphFiltering();
  }

  function renderGraphInspector(node, upstreamSet, downstreamSet) {
    const container = document.getElementById('graph-inspector-container');
    if (!container) return;

    const pillar = BME_PILLARS[node.pillar] || BME_PILLARS.core;
    const semInfo = BME_SEMESTERS.find(s => s.id === node.sem);

    const directPrereqs = (node.prereqs || []).map(pid => BME_GRAPH_NODES.find(n => n.id === pid)).filter(Boolean);
    const directUnlocks = (node.unlocks || []).map(cid => BME_GRAPH_NODES.find(n => n.id === cid)).filter(Boolean);

    container.innerHTML = `
      <div class="graph-inspector-panel">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
              <span class="tag-chip" style="background:${pillar.bg};color:${pillar.color};font-weight:700">
                ${pillar.icon} ${escHtml(pillar.nameTh)}
              </span>
              <span class="online-pill">${escHtml(semInfo?.label || node.sem)} · ${node.credits} หน่วยกิต</span>
            </div>
            <h3 style="font-family:var(--font-serif);font-size:1.35rem;font-weight:700;color:var(--label);margin-bottom:2px">
              ${escHtml(node.code)}: ${escHtml(node.nameTh)}
            </h3>
            <div style="font-size:12px;color:var(--label-3);font-weight:500">${escHtml(node.name)}</div>
          </div>
          <button id="graph-inspector-close" style="width:28px;height:28px;border-radius:50%;border:none;background:var(--bg-3);cursor:pointer;color:var(--label-2);font-size:13px">✕</button>
        </div>

        <p style="font-size:13px;color:var(--label-2);line-height:1.55;margin:4px 0">
          ${escHtml(node.desc)}
        </p>

        <!-- Prerequisite & Unlock Chains -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px;border-top:1px solid var(--sep);padding-top:10px">
          <div>
            <div style="font-size:11.5px;font-weight:700;color:#059669;margin-bottom:6px;display:flex;align-items:center;gap:4px">
              ⬅️ วิชาบังคับก่อน (Prerequisites):
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${directPrereqs.length > 0 ? directPrereqs.map(p => `
                <button class="graph-inspector-chip" data-id="${p.id}" style="padding:4px 10px;border-radius:var(--r-pill);border:1px solid #10b981;background:rgba(16,185,129,0.08);color:#059669;font-size:11.5px;font-weight:600;cursor:pointer">
                  ${escHtml(p.code)} ${escHtml(p.nameTh)}
                </button>
              `).join('') : '<span style="font-size:12px;color:var(--label-3)">ไม่มีวิชาบังคับก่อน (เริ่มต้นเรียนได้ทันที)</span>'}
            </div>
          </div>

          <div>
            <div style="font-size:11.5px;font-weight:700;color:#2563eb;margin-bottom:6px;display:flex;align-items:center;gap:4px">
              ➡️ วิชาที่ปลดล็อคให้เรียนต่อ (Unlocks / Next Courses):
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${directUnlocks.length > 0 ? directUnlocks.map(u => `
                <button class="graph-inspector-chip" data-id="${u.id}" style="padding:4px 10px;border-radius:var(--r-pill);border:1px solid #3b82f6;background:rgba(59,130,246,0.08);color:#2563eb;font-size:11.5px;font-weight:600;cursor:pointer">
                  ${escHtml(u.code)} ${escHtml(u.nameTh)}
                </button>
              `).join('') : '<span style="font-size:12px;color:var(--label-3)">วิชาระดับสูง / ปริญญานิพนธ์ปีสุดท้าย</span>'}
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('graph-inspector-close')?.addEventListener('click', clearGraphSelection);
    container.querySelectorAll('.graph-inspector-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const targetId = chip.dataset.id;
        if (targetId) selectGraphNode(targetId);
      });
    });
  }

  // ─── Edit Modal (9th Verbatim) ───────────────────────────
  function openEditModal(dayKey, blockId, allBlocks) {
    const block = allBlocks.find(b => b.id === blockId);
    if (!block) return;
    state.editingBlock = { dayKey, blockId, block };
    const modal = document.getElementById('edit-modal');
    if (!modal) return;

    const tagOptions = Object.entries(TAGS).map(([key, t]) => `
      <div class="tag-option ${block.tag === key ? 'selected' : ''}" data-tag="${key}" 
        style="${block.tag === key ? `box-shadow:0 0 0 2px ${t.color};background:${t.bg};color:${t.color}` : ''}">
        ${t.emoji} ${t.label}
      </div>`).join('');

    modal.querySelector('.modal-body').innerHTML = `
      <div class="form-group">
        <label class="form-label">หัวข้อ</label>
        <input id="edit-title" class="form-input" type="text" value="${escHtml(block.title)}"/>
      </div>
      <div class="form-group">
        <label class="form-label">ชื่อย่อ / ห้องเรียน</label>
        <input id="edit-subtitle" class="form-input" type="text" value="${escHtml(block.subtitle||'')}"/>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">เวลาเริ่ม</label>
          <input id="edit-start" class="form-input" type="time" value="${block.start}"/>
        </div>
        <div class="form-group">
          <label class="form-label">เวลาสิ้นสุด</label>
          <input id="edit-end" class="form-input" type="time" value="${block.end}"/>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">หมวดหมู่</label>
        <div class="tag-selector" id="edit-tag-selector">${tagOptions}</div>
      </div>
      <div class="form-group">
        <label class="form-label">หมายเหตุ</label>
        <textarea id="edit-notes" class="form-textarea">${escHtml(block.notes||'')}</textarea>
      </div>
    `;

    modal.querySelector('#edit-tag-selector').addEventListener('click', e => {
      const opt = e.target.closest('.tag-option');
      if (!opt) return;
      modal.querySelectorAll('.tag-option').forEach(o => {
        o.classList.remove('selected');
        o.style.boxShadow = ''; o.style.background = ''; o.style.color = '';
      });
      const t = TAGS[opt.dataset.tag];
      opt.classList.add('selected');
      opt.style.boxShadow = `0 0 0 2px ${t.color}`;
      opt.style.background = t.bg; opt.style.color = t.color;
    });

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function saveEdit() {
    if (!state.editingBlock) return;
    const { dayKey, blockId, block } = state.editingBlock;
    const modal = document.getElementById('edit-modal');
    const title    = modal.querySelector('#edit-title')?.value || '';
    const subtitle = modal.querySelector('#edit-subtitle')?.value || '';
    const start    = modal.querySelector('#edit-start')?.value || '';
    const end      = modal.querySelector('#edit-end')?.value || '';
    const notes    = modal.querySelector('#edit-notes')?.value || '';
    const selectedTag = modal.querySelector('.tag-option.selected')?.dataset.tag || 'break';

    const day = ROUTINES[dayKey];
    const isBaseRoutine = day && day.blocks.some(b => b.id === blockId);
    const isLiveClass = blockId.startsWith('live-class-');
    if (!state.customBlocks[dayKey]) state.customBlocks[dayKey] = [];

    if (isBaseRoutine || isLiveClass) {
      const override = state.customBlocks[dayKey].find(b => b.id === blockId);
      if (override) {
        Object.assign(override, { title, subtitle, start, end, notes, tag: selectedTag });
      } else {
        const base = isBaseRoutine ? day.blocks.find(b => b.id === blockId) : block;
        state.customBlocks[dayKey].push({ ...(base || {}), id: blockId, title, subtitle, start, end, notes, tag: selectedTag, _override: true });
      }
    } else {
      const custom = state.customBlocks[dayKey].find(b => b.id === blockId);
      if (custom) {
        Object.assign(custom, { title, subtitle, start, end, notes, tag: selectedTag });
      } else {
        state.customBlocks[dayKey].push({ ...(block || {}), id: blockId, title, subtitle, start, end, notes, tag: selectedTag });
      }
    }

    saveCustomBlocks();
    closeModal('edit-modal');
    showToast('💾 บันทึกแล้ว!', 'success');
    renderTimeline(dayKey);
  }

  function deleteBlock() {
    if (!state.editingBlock) return;
    const { dayKey, blockId } = state.editingBlock;
    if (!state.customBlocks[dayKey]) state.customBlocks[dayKey] = [];
    const day = ROUTINES[dayKey];
    const isWitchaya = isWitchayaUser();
    const isBaseRoutine = isWitchaya && day && day.blocks.some(b => b.id === blockId);
    const isLiveClass = blockId.startsWith('live-class-');
    if (isBaseRoutine || isLiveClass) {
      showToast('ไม่สามารถลบวิชาหลักจากตารางวันได้ (กรุณาแก้ไขในหน้า Curriculum)', 'warning');
      return;
    }
    state.customBlocks[dayKey] = state.customBlocks[dayKey].filter(b => b.id !== blockId);
    saveCustomBlocks();
    closeModal('edit-modal');
    showToast('🗑️ ลบแล้ว', 'info');
    renderTimeline(dayKey);
  }

  // ─── Add Modal (9th Verbatim) ────────────────────────────
  function openAddModal(dayKey) {
    state.addingDay = dayKey;
    const modal = document.getElementById('add-modal');
    if (!modal) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const timeEnd = minutesToHHMM(now.getHours() * 60 + now.getMinutes() + 60);

    const tagOptions = Object.entries(TAGS).map(([key, t]) => `
      <div class="tag-option ${key === 'break' ? 'selected' : ''}" data-tag="${key}"
        style="${key === 'break' ? `box-shadow:0 0 0 2px ${t.color};background:${t.bg};color:${t.color}` : ''}">
        ${t.emoji} ${t.label}
      </div>`).join('');

    modal.querySelector('.modal-body').innerHTML = `
      <div class="form-group">
        <label class="form-label">หัวข้อ</label>
        <input id="add-title" class="form-input" type="text" placeholder="เช่น อ่านหนังสือ GenPhy"/>
      </div>
      <div class="form-group">
        <label class="form-label">ชื่อย่อ / สถานที่</label>
        <input id="add-subtitle" class="form-input" type="text" placeholder="เช่น ห้องสมุด"/>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">เวลาเริ่ม</label>
          <input id="add-start" class="form-input" type="time" value="${timeStr}"/>
        </div>
        <div class="form-group">
          <label class="form-label">เวลาสิ้นสุด</label>
          <input id="add-end" class="form-input" type="time" value="${timeEnd}"/>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">หมวดหมู่</label>
        <div class="tag-selector" id="add-tag-selector">${tagOptions}</div>
      </div>
      <div class="form-group">
        <label class="form-label">หมายเหตุ</label>
        <textarea id="add-notes" class="form-textarea" placeholder="หมายเหตุเพิ่มเติม..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="add-is-study" style="width:16px;height:16px;cursor:pointer" />
          <span>เป็นบล็อกอ่านหนังสือ (มี Checklist ให้ติ๊ก)</span>
        </label>
      </div>
    `;

    modal.querySelector('#add-tag-selector').addEventListener('click', e => {
      const opt = e.target.closest('.tag-option');
      if (!opt) return;
      modal.querySelectorAll('#add-tag-selector .tag-option').forEach(o => {
        o.classList.remove('selected'); o.style.boxShadow = ''; o.style.background = ''; o.style.color = '';
      });
      const t = TAGS[opt.dataset.tag];
      opt.classList.add('selected');
      opt.style.boxShadow = `0 0 0 2px ${t.color}`;
      opt.style.background = t.bg; opt.style.color = t.color;
    });

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function saveNewBlock() {
    const dayKey = state.addingDay;
    if (!dayKey) return;
    const modal = document.getElementById('add-modal');
    const title    = modal.querySelector('#add-title')?.value || '';
    const subtitle = modal.querySelector('#add-subtitle')?.value || '';
    const start    = modal.querySelector('#add-start')?.value || '';
    const end      = modal.querySelector('#add-end')?.value || '';
    const notes    = modal.querySelector('#add-notes')?.value || '';
    const tag      = modal.querySelector('#add-tag-selector .tag-option.selected')?.dataset.tag || 'break';
    const isStudy  = modal.querySelector('#add-is-study')?.checked || false;

    if (!title || !start || !end) { showToast('กรุณากรอกข้อมูลให้ครบ', 'warning'); return; }

    const newBlock = {
      id: `custom-${dayKey}-${Date.now()}`,
      start, end, title, subtitle, tag, notes,
      isCustom: true
    };
    if (isStudy) {
      newBlock.isStudyBlock = true;
      newBlock.studyBlockIndex = 0;
    }
    if (!state.customBlocks[dayKey]) state.customBlocks[dayKey] = [];
    state.customBlocks[dayKey].push(newBlock);
    saveCustomBlocks();
    closeModal('add-modal');
    showToast('เพิ่มกิจกรรมแล้ว!', 'success');
    renderTimeline(dayKey);
  }

  // ─── Modal Helpers ───────────────────────────────────────
  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    state.editingBlock = null;
    state.addingDay = null;
  }

  // ─── Toast (9th Verbatim) ────────────────────────────────
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // ─── Clock ───────────────────────────────────────────────
  function updateClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const now = new Date();
    el.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  }

  function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
  }

  // ─── Event Listeners ─────────────────────────────────────
  function setupGlobalEventListeners() {
    // Top-level Navigation Links
    document.querySelectorAll('.nav-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        if (view) switchTopView(view);
      });
    });

    // Mobile Navigation Links
    document.querySelectorAll('.mob-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        if (view) switchTopView(view);
      });
    });

    // Hero CTAs & Features Clickable
    document.querySelectorAll('.hero-section [data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        if (view) switchTopView(view);
      });
    });

    // Brand Logo -> Home
    document.getElementById('brand-logo-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      switchTopView('home');
    });

    // Sub-nav Segmented Control Buttons (Timeline / Week / Schedule)
    document.querySelectorAll('.sub-seg-wrap .nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const subview = e.currentTarget.dataset.view;
        if (subview) switchDashboardView(subview);
      });
    });

    // Calendar & Auth & Push header buttons
    document.getElementById('push-notify-btn')?.addEventListener('click', () => {
      openPushModal();
    });

    document.getElementById('calendar-sync-btn')?.addEventListener('click', () => openCalendarModal());
    document.getElementById('auth-user-btn')?.addEventListener('click', () => openAuthModal());

    // Theme toggles
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('mob-theme-toggle')?.addEventListener('click', toggleTheme);
  }

  function setup9thEventListeners() {
    // Edit modal
    document.getElementById('edit-save-btn')?.addEventListener('click', saveEdit);
    document.getElementById('edit-delete-btn')?.addEventListener('click', deleteBlock);
    document.getElementById('edit-cancel-btn')?.addEventListener('click', () => closeModal('edit-modal'));
    document.getElementById('edit-cancel-action-btn')?.addEventListener('click', () => closeModal('edit-modal'));
    document.getElementById('edit-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal('edit-modal');
    });

    // Add modal
    document.getElementById('add-save-btn')?.addEventListener('click', saveNewBlock);
    document.getElementById('add-cancel-btn')?.addEventListener('click', () => closeModal('add-modal'));
    document.getElementById('add-cancel-action-btn')?.addEventListener('click', () => closeModal('add-modal'));
    document.getElementById('add-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal('add-modal');
    });

    // Cloud Sync header button
    document.getElementById('cloud-sync-btn')?.addEventListener('click', async () => {
      const modal = document.getElementById('sync-modal');
      const input = document.getElementById('sync-key-input');
      const key = CloudSync.getSyncKey();

      if (input) input.value = key;
      CloudSync.updateUIStatus();
      if (modal) modal.classList.add('open');
      document.body.style.overflow = 'hidden';

      if (key) {
        showToast('กำลังเชื่อมต่อและซิงค์ข้อมูลกับ Cloud...', 'info');
        const pullRes = await CloudSync.pullFromCloud();
        if (pullRes && pullRes.ok) {
          if (pullRes.notFound || !pullRes.data) {
            const pushRes = await CloudSync.pushToCloud(state);
            if (pushRes.ok) showToast('สร้างฐานข้อมูลบน Cloud เรียบร้อย', 'success');
            else showToast('ไม่สามารถสร้างฐานข้อมูลบน Cloud ได้', 'error');
          } else {
            const syncRes = syncSmartWithCloud(pullRes.data);
            if (syncRes === 'pulled' || syncRes === 'merged') {
              if (state.currentTopView === 'dashboard') renderDashboardCurrentView();
              else if (state.currentTopView === 'study') renderStudyView();
              showToast('ดึงข้อมูลล่าสุดจาก Cloud มาอัปเดตเครื่องนี้แล้ว!', 'success');
            } else if (syncRes === 'pushed') {
              showToast('ข้อมูลในเครื่องนี้ล่าสุดกว่า! อัปเดตขึ้น Cloud เรียบร้อย', 'success');
            } else {
              showToast('ข้อมูลตรงกันกับ Cloud เรียบร้อย', 'success');
            }
          }
        } else {
          if (pullRes && pullRes.reason === 'busy') {
            showToast('ระบบกำลังซิงค์อยู่แล้ว โปรดรอสักครู่', 'warning');
          } else {
            showToast('ขาดการเชื่อมต่อกับ Cloud หรือ Server ไม่ตอบสนอง', 'error');
          }
        }
      }
    });

    document.getElementById('sync-cancel-btn')?.addEventListener('click', () => closeModal('sync-modal'));
    document.getElementById('sync-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal('sync-modal');
    });

    // Connect & Sync button
    document.getElementById('sync-connect-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('sync-key-input');
      const key = input?.value.trim();
      if (!key) {
        showToast('กรุณากรอก Sync Key', 'warning');
        return;
      }
      CloudSync.setSyncKey(key);
      showToast('กำลังเชื่อมต่อ Cloud...', 'info');

      const pullRes = await CloudSync.pullFromCloud();
      if (pullRes.ok) {
        if (pullRes.data) {
          const syncRes = syncSmartWithCloud(pullRes.data);
          if (syncRes === 'pulled' || syncRes === 'merged') {
            if (state.currentTopView === 'dashboard') renderDashboardCurrentView();
            else if (state.currentTopView === 'study') renderStudyView();
            showToast(`✅ เชื่อมต่อและดึงข้อมูลจาก Cloud แล้ว (Key: ${key})`, 'success');
          } else if (syncRes === 'pushed') {
            showToast(`✅ ข้อมูลในเครื่องนี้ล่าสุดกว่า! อัปเดตขึ้น Cloud แล้ว (Key: ${key})`, 'success');
          } else {
            showToast(`✅ เชื่อมต่อสำเร็จ ข้อมูลตรงกันกับ Cloud แล้ว (Key: ${key})`, 'success');
          }
        } else if (pullRes.notFound) {
          const pushRes = await CloudSync.pushToCloud(state);
          if (pushRes.ok) {
            showToast(`✅ สร้าง Sync Key บน Cloud เรียบร้อย (Key: ${key})`, 'success');
          } else {
            showToast(`⚠️ สร้าง Key แล้ว แต่บันทึกข้อมูลไม่สำเร็จ`, 'warning');
          }
        }
      } else {
        showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (บันทึกไว้ในเครื่องเรียบร้อย)', 'warning');
      }
      closeModal('sync-modal');
    });

    // Force Pull button
    document.getElementById('sync-force-pull-btn')?.addEventListener('click', async () => {
      const key = CloudSync.getSyncKey();
      if (!key) {
        showToast('ยังไม่ได้ตั้งค่า Sync Key', 'warning');
        return;
      }
      showToast('กำลังดึงข้อมูลจาก Cloud...', 'info');
      const pullRes = await CloudSync.pullFromCloud();
      if (pullRes.ok && pullRes.data) {
        applyCloudData(pullRes.data);
        if (state.currentTopView === 'dashboard') renderDashboardCurrentView();
        else if (state.currentTopView === 'study') renderStudyView();
        showToast('ดึงข้อมูลล่าสุดจาก Cloud มาอัปเดตเครื่องนี้แล้ว!', 'success');
        closeModal('sync-modal');
      } else if (pullRes.notFound) {
        showToast('ℹ️ ยังไม่มีข้อมูลบน Cloud สำหรับ Key นี้', 'info');
      } else {
        showToast('ไม่สามารถดึงข้อมูลได้ โปรดตรวจสอบการเชื่อมต่อ', 'warning');
      }
    });

    // Force Push button
    document.getElementById('sync-force-push-btn')?.addEventListener('click', async () => {
      const key = CloudSync.getSyncKey();
      if (!key) {
        showToast('ยังไม่ได้ตั้งค่า Sync Key', 'warning');
        return;
      }
      showToast('กำลังส่งข้อมูลขึ้น Cloud...', 'info');
      const pushRes = await CloudSync.pushToCloud(state);
      if (pushRes.ok) {
        showToast('ส่งข้อมูลเครื่องนี้ขึ้น Cloud สำเร็จ!', 'success');
        closeModal('sync-modal');
      } else {
        showToast('ส่งข้อมูลขึ้น Cloud ไม่สำเร็จ โปรดลองใหม่', 'warning');
      }
    });

    // Disconnect button
    document.getElementById('sync-disconnect-btn')?.addEventListener('click', () => {
      CloudSync.setSyncKey('');
      showToast('⚪ ยกเลิกการซิงค์ Cloud แล้ว (ใช้งานเฉพาะในเครื่อง)', 'info');
      closeModal('sync-modal');
    });

    // In-App Preview modal
    document.getElementById('preview-close-btn')?.addEventListener('click', () => closeModal('preview-modal'));
    document.getElementById('preview-back-btn')?.addEventListener('click', () => closeModal('preview-modal'));
    document.getElementById('preview-footer-back-btn')?.addEventListener('click', () => closeModal('preview-modal'));
    document.getElementById('preview-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal('preview-modal');
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeModal('edit-modal');
        closeModal('add-modal');
        closeModal('sync-modal');
        closeModal('preview-modal');
        closeModal('resource-modal');
        closeModal('study-toolkit-modal');
      }
    });

    // ─── Study Toolkit Event Listeners ───
    window.openStudyToolkitModal = async function() {
      populateToolkitOptions();
      openModal('study-toolkit-modal');
      const statusBanner = document.getElementById('tk-engine-status-banner');
      const fallback = document.getElementById('tk-offline-fallback');

      if (statusBanner) {
        statusBanner.innerHTML = '<span style="color:var(--label-2);font-size:11.5px">⏳ กำลังตรวจสอบ OmniLoad Engine...</span>';
      }

      try {
        const r = await fetch('/api/study-tools/status', { signal: AbortSignal.timeout(5000) });
        const d = await r.json();

        if (d.connected) {
          if (statusBanner) {
            statusBanner.innerHTML = '<span style="color:#22c55e;font-weight:700;font-size:11.5px">🟢 OmniLoad Engine พร้อมใช้งาน</span>' +
              (d.isProduction ? '<span style="font-size:11px;color:var(--label-2);background:var(--bg-3);padding:2px 8px;border-radius:12px;border:1px solid var(--sep)">☁️ Railway Cloud</span>' : '<a href="http://localhost:8000" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);font-weight:600;text-decoration:none">↗ localhost:8000</a>');
          }
          const tabNav = document.querySelector('.tk-tab-nav');
          if (tabNav) tabNav.style.display = 'grid';
          if (fallback) fallback.style.display = 'none';
          window.switchToolkitTab('media');
        } else {
          throw d;
        }
      } catch (err) {
        const isProd = err && err.isProduction;
        if (statusBanner) {
          statusBanner.innerHTML = isProd
            ? '<span style="color:#f59e0b;font-weight:700;font-size:11.5px">🟡 กำลังรอเชื่อมต่อ OmniLoad บน Railway...</span>'
            : '<span style="color:#f59e0b;font-weight:700;font-size:11.5px">🔴 OmniLoad Engine ออฟไลน์ (local ยังไม่เปิด)</span>';
        }
        const tabNav = document.querySelector('.tk-tab-nav');
        if (tabNav) tabNav.style.display = 'none';
        const mediaPanel = document.getElementById('tk-panel-media');
        const pdfPanel = document.getElementById('tk-panel-pdf');
        if (mediaPanel) mediaPanel.style.display = 'none';
        if (pdfPanel) pdfPanel.style.display = 'none';
        if (fallback) {
          fallback.style.display = 'block';
          if (isProd) {
            fallback.innerHTML = `
              <div style="font-size:32px;margin-bottom:8px">☁️</div>
              <div style="font-size:14px;font-weight:700;color:var(--label);margin-bottom:6px">กำลังรอเชื่อมต่อ OmniLoad บน Railway</div>
              <p style="font-size:12px;color:var(--label-2);margin-bottom:16px;line-height:1.5">
                ระบบกำลังเชื่อมต่อกับ <strong>Service 12</strong> ผ่าน Railway Private Network<br/>
                หากเพิ่งกด Deploy โปรดรอ 1-2 นาทีให้ Service 12 บูตเสร็จสมบูรณ์ แล้วกดปุ่มลองใหม่
              </p>
              <div style="display:flex;gap:8px;justify-content:center">
                <button onclick="window.openStudyToolkitModal()" class="btn btn-primary" style="font-size:12px;padding:8px 16px">
                  🔄 ลองใหม่ (Recheck Status)
                </button>
              </div>
            `;
          }
        }
      }
    };

    document.getElementById('study-toolkit-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.openStudyToolkitModal();
    });

    document.getElementById('study-toolkit-close')?.addEventListener('click', () => closeModal('study-toolkit-modal'));
    document.getElementById('study-toolkit-cancel-btn')?.addEventListener('click', () => closeModal('study-toolkit-modal'));
    document.getElementById('study-toolkit-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal('study-toolkit-modal');
    });
  }

  // ─── Study Toolkit (OmniLoad Engine Integration) ───────────
  window.switchToolkitTab = function(tab) {
    const mediaTabBtn = document.getElementById('tk-tab-media-btn');
    const pdfTabBtn = document.getElementById('tk-tab-pdf-btn');
    const mediaPanel = document.getElementById('tk-panel-media');
    const pdfPanel = document.getElementById('tk-panel-pdf');

    if (tab === 'media') {
      if (mediaTabBtn) { mediaTabBtn.style.background = 'var(--accent)'; mediaTabBtn.style.color = '#fff'; }
      if (pdfTabBtn) { pdfTabBtn.style.background = 'transparent'; pdfTabBtn.style.color = 'var(--label-2)'; }
      if (mediaPanel) mediaPanel.style.display = 'block';
      if (pdfPanel) pdfPanel.style.display = 'none';
    } else {
      if (pdfTabBtn) { pdfTabBtn.style.background = 'var(--accent)'; pdfTabBtn.style.color = '#fff'; }
      if (mediaTabBtn) { mediaTabBtn.style.background = 'transparent'; mediaTabBtn.style.color = 'var(--label-2)'; }
      if (pdfPanel) pdfPanel.style.display = 'block';
      if (mediaPanel) mediaPanel.style.display = 'none';
    }
  };

  function populateToolkitOptions() {
    // 1. Populate Course dropdown
    const courseSelect = document.getElementById('tk-media-course');
    if (courseSelect) {
      const curriculum = state.curriculum || [];
      const seen = new Set();
      let opts = '<option value="">(ไฟล์ทั่วไป / คลังรวม)</option>';
      curriculum.forEach(c => {
        if (c && c.code && !seen.has(c.code)) {
          seen.add(c.code);
          opts += `<option value="${escHtml(c.code)}">${escHtml(c.code)}: ${escHtml(c.name || '')}</option>`;
        }
      });
      courseSelect.innerHTML = opts;
    }

    // 2. Populate PDF source dropdown
    const pdfSelect = document.getElementById('tk-pdf-source');
    if (pdfSelect) {
      const links = state.studyLinks || [];
      const pdfs = links.filter(l => (l.url && l.url.toLowerCase().endsWith('.pdf')) || l.type === 'pdf');
      if (pdfs.length === 0) {
        pdfSelect.innerHTML = '<option value="">-- ยังไม่มีไฟล์ PDF ในระบบ (อัปโหลดที่แท็บ Study ก่อน) --</option>';
      } else {
        pdfSelect.innerHTML = pdfs.map(p => `<option value="${escHtml(p.url)}">${escHtml(p.title || p.url)}</option>`).join('');
      }
    }
  }

  window.startToolkitMediaImport = async function() {
    const urlInput = document.getElementById('tk-media-url');
    const url = urlInput?.value.trim();
    const formatType = document.getElementById('tk-media-format')?.value || 'mp4';
    const courseCode = document.getElementById('tk-media-course')?.value || '';
    const customTitle = document.getElementById('tk-media-title')?.value.trim() || '';
    const statusEl = document.getElementById('tk-media-status');
    const btn = document.getElementById('tk-import-btn');

    if (!url) {
      showToast('กรุณาวางลิงก์วิดีโอหรือเสียงที่ต้องการนำเข้า', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '⏳ กำลังดาวน์โหลดและบันทึกเข้า Cloud...';
    if (statusEl) statusEl.innerHTML = '⚡ กำลังสั่งการ OmniLoad Engine ดาวน์โหลดมีเดีย...';

    try {
      const res = await fetch('/api/study-tools/import-media', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(CloudSync.getAuthToken() ? { 'Authorization': `Bearer ${CloudSync.getAuthToken()}` } : {})
        },
        body: JSON.stringify({
          url,
          formatType,
          courseCode,
          customTitle,
          syncKey: CloudSync.getSyncKey()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'นำเข้าสื่อไม่สำเร็จ');
      }

      showToast(`🎉 บันทึกสื่อ "${data.title}" เข้าคลังเรียบร้อยแล้ว!`, 'success');
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);font-weight:700">✅ สำเร็จ: บันทึกเข้าคลังไฟล์แล้ว</span>`;

      // Refresh Study / Resource view
      if (data.studyLink) {
        if (!state.studyLinks) state.studyLinks = [];
        state.studyLinks.unshift(data.studyLink);
        if (state.currentTopView === 'study') renderStudyView();
      }

      urlInput.value = '';
      setTimeout(() => closeModal('study-toolkit-modal'), 1200);

    } catch (err) {
      showToast(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
      if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444">❌ ${err.message}</span>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🚀 เริ่มดาวน์โหลดและบันทึกเข้าคลังวิชา';
    }
  };

  window.startToolkitPdfConversion = async function() {
    const pdfSelect = document.getElementById('tk-pdf-source');
    const fileUrl = pdfSelect?.value;
    const format = document.getElementById('tk-pdf-format')?.value || 'jpg';
    const dpi = document.getElementById('tk-pdf-dpi')?.value || '150';
    const statusEl = document.getElementById('tk-pdf-status');
    const resultsEl = document.getElementById('tk-pdf-results');
    const btn = document.getElementById('tk-convert-pdf-btn');

    if (!fileUrl) {
      showToast('กรุณาเลือกไฟล์ PDF ที่ต้องการแปลง', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '⏳ กำลังแปลงหน้าสไลด์...';
    if (statusEl) statusEl.innerHTML = '⚡ กำลังประมวลผล PyMuPDF Engine...';
    if (resultsEl) resultsEl.style.display = 'none';

    try {
      const res = await fetch('/api/study-tools/convert-pdf-to-slides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(CloudSync.getAuthToken() ? { 'Authorization': `Bearer ${CloudSync.getAuthToken()}` } : {})
        },
        body: JSON.stringify({
          fileUrl,
          format,
          dpi,
          syncKey: CloudSync.getSyncKey()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'การแปลง PDF ล้มเหลว');
      }

      showToast(`📑 แปลงเสร็จสิ้น ${data.totalPages} หน้า!`, 'success');
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);font-weight:700">✅ แปลงสำเร็จ ${data.totalPages} หน้า:</span>`;

      if (resultsEl && data.pages) {
        resultsEl.style.display = 'grid';
        resultsEl.innerHTML = data.pages.map(p => `
          <div style="border:1px solid var(--sep);border-radius:var(--r-s);overflow:hidden;background:var(--bg-1);text-align:center">
            <a href="${p.url}" target="_blank">
              <img src="${p.url}" alt="Page ${p.page}" style="width:100%;height:60px;object-fit:contain;background:#000" />
            </a>
            <div style="font-size:10px;font-weight:700;padding:2px;color:var(--label)">หน้า ${p.page}</div>
          </div>
        `).join('');
      }

    } catch (err) {
      showToast(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
      if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444">❌ ${err.message}</span>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '📑 แปลง PDF เป็นภาพสไลด์เดี๋ยวนี้';
    }
  };

  // ─── Escape HTML ─────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Expose & Start ──────────────────────────────────────
  window.APP = {
    switchTopView,
    switchDashboardView,
    selectDay: key => {
      state.currentDay = key;
      renderDayTabs();
      renderTimeline(key);
    }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
