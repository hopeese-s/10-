// ============================================================
// app.js — EgBE Memory Engine & Daily Study Dashboard
// Combined Application Logic (9th Functional Engine + 3rd UI/UX)
// ============================================================

(function () {
  'use strict';

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
    studyLinks: []
  };

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

    // Cloud Sync initial smart sync
    if (window.CloudSync && CloudSync.getSyncKey()) {
      const pullRes = await CloudSync.pullFromCloud();
      if (pullRes && pullRes.ok && pullRes.data) {
        syncSmartWithCloud(pullRes.data);
      }
    }
    if (window.CloudSync) CloudSync.updateUIStatus();

    setupGlobalEventListeners();
    setup9thEventListeners();
    startClock();
    startTimeIndicator();

    // Render initial views
    renderDayTabs();
    switchTopView('home');

    // Auto sync background polling & BroadcastChannel (Instant real-time update)
    if (window.CloudSync) {
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

    const cloudIsNewer = cloudData.version !== undefined && cloudData.version > state.version;
    const cloudTimeNewer = cloudData.updatedAt && state.updatedAt && cloudData.updatedAt > state.updatedAt;
    const dataDifferent = (currentChecklistJson !== cloudChecklistJson) ||
                          (currentSubjectsJson !== cloudSubjectsJson) ||
                          (currentCustomJson !== cloudCustomJson) ||
                          (currentFoldersJson !== cloudFoldersJson) ||
                          (currentLinksJson !== cloudLinksJson);

    if (cloudIsNewer || cloudTimeNewer || dataDifferent) {
      applyCloudData(cloudData);
      reRenderCurrentView();
      return 'pulled';
    }

    // If local is newer, push to cloud
    if (state.version > (cloudData.version || 0)) {
      if (window.CloudSync) {
        CloudSync.pushToCloud(state);
      }
      return 'pushed';
    }

    return 'same';
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
    if (cloudData.checklist)    state.checklist    = cloudData.checklist;
    if (cloudData.subjects)     state.subjects      = cloudData.subjects;
    if (cloudData.customBlocks) state.customBlocks  = cloudData.customBlocks;

    // Folders: take cloud version if non-empty, else keep local
    if (cloudData.studyFolders && Array.isArray(cloudData.studyFolders) && cloudData.studyFolders.length > 0) {
      state.studyFolders = cloudData.studyFolders;
      localStorage.setItem('sd-study-folders', JSON.stringify(state.studyFolders));
    }

    // Links: merge cloud links with DEFAULT_STUDY_LINKS so defaults are never lost
    if (cloudData.studyLinks && Array.isArray(cloudData.studyLinks) && cloudData.studyLinks.length > 0) {
      const cloudIds   = new Set(cloudData.studyLinks.map(l => l.id));
      const defaultIds = new Set(DEFAULT_STUDY_LINKS.map(l => l.id));
      // Defaults not in cloud (new defaults added since last sync)
      const missingDefaults = DEFAULT_STUDY_LINKS.filter(l => !cloudIds.has(l.id));
      // Custom links from cloud (user-added)
      const cloudCustom = cloudData.studyLinks.filter(l => !defaultIds.has(l.id));
      // Cloud versions of defaults
      const cloudDefaults = cloudData.studyLinks.filter(l => defaultIds.has(l.id));
      state.studyLinks = [...cloudDefaults, ...missingDefaults, ...cloudCustom];
      localStorage.setItem('sd-study-links', JSON.stringify(state.studyLinks));
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
      state.checklist    = JSON.parse(localStorage.getItem('sd-checklist') || '{}');
      state.subjects     = JSON.parse(localStorage.getItem('sd-subjects') || '{}');
      state.customBlocks = JSON.parse(localStorage.getItem('sd-custom-blocks') || '{}');

      // Study Folders
      const savedFolders = localStorage.getItem('sd-study-folders');
      if (savedFolders) {
        state.studyFolders = JSON.parse(savedFolders);
      } else {
        state.studyFolders = [...DEFAULT_STUDY_FOLDERS];
      }
      state.selectedFolderId = localStorage.getItem('sd-selected-folder') || 'all';

      // Study Links
      const savedLinks = localStorage.getItem('sd-study-links');
      if (savedLinks) {
        const parsed = JSON.parse(savedLinks);
        if (Array.isArray(parsed) && parsed.length >= DEFAULT_STUDY_LINKS.length) {
          state.studyLinks = parsed;
        } else {
          // Merge custom items with updated DEFAULT_STUDY_LINKS
          const defaultIds = new Set(DEFAULT_STUDY_LINKS.map(l => l.id));
          // Keep ALL non-default items (user-added links use id 'link-TIMESTAMP')
          const customOnly = (Array.isArray(parsed) ? parsed : []).filter(l => !defaultIds.has(l.id));
          state.studyLinks = [...DEFAULT_STUDY_LINKS, ...customOnly];
          saveStudyLinks();
        }
      } else {
        state.studyLinks = [...DEFAULT_STUDY_LINKS];
        saveStudyLinks();
      }
      state.curriculumViewMode = localStorage.getItem('sd-curriculum-mode') || 'grid';
    } catch (e) {
      state.studyFolders = [...DEFAULT_STUDY_FOLDERS];
      state.studyLinks = [...DEFAULT_STUDY_LINKS];
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

  // ─── Day Tabs (9th Verbatim) ──────────────────────────────
  function renderDayTabs() {
    const container = document.getElementById('day-tabs');
    if (!container) return;
    const todayKey = getDayKey(new Date().getDay());
    container.innerHTML = '';
    DAY_ORDER.forEach(key => {
      const day = ROUTINES[key];
      const isToday = key === todayKey;
      const isActive = key === state.currentDay;
      const btn = document.createElement('button');
      btn.className = `day-tab ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}`;
      btn.dataset.day = key;
      btn.innerHTML = `
        <span class="day-tab-short">${day.short}</span>
        <span class="day-tab-en">${day.labelEn.substring(0, 3)}</span>
        <span class="day-tab-status">${day.statusEmoji}</span>
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

    // Merge base blocks + custom blocks (overrides replace, extras are added)
    const customExtra = (state.customBlocks[dayKey] || []);
    const overrideIds = new Set(customExtra.filter(b => b._override).map(b => b.id));
    const baseBlocks = day.blocks.filter(b => !overrideIds.has(b.id));
    const allBlocks = [...baseBlocks, ...customExtra].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    const checkKey = getCheckKey(dayKey);
    const checks = state.checklist[checkKey] || {};
    const subjects = state.subjects[checkKey] || {};

    container.innerHTML = `
      <div class="stats-bar">
        ${renderStatsBar(day, checks)}
      </div>
      <div class="day-banner">
        <div class="day-banner-text">
          <h2>${day.labelEn} · ${day.label}</h2>
          <p>${formatDayDate(dayKey)}</p>
        </div>
        <span class="status-badge ${day.status}">
          ${day.statusEmoji} ${day.statusLabel}
        </span>
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
        ${allBlocks.map((block) => renderBlock(block, day, checks, subjects, dayKey)).join('')}
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
  function renderStatsBar(day, checks) {
    const studyBlocks = day.blocks.filter(b => b.isStudyBlock);
    const totalStudyBlocks = studyBlocks.length;
    const doneBlocks = Object.values(checks).filter(Boolean).length;
    const pct = totalStudyBlocks > 0
      ? Math.round((doneBlocks / totalStudyBlocks) * 100)
      : (day.studyMinutes === 0 ? 100 : 0);

    const sleepH = Math.floor(day.sleepMinutes / 60);
    const sleepM = day.sleepMinutes % 60;
    const studyH = Math.floor(day.studyMinutes / 60);
    const studyM = day.studyMinutes % 60;
    const studyLabel = day.studyMinutes === 0 ? 'พักผ่อน'
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
    DAY_ORDER.forEach(key => {
      const day = ROUTINES[key];
      const studyBlocks = day.blocks.filter(b => b.isStudyBlock);
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
    if (state.checklist[ck][k]) showToast('✅ ทำครบแล้ว! ดีมาก 🎉', 'success');
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
        const customExtra = state.customBlocks[state.currentDay] || [];
        const overrideIds = new Set(customExtra.filter(b => b._override).map(b => b.id));
        const baseBlocks = day.blocks.filter(b => !overrideIds.has(b.id));
        const allBlocks = [...baseBlocks, ...customExtra].sort((a,b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        updateTimeIndicator(state.currentDay, allBlocks);
      }
    }, 30000);
  }

  // ─── Class Schedule (9th Verbatim) ───────────────────────
  function renderSchedule() {
    const container = document.getElementById('view-schedule');
    if (!container) return;

    const days = ['monday','tuesday','wednesday','thursday','friday'];
    const dayLabels = { monday:'จ. (Mon)', tuesday:'อ. (Tue)', wednesday:'พ. (Wed)', thursday:'พฤ. (Thu)', friday:'ศ. (Fri)' };
    const todayKey = getDayKey(new Date().getDay());

    let classListHtml = '';
    days.forEach(d => {
      const classes = CLASS_SCHEDULE[d] || [];
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
              <div class="wci-meta">📍 ${cls.room} · ⏰ ${cls.start}–${cls.end} · ${cls.type}</div>
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

    container.innerHTML = `
      <div class="schedule-header-row">
        <h2>📆 ตารางเรียน — ภาคเรียนที่ 1/2026 (Program B-BI)</h2>
      </div>
      <div style="background:var(--bg-2);border-radius:var(--r-l);border:1px solid var(--sep);padding:20px 24px;box-shadow:var(--shadow-1)">
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px">
          ${days.map(d => {
            const classes = CLASS_SCHEDULE[d] || [];
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
        ${classListHtml}
      </div>
      <div class="subject-legend">${legendItems}</div>
      <div class="schedule-image-section">
        <img src="egmu-class-schedule-2026-1-program_B-BI.png" alt="ตารางเรียนต้นฉบับ" />
        <div class="schedule-image-caption">📋 ตารางเรียนต้นฉบับ — 1st Year BME · Mahidol University · Semester 1/2026</div>
      </div>
    `;
  }

  // ─── Week Overview (9th Verbatim) ────────────────────────
  function renderWeek() {
    const container = document.getElementById('view-week');
    if (!container) return;
    const todayKey = getDayKey(new Date().getDay());
    const weekStat = calcWeeklyStreak();
    const weekPct = weekStat.total > 0 ? Math.round(weekStat.done / weekStat.total * 100) : 0;

    const dayCards = DAY_ORDER.map(key => {
      const day = ROUTINES[key];
      const ck = getCheckKey(key);
      const checks = state.checklist[ck] || {};
      const studyBlocks = day.blocks.filter(b => b.isStudyBlock);
      const done = Object.values(checks).filter(Boolean).length;
      const classes = CLASS_SCHEDULE[key] || [];
      const isToday = key === todayKey;
      return `
        <div class="week-day-card ${isToday ? 'today' : ''}" data-day="${key}">
          <div class="wdc-day">${day.short} <span style="font-size:10px;color:var(--label-3)">${day.labelEn.substring(0,3)}</span></div>
          <div class="wdc-status">${day.statusEmoji}</div>
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
  function renderCurriculumView() {
    const container = document.getElementById('view-egbe-curriculum');
    if (!container) return;

    const curriculumCourses = [
      { code: 'SCPY161', name: 'General Physics I', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'L2-002', schedule: 'จันทร์ 09:30 - 12:30', desc: 'กลศาสตร์ การเคลื่อนที่ งานและพลังงาน โมเมนตัม การหมุน และคลื่นกล' },
      { code: 'EGBI122', name: 'Computer Programming', credits: '3 (2-2-5)', type: 'บรรยาย + ปฏิบัติการ', room: 'R335/1, R335/2', schedule: 'จันทร์ 13:30 - 17:30', desc: 'หลักการเขียนโปรแกรม โครงสร้างข้อมูล และการประยุกต์ใช้ในงานวิศวกรรมชีวแพทย์' },
      { code: 'LAEN182', name: 'English for General Academic Purposes', credits: '2 (2-0-4)', type: 'บรรยาย', room: 'Room 320', schedule: 'อังคาร 08:30 - 10:30', desc: 'ภาษาอังกฤษเพื่อการสื่อสารเชิงวิชาการ ทักษะการอ่าน เขียน และการนำเสนอ' },
      { code: 'SCBE102', name: 'General Biology Laboratory 1', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'Lab SC', schedule: 'อังคาร 13:30 - 16:30', desc: 'ปฏิบัติการชีววิทยาทั่วไป กล้องจุลทรรศน์ โครงสร้างเซลล์และเนื้อเยื่อ' },
      { code: 'EGBI100', name: 'BME in the Real World', credits: '1 (1-0-2)', type: 'บรรยาย', room: 'R238', schedule: 'อังคาร 17:40 - 18:40', desc: 'บทนำสู่วิศวกรรมชีวแพทย์ เครื่องมือแพทย์ และระบบสาธารณสุขในโลกจริง' },
      { code: 'SCMA101', name: 'Mathematics I', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC1-152', schedule: 'พุธ 09:00 - 11:00', desc: 'แคลคูลัส อนุพันธ์ อินทิกรัล และการประยุกต์ใช้ในทางวิศวกรรมศาสตร์' },
      { code: 'SCSL190', name: 'Wonderful Life (Biology)', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC3-303', schedule: 'พฤหัสบดี 09:30 - 12:30', desc: 'ชีววิทยาของสิ่งมีชีวิต วิวัฒนาการ และความหลากหลายทางชีวภาพ' },
      { code: 'SCCH161', name: 'General Chemistry', credits: '3 (3-0-6)', type: 'บรรยาย', room: 'SC2-323', schedule: 'พฤหัสบดี 13:30 - 16:30', desc: 'เคมีทั่วไป โครงสร้างอะตอม พันธะเคมี จลนศาสตร์ และสมดุลเคมี' },
      { code: 'SCPY111', name: 'Physics Laboratory I', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'Lab SC', schedule: 'ศุกร์ 09:30 - 12:30', desc: 'การทดลองฟิสิกส์พื้นฐาน การวัด ค่าความคลาดเคลื่อน และการวิเคราะห์ผล' },
      { code: 'SCCH169', name: 'Chemistry Laboratory', credits: '1 (0-3-1)', type: 'ปฏิบัติการ', room: 'L2-201', schedule: 'ศุกร์ 13:30 - 16:30', desc: 'ปฏิบัติการเคมี การไตเตรท การสังเคราะห์สาร และการทดสอบคุณสมบัติ' }
    ];

    const isList = state.curriculumViewMode === 'list';

    // Build Content based on view mode
    let contentHtml = '';
    if (isList) {
      // List Mode (Table / Horizontal Row View)
      contentHtml = `
        <div class="curriculum-list-wrap">
          ${curriculumCourses.map(c => {
            const sc = SUBJECT_COLORS[c.code] || { color: 'var(--accent)', bg: 'var(--accent-bg)', emoji: '📘' };
            return `
              <div class="curriculum-list-row">
                <div class="clr-badge-col">
                  <span class="tag-chip" style="background:${sc.bg};color:${sc.color}">
                    ${sc.emoji} ${c.code}
                  </span>
                  <div style="font-size:11px;font-weight:600;color:var(--label-3);margin-top:4px">${c.credits}</div>
                </div>
                <div class="clr-main-col">
                  <h3 style="font-size:14.5px;font-weight:700;color:var(--label);margin-bottom:3px">${escHtml(c.name)} <span style="font-size:12px;font-weight:500;color:var(--label-3)">(${c.type})</span></h3>
                  <p style="font-size:12px;color:var(--label-2);line-height:1.45">${escHtml(c.desc)}</p>
                </div>
                <div class="clr-meta-col">
                  <div style="font-size:12px;font-weight:600;color:var(--label)">📍 ${escHtml(c.room)}</div>
                  <div style="font-size:11.5px;color:var(--label-3);margin-top:2px">⏰ ${escHtml(c.schedule)}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      // Grid Mode (Card Grid View)
      contentHtml = `
        <div class="cards-grid">
          ${curriculumCourses.map(c => {
            const sc = SUBJECT_COLORS[c.code] || { color: 'var(--accent)', bg: 'var(--accent-bg)', emoji: '📘' };
            return `
              <div class="card-item">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                  <span class="tag-chip" style="background:${sc.bg};color:${sc.color}">
                    ${sc.emoji} ${c.code}
                  </span>
                  <span style="font-size:11.5px;font-weight:600;color:var(--label-3)">${c.credits}</span>
                </div>
                <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;color:var(--label)">${escHtml(c.name)}</h3>
                <p style="font-size:12.5px;color:var(--label-2);line-height:1.5;margin-bottom:12px">${escHtml(c.desc)}</p>
                <div style="font-size:11.5px;color:var(--label-3);border-top:1px solid var(--sep);padding-top:10px;display:flex;flex-direction:column;gap:3px">
                  <div>📍 ห้อง: <strong>${escHtml(c.room)}</strong></div>
                  <div>⏰ เวลา: <strong>${escHtml(c.schedule)}</strong></div>
                </div>
              </div>`;
          }).join('')}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="curriculum-header-row">
        <div>
          <h2 style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;margin-bottom:4px">หลักสูตรวิศวกรรมชีวแพทย์ (BME Mahidol 2026)</h2>
          <p style="font-size:13.5px;color:var(--label-2)">โครงสร้างรายวิชาปีที่ 1 ภาคเรียนที่ 1 รวมทั้งสิ้น 21 หน่วยกิต</p>
        </div>
        <div class="view-mode-toggle" aria-label="รูปแบบการแสดงผล">
          <button class="view-mode-btn ${!isList ? 'active' : ''}" data-mode="grid" title="แสดงแบบการ์ด">
            <span>⊞</span> การ์ด (Grid)
          </button>
          <button class="view-mode-btn ${isList ? 'active' : ''}" data-mode="list" title="แสดงแบบรายการ">
            <span>☰</span> รายการ (List)
          </button>
        </div>
      </div>
      ${contentHtml}
    `;

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
  }

  // ─── View 3: Study Resources (Folders, Search, Multi-Page PDF.js, Drag & Drop) ─
  let studySearchQuery = '';
  let studyViewMode = localStorage.getItem('sd-study-mode') || 'grid';

  function renderStudyView() {
    const container = document.getElementById('view-egbe-study');
    if (!container) return;

    if (!state.studyFolders || !Array.isArray(state.studyFolders) || state.studyFolders.length === 0) {
      state.studyFolders = [...DEFAULT_STUDY_FOLDERS];
    }
    const currentFolder = state.selectedFolderId || 'all';
    const query = (studySearchQuery || '').toLowerCase().trim();

    // Filter links
    const filteredLinks = state.studyLinks.filter(item => {
      const matchFolder = (currentFolder === 'all' || item.folderId === currentFolder || (!item.folderId && currentFolder === 'f-notes'));
      const matchQuery = (!query || item.title.toLowerCase().includes(query) || (item.sub && item.sub.toLowerCase().includes(query)) || (item.desc && item.desc.toLowerCase().includes(query)));
      return matchFolder && matchQuery;
    });

    const totalCount = state.studyLinks.length;

    const isListMode = studyViewMode === 'list';

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem;flex-wrap:wrap;gap:1rem">
        <div>
          <h2 style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;margin-bottom:4px">Study Resources &amp; Documents</h2>
          <p style="font-size:13px;color:var(--label-2)">คลังเอกสาร ชีทสรุป Google Classroom และคู่มือ BME พร้อมระบบโฟลเดอร์</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <!-- Grid / List toggle -->
          <div class="view-mode-toggle" aria-label="รูปแบบการแสดงผล">
            <button class="view-mode-btn ${!isListMode ? 'active' : ''}" data-study-mode="grid" title="แสดงแบบการ์ด"><span>⊞</span> Grid</button>
            <button class="view-mode-btn ${isListMode ? 'active' : ''}" data-study-mode="list" title="แสดงแบบรายการ"><span>☰</span> List</button>
          </div>
          <button class="btn btn-secondary" id="create-folder-btn" style="font-size:12.5px;padding:7px 14px;display:inline-flex;align-items:center;gap:6px">
            📁 สร้างโฟลเดอร์
          </button>
          <button class="btn btn-primary" id="add-resource-btn" style="font-size:12.5px;padding:7px 16px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
            ➕ เพิ่มไฟล์ / ลิงค์
          </button>
        </div>
      </div>

      <!-- Search & Status Bar -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
        <div style="position:relative;flex:1;max-width:360px">
          <input type="text" id="study-search-inp" class="form-input" placeholder="🔍 ค้นหาชีทเรียน, รหัสวิชา, หรือ Drive..." value="${escHtml(studySearchQuery)}" style="padding-left:32px;font-size:12.5px;border-radius:var(--r-pill)" />
          <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--label-3);pointer-events:none">🔍</span>
          ${studySearchQuery ? `<button id="study-clear-search" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--label-3);font-size:12px">✕</button>` : ''}
        </div>
        <div style="font-size:11.5px;color:var(--label-3);font-weight:600">
          ${filteredLinks.length} ไฟล์ · กด 📂 เพื่อย้ายโฟลเดอร์
        </div>
      </div>

      <!-- Interactive Folder Navigation Bar (Drop Zones) -->
      <div class="study-folder-bar" id="study-folder-bar">
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

      <!-- File Cards (Grid or List) -->
      ${filteredLinks.length === 0 ? `
        <div style="padding:3rem;text-align:center;color:var(--label-3);background:var(--bg-2);border-radius:var(--r-l);border:1px dashed var(--sep)">
          <div style="font-size:36px;margin-bottom:8px">📂</div>
          <div style="font-weight:600;font-size:14px;color:var(--label-2)">ไม่มีเอกสารในโฟลเดอร์นี้</div>
          <p style="font-size:12.5px;margin-top:4px">กดปุ่ม ➕ เพิ่มไฟล์ / ลิงค์ เพื่อเพิ่มเอกสารใหม่</p>
        </div>
      ` : isListMode ? `
        <div class="study-list-view" id="study-cards-grid">
          ${filteredLinks.map(item => {
            let badgeColor = 'var(--accent)'; let badgeBg = 'var(--accent-bg)'; let typeIcon = '🔗';
            if (item.type === 'classroom') { badgeColor = '#2563eb'; badgeBg = 'rgba(59,130,246,0.12)'; typeIcon = '🎓'; }
            else if (item.type === 'drive') { badgeColor = '#059669'; badgeBg = 'rgba(16,185,129,0.12)'; typeIcon = '📁'; }
            else if (item.type === 'pdf') { badgeColor = '#dc2626'; badgeBg = 'rgba(239,68,68,0.12)'; typeIcon = '📄'; }
            else if (item.type === 'image') { badgeColor = '#d97706'; badgeBg = 'rgba(217,119,6,0.12)'; typeIcon = '🖼️'; }
            else if (item.type === 'local') { badgeColor = '#7c3aed'; badgeBg = 'rgba(124,58,237,0.12)'; typeIcon = '💾'; }
            const isDefault = DEFAULT_STUDY_LINKS.some(d => d.id === item.id);
            const folderName = state.studyFolders.find(f => f.id === item.folderId)?.name || '';
            return `
              <div class="study-list-item study-card" data-id="${item.id}" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:var(--r-m);background:var(--bg-2);border:1px solid var(--sep);cursor:pointer;transition:background 0.15s">
                <span style="font-size:20px;flex:none;width:28px;text-align:center">${typeIcon}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:700;font-size:13.5px;color:var(--label);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(item.title)}</div>
                  <div style="font-size:11px;color:var(--label-3);margin-top:1px">${escHtml(folderName)} ${item.desc ? '· ' + escHtml(item.desc.substring(0,40)) : ''}</div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex:none">
                  <button class="btn btn-secondary preview-trigger-btn" data-id="${item.id}" style="font-size:11px;padding:4px 10px;border-radius:var(--r-pill)">👁️</button>
                  <button class="study-action-btn move-link-btn" data-id="${item.id}" title="ย้ายโฟลเดอร์">📂</button>
                  ${!isDefault ? `<button class="study-action-btn delete-link-btn" data-id="${item.id}" title="ลบ">✕</button>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="cards-grid" id="study-cards-grid">
          ${filteredLinks.map(item => {
            let badgeColor = 'var(--accent)'; let badgeBg = 'var(--accent-bg)'; let typeIcon = '🔗';
            if (item.type === 'classroom') { badgeColor = '#2563eb'; badgeBg = 'rgba(59,130,246,0.12)'; typeIcon = '🎓'; }
            else if (item.type === 'drive') { badgeColor = '#059669'; badgeBg = 'rgba(16,185,129,0.12)'; typeIcon = '📁'; }
            else if (item.type === 'pdf') { badgeColor = '#dc2626'; badgeBg = 'rgba(239,68,68,0.12)'; typeIcon = '📄'; }
            else if (item.type === 'image') { badgeColor = '#d97706'; badgeBg = 'rgba(217,119,6,0.12)'; typeIcon = '🖼️'; }
            else if (item.type === 'local') { badgeColor = '#7c3aed'; badgeBg = 'rgba(124,58,237,0.12)'; typeIcon = '💾'; }
            const isDefault = DEFAULT_STUDY_LINKS.some(d => d.id === item.id);
            return `
              <div class="card-item study-card" data-id="${item.id}" draggable="true" style="display:flex;flex-direction:column;justify-content:space-between;cursor:pointer">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span class="tag-chip" style="background:${badgeBg};color:${badgeColor};font-weight:700">${typeIcon} ${escHtml((item.type === 'local' ? 'UPLOAD' : item.type || 'LINK').toUpperCase())}</span>
                    <div class="study-card-actions">
                      <button class="study-action-btn move-link-btn" data-id="${item.id}" title="ย้ายโฟลเดอร์">📂</button>
                      ${!isDefault ? `<button class="study-action-btn delete-link-btn" data-id="${item.id}" title="ลบ">✕</button>` : ''}
                    </div>
                  </div>
                  <h3 style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--label);line-height:1.35">${escHtml(item.title)}</h3>
                  ${item.sub ? `<div style="font-size:11.5px;color:var(--label-3);font-weight:600;margin-bottom:6px">${escHtml(item.sub)}</div>` : ''}
                  <p style="font-size:12.5px;color:var(--label-2);line-height:1.5">${escHtml(item.desc || '')}</p>
                </div>
                <div style="margin-top:14px;border-top:1px solid var(--sep);padding-top:10px;display:flex;align-items:center;justify-content:space-between">
                  <button class="btn btn-secondary preview-trigger-btn" data-id="${item.id}" style="font-size:11.5px;padding:5px 12px;border-radius:var(--r-pill);flex:none">👁️ ดูตัวอย่าง</button>
                  ${item.type !== 'local' ? `<a href="${escHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="resource-open-link" style="font-size:11.5px;color:var(--accent);font-weight:600;text-decoration:none">เปิดตรง ↗</a>` : '<span style="font-size:11px;color:var(--label-3)">ไฟล์ในเครื่อง</span>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;

    // Grid/List toggle
    container.querySelectorAll('[data-study-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        studyViewMode = btn.dataset.studyMode;
        localStorage.setItem('sd-study-mode', studyViewMode);
        renderStudyView();
      });
    });

    // Folder selection
    container.querySelectorAll('.study-folder-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        if (e.target.closest('.folder-del-btn')) return;
        const fId = pill.dataset.folder;
        if (fId) {
          state.selectedFolderId = fId;
          localStorage.setItem('sd-selected-folder', fId);
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

    // Preview button click
    container.querySelectorAll('.preview-trigger-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = state.studyLinks.find(l => l.id === id);
        if (item) openResourcePreview(item);
      });
    });

    // Delete link button
    container.querySelectorAll('.delete-link-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        state.studyLinks = state.studyLinks.filter(l => l.id !== id);
        saveStudyLinks();
        renderStudyView();
        showToast('🗑️ ลบเอกสารแล้ว', 'info');
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
          showToast('⚠️ กรุณากรอกชื่อโฟลเดอร์', 'warning');
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
        showToast('✅ สร้างโฟลเดอร์ใหม่สำเร็จ!', 'success');
      };
    }

    document.getElementById('folder-modal-close')?.addEventListener('click', () => closeModal('folder-modal'));
    document.getElementById('folder-cancel-btn')?.addEventListener('click', () => closeModal('folder-modal'));

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
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

    document.getElementById('move-modal-close')?.addEventListener('click', () => closeModal('move-file-modal'));
    document.getElementById('move-cancel-btn')?.addEventListener('click', () => closeModal('move-file-modal'));

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function openAddResourceModal() {
    const modal = document.getElementById('resource-modal');
    if (!modal) return;

    const titleInp = document.getElementById('res-title');
    const folderSel = document.getElementById('res-folder');
    const urlInp = document.getElementById('res-url');
    const descInp = document.getElementById('res-desc');
    const typeSel = document.getElementById('res-type');

    if (titleInp) titleInp.value = '';
    if (urlInp) urlInp.value = '';
    if (descInp) descInp.value = '';

    // Inject upload UI dynamically into the modal body
    const modalBody = modal.querySelector('.modal-body');
    if (modalBody && !modalBody.querySelector('#res-file-upload-section')) {
      const uploadSection = document.createElement('div');
      uploadSection.id = 'res-file-upload-section';
      uploadSection.style.cssText = 'border:2px dashed var(--sep);border-radius:var(--r-m);padding:14px 16px;margin-bottom:16px;background:var(--bg-3)';
      uploadSection.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:var(--label-2);margin-bottom:8px">📎 อัพโหลดไฟล์จากอุปกรณ์</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button type="button" id="res-pick-file-btn" class="btn btn-secondary" style="font-size:12.5px;padding:7px 14px;display:inline-flex;align-items:center;gap:6px">
            📂 เลือกไฟล์จากเครื่อง
          </button>
          <span id="res-file-chosen" style="font-size:12px;color:var(--label-3);font-style:italic">ยังไม่ได้เลือกไฟล์</span>
        </div>
        <div style="font-size:11px;color:var(--label-3);margin-top:6px">รองรับ PDF, รูปภาพ (PNG, JPG), สูงสุด 8MB · หรือกรอก URL ด้านล่างแทนก็ได้</div>
        <input type="file" id="res-file-input" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp" style="display:none" />
      `;
      modalBody.insertBefore(uploadSection, modalBody.firstChild);
    }

    // Track selected file data URL
    let selectedFileDataUrl = null;
    let selectedFileType = null;

    const fileInput = modal.querySelector('#res-file-input');
    const pickBtn = modal.querySelector('#res-pick-file-btn');
    const fileChosen = modal.querySelector('#res-file-chosen');

    if (pickBtn && fileInput) {
      pickBtn.onclick = () => fileInput.click();
      fileInput.onchange = () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
          showToast('⚠️ ไฟล์ใหญ่เกิน 8MB กรุณาใช้ URL แทน', 'warning');
          fileInput.value = '';
          return;
        }
        const ext = file.name.split('.').pop().toLowerCase();
        selectedFileType = ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'image' : 'pdf';
        if (!titleInp.value.trim()) titleInp.value = file.name.replace(/\.[^.]+$/, '');
        if (typeSel) typeSel.value = selectedFileType;
        if (fileChosen) fileChosen.textContent = `✅ ${file.name} (${(file.size/1024).toFixed(0)} KB)`;
        if (urlInp) urlInp.value = '';

        const reader = new FileReader();
        reader.onload = (ev) => { selectedFileDataUrl = ev.target.result; };
        reader.readAsDataURL(file);
      };
    }

    if (folderSel) {
      folderSel.innerHTML = state.studyFolders.map(f => `
        <option value="${f.id}" ${state.selectedFolderId === f.id ? 'selected' : ''}>${escHtml(f.name)}</option>
      `).join('');
    }

    const saveBtn = document.getElementById('res-save-btn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        const title = titleInp?.value.trim();
        const folderId = folderSel?.value || (state.selectedFolderId !== 'all' ? state.selectedFolderId : 'f-notes');
        const desc = descInp?.value.trim();

        // If file was uploaded, use dataURL; else use URL field
        const useUpload = !!(selectedFileDataUrl);
        const type = useUpload ? (selectedFileType === 'image' ? 'image' : 'pdf') : (typeSel?.value || 'pdf');
        const url = useUpload ? selectedFileDataUrl : urlInp?.value.trim();
        const isLocal = useUpload;

        if (!title || !url) {
          showToast('⚠️ กรุณากรอกชื่อ และเลือกไฟล์หรือใส่ URL', 'warning');
          return;
        }

        state.studyLinks.push({
          id: `link-${Date.now()}`,
          folderId,
          title,
          type: isLocal ? 'local' : type,
          url,
          desc,
          isLocal
        });
        saveStudyLinks();
        // Reset file selection
        selectedFileDataUrl = null;
        if (fileInput) fileInput.value = '';
        if (fileChosen) fileChosen.textContent = 'ยังไม่ได้เลือกไฟล์';
        closeModal('resource-modal');
        renderStudyView();
        showToast('✅ เพิ่มไฟล์เรียบร้อย!', 'success');
      };
    }

    document.getElementById('resource-modal-close')?.addEventListener('click', () => closeModal('resource-modal'));
    document.getElementById('res-cancel-btn')?.addEventListener('click', () => closeModal('resource-modal'));

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

      const loadingTask = pdfjsLib.getDocument(url);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      let currentPage = 1;
      let currentScale = 1.0;
      let isRendering = false;
      let viewMode = 'page'; // 'page' or 'scroll'
      let renderedPages = {}; // cache for scroll mode

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

        <div id="pdf-page-container" style="display:flex;align-items:center;justify-content:center;padding:16px 8px;background:var(--bg-3);overflow:auto;-webkit-overflow-scrolling:touch;min-height:350px;max-height:calc(90vh - 170px)">
          <div id="pdf-single-page-wrapper" style="position:relative;background:#fff;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.15);overflow:hidden;transition:transform 0.1s ease">
            <canvas id="pdf-canvas" style="display:block;max-width:100%;height:auto"></canvas>
          </div>
          <div id="pdf-scroll-container" style="display:none;flex-direction:column;align-items:center;gap:16px;width:100%"></div>
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
      const availableWidth = Math.max(280, (container.clientWidth || window.innerWidth * 0.9) - 40);
      currentScale = Math.min(1.3, Math.max(0.4, availableWidth / initialVp.width));
      if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;

      async function renderCurrentPage() {
        if (isRendering) return;
        isRendering = true;

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

          const context = canvas.getContext('2d');
          const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

          const renderContext = {
            canvasContext: context,
            transform: transform,
            viewport: viewport
          };

          await page.render(renderContext).promise;
          // Only reset scroll when explicitly switching pages/modes, not on zoom
        } catch (e) {
          console.error('Error rendering page:', e);
        } finally {
          isRendering = false;
        }
      }

      async function renderAllPagesScroll() {
        scrollContainer.innerHTML = '';
        renderedPages = {};
        isRendering = true;

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
            pageCanvas.style.maxWidth = '100%';
            pageCanvas.style.height = 'auto';

            const ctx = pageCanvas.getContext('2d');
            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            await page.render({
              canvasContext: ctx,
              transform: transform,
              viewport: viewport
            }).promise;

            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'background:#fff;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.15);overflow:hidden;width:100%;max-width:100%';
            wrapper.appendChild(pageCanvas);

            const pageLabel = document.createElement('div');
            pageLabel.style.cssText = 'text-align:center;font-size:11px;color:var(--label-3);padding:4px 0';
            pageLabel.textContent = `หน้า ${i} / ${numPages}`;
            wrapper.appendChild(pageLabel);

            scrollContainer.appendChild(wrapper);
            renderedPages[i] = true;
          } catch (e) {
            console.error('Error rendering page ' + i + ':', e);
          }
        }
        isRendering = false;
        container.scrollTop = 0;
      }

      function switchViewMode(mode) {
        viewMode = mode;
        const pageModeBtn = bodyEl.querySelector('#pdf-mode-page');
        const scrollModeBtn = bodyEl.querySelector('#pdf-mode-scroll');

        if (mode === 'page') {
          singleWrapper.style.display = '';
          scrollContainer.style.display = 'none';
          navBtns.style.display = '';
          if (pageModeBtn) { pageModeBtn.style.background = 'var(--accent-bg)'; pageModeBtn.style.color = 'var(--accent)'; pageModeBtn.style.fontWeight = '700'; }
          if (scrollModeBtn) { scrollModeBtn.style.background = ''; scrollModeBtn.style.color = ''; scrollModeBtn.style.fontWeight = '600'; }
          renderCurrentPage();
        } else {
          singleWrapper.style.display = 'none';
          scrollContainer.style.display = 'flex';
          navBtns.style.display = 'none';
          if (pageModeBtn) { pageModeBtn.style.background = ''; pageModeBtn.style.color = ''; pageModeBtn.style.fontWeight = '600'; }
          if (scrollModeBtn) { scrollModeBtn.style.background = 'var(--accent-bg)'; scrollModeBtn.style.color = 'var(--accent)'; scrollModeBtn.style.fontWeight = '700'; }
          if (Object.keys(renderedPages).length === 0) {
            renderAllPagesScroll();
          }
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

      // Zoom handlers
      bodyEl.querySelector('#pdf-zoom-in')?.addEventListener('click', async () => {
        currentScale = Math.min(2.5, currentScale + 0.15);
        if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;
        if (viewMode === 'scroll') { renderedPages = {}; await renderAllPagesScroll(); }
        else await renderCurrentPage();
      });

      bodyEl.querySelector('#pdf-zoom-out')?.addEventListener('click', async () => {
        currentScale = Math.max(0.3, currentScale - 0.15);
        if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;
        if (viewMode === 'scroll') { renderedPages = {}; await renderAllPagesScroll(); }
        else await renderCurrentPage();
      });

      bodyEl.querySelector('#pdf-zoom-fit')?.addEventListener('click', async () => {
        const page = await pdf.getPage(currentPage);
        const vp = page.getViewport({ scale: 1.0 });
        // Use bodyEl width as reference — works correctly in both page and scroll mode
        const cW = Math.max(280, (bodyEl.clientWidth || window.innerWidth * 0.9) - 48);
        currentScale = Math.max(0.3, Math.min(2.0, cW / vp.width));
        if (zoomValEl) zoomValEl.textContent = `${Math.round(currentScale * 100)}%`;
        if (viewMode === 'scroll') { renderedPages = {}; await renderAllPagesScroll(); }
        else await renderCurrentPage();
      });

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
      console.warn('PDF.js fallback to iframe:', err);
      bodyEl.innerHTML = `
        <div style="width:100%;height:70vh;display:flex;flex-direction:column">
          <iframe
            src="${escHtml(url)}"
            style="flex:1;border:none;border-radius:0 0 var(--r-m) var(--r-m);width:100%"
            allow="fullscreen"
            title="PDF Preview"
          ></iframe>
          <div style="padding:10px 16px;font-size:12px;color:var(--label-2);text-align:center;background:var(--bg-2)">
            <a href="${escHtml(url)}" target="_blank" class="btn btn-primary" style="display:inline-flex;padding:6px 16px;font-size:12.5px;text-decoration:none">
              🚀 เปิดไฟล์ PDF ในแท็บใหม่
            </a>
          </div>
        </div>`;
    }
  }

  // ─── In-App Resource Preview ──────────────────────────────
  function openResourcePreview(item) {
    const modal = document.getElementById('preview-modal');
    if (!modal) return;

    // Set title and badge
    const titleEl = document.getElementById('preview-modal-title');
    if (titleEl) titleEl.textContent = item.title || 'ตัวอย่างเอกสาร';

    const badge = document.getElementById('preview-badge');
    if (badge) {
      const typeMap = { pdf: '📄 PDF', drive: '📁 Drive', classroom: '🎓 Classroom', image: '🖼️ Image', link: '🔗 Link' };
      badge.textContent = typeMap[item.type] || '🔗 LINK';
    }

    // Meta info
    const metaEl = document.getElementById('preview-meta-info');
    if (metaEl) metaEl.textContent = item.sub || item.desc || '';

    // External open button
    const extBtn = document.getElementById('preview-open-ext-btn');
    if (extBtn) extBtn.href = item.url || '#';

    // Copy link button
    const copyBtn = document.getElementById('preview-copy-link-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(item.url || '').then(() => showToast('📋 คัดลอกลิงค์แล้ว', 'success'));
      };
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

      if ((item.type === 'pdf' || (item.type === 'local' && item.url && item.url.startsWith('data:application/pdf'))) && item.url) {
        // Multi-page PDF rendering via PDF.js (works on iPad, iPhone, PC)
        renderPdfWithPdfJs(item.url, body, item.title);
      } else if (item.type === 'local' && item.url && item.url.startsWith('data:image/')) {
        body.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;min-height:300px;max-height:calc(90vh - 130px);overflow:auto">
            <img src="${item.url}" alt="${escHtml(item.title)}" style="max-width:100%;height:auto;max-height:75vh;object-fit:contain;border-radius:var(--r-m);box-shadow:var(--shadow-2)" />
          </div>`;
      } else if (item.type === 'image' && item.url) {
        body.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;min-height:300px;max-height:calc(90vh - 130px);overflow:auto">
            <img src="${escHtml(item.url)}" alt="${escHtml(item.title)}" style="max-width:100%;height:auto;max-height:75vh;object-fit:contain;border-radius:var(--r-m);box-shadow:var(--shadow-2)" />
            <div style="margin-top:12px;display:flex;gap:8px">
              <a href="${escHtml(item.url)}" target="_blank" class="btn btn-secondary" style="font-size:12px;padding:6px 14px;text-decoration:none">🔍 ดูภาพขนาดเต็ม</a>
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
    setTimeout(() => {
      drawGraphSvgEdges();
      if (graphState.selectedNodeId) {
        selectGraphNode(graphState.selectedNodeId);
      }
    }, 50);
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
    const { dayKey, blockId } = state.editingBlock;
    const modal = document.getElementById('edit-modal');
    const title    = modal.querySelector('#edit-title')?.value || '';
    const subtitle = modal.querySelector('#edit-subtitle')?.value || '';
    const start    = modal.querySelector('#edit-start')?.value || '';
    const end      = modal.querySelector('#edit-end')?.value || '';
    const notes    = modal.querySelector('#edit-notes')?.value || '';
    const selectedTag = modal.querySelector('.tag-option.selected')?.dataset.tag || 'break';

    const day = ROUTINES[dayKey];
    const isBase = day.blocks.some(b => b.id === blockId);
    if (!state.customBlocks[dayKey]) state.customBlocks[dayKey] = [];

    if (isBase) {
      const override = state.customBlocks[dayKey].find(b => b.id === blockId);
      if (override) {
        Object.assign(override, { title, subtitle, start, end, notes, tag: selectedTag });
      } else {
        const base = day.blocks.find(b => b.id === blockId);
        state.customBlocks[dayKey].push({ ...base, title, subtitle, start, end, notes, tag: selectedTag, _override: true });
      }
    } else {
      const custom = state.customBlocks[dayKey].find(b => b.id === blockId);
      if (custom) Object.assign(custom, { title, subtitle, start, end, notes, tag: selectedTag });
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
    const isBase = day.blocks.some(b => b.id === blockId);
    if (isBase) { showToast('⚠️ ไม่สามารถลบตารางหลักได้', 'warning'); return; }
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

    if (!title || !start || !end) { showToast('⚠️ กรุณากรอกข้อมูลให้ครบ', 'warning'); return; }

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
    showToast('✅ เพิ่มกิจกรรมแล้ว!', 'success');
    renderTimeline(dayKey);
  }

  // ─── Modal Helpers ───────────────────────────────────────
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
        showToast('🔄 กำลังเชื่อมต่อและซิงค์ข้อมูลกับ Cloud...', 'info');
        const pullRes = await CloudSync.pullFromCloud();
        if (pullRes && pullRes.ok) {
          if (pullRes.notFound || !pullRes.data) {
            const pushRes = await CloudSync.pushToCloud(state);
            if (pushRes.ok) showToast('✅ สร้างฐานข้อมูลบน Cloud เรียบร้อย', 'success');
            else showToast('❌ ไม่สามารถสร้างฐานข้อมูลบน Cloud ได้', 'error');
          } else {
            const syncRes = syncSmartWithCloud(pullRes.data);
            if (syncRes === 'pulled' || syncRes === 'merged') {
              if (state.currentTopView === 'dashboard') renderDashboardCurrentView();
              else if (state.currentTopView === 'study') renderStudyView();
              showToast('✅ ดึงข้อมูลล่าสุดจาก Cloud มาอัปเดตเครื่องนี้แล้ว!', 'success');
            } else if (syncRes === 'pushed') {
              showToast('✅ ข้อมูลในเครื่องนี้ล่าสุดกว่า! อัปเดตขึ้น Cloud เรียบร้อย', 'success');
            } else {
              showToast('✅ ข้อมูลตรงกันกับ Cloud เรียบร้อย', 'success');
            }
          }
        } else {
          if (pullRes && pullRes.reason === 'busy') {
            showToast('⚠️ ระบบกำลังซิงค์อยู่แล้ว โปรดรอสักครู่', 'warning');
          } else {
            showToast('❌ ขาดการเชื่อมต่อกับ Cloud หรือ Server ไม่ตอบสนอง', 'error');
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
        showToast('⚠️ กรุณากรอก Sync Key', 'warning');
        return;
      }
      CloudSync.setSyncKey(key);
      showToast('🔄 กำลังเชื่อมต่อ Cloud...', 'info');

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
        showToast('⚠️ เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (บันทึกไว้ในเครื่องเรียบร้อย)', 'warning');
      }
      closeModal('sync-modal');
    });

    // Force Pull button
    document.getElementById('sync-force-pull-btn')?.addEventListener('click', async () => {
      const key = CloudSync.getSyncKey();
      if (!key) {
        showToast('⚠️ ยังไม่ได้ตั้งค่า Sync Key', 'warning');
        return;
      }
      showToast('📥 กำลังดึงข้อมูลจาก Cloud...', 'info');
      const pullRes = await CloudSync.pullFromCloud();
      if (pullRes.ok && pullRes.data) {
        applyCloudData(pullRes.data);
        if (state.currentTopView === 'dashboard') renderDashboardCurrentView();
        else if (state.currentTopView === 'study') renderStudyView();
        showToast('✅ ดึงข้อมูลล่าสุดจาก Cloud มาอัปเดตเครื่องนี้แล้ว!', 'success');
        closeModal('sync-modal');
      } else if (pullRes.notFound) {
        showToast('ℹ️ ยังไม่มีข้อมูลบน Cloud สำหรับ Key นี้', 'info');
      } else {
        showToast('⚠️ ไม่สามารถดึงข้อมูลได้ โปรดตรวจสอบการเชื่อมต่อ', 'warning');
      }
    });

    // Force Push button
    document.getElementById('sync-force-push-btn')?.addEventListener('click', async () => {
      const key = CloudSync.getSyncKey();
      if (!key) {
        showToast('⚠️ ยังไม่ได้ตั้งค่า Sync Key', 'warning');
        return;
      }
      showToast('📤 กำลังส่งข้อมูลขึ้น Cloud...', 'info');
      const pushRes = await CloudSync.pushToCloud(state);
      if (pushRes.ok) {
        showToast('✅ ส่งข้อมูลเครื่องนี้ขึ้น Cloud สำเร็จ!', 'success');
        closeModal('sync-modal');
      } else {
        showToast('⚠️ ส่งข้อมูลขึ้น Cloud ไม่สำเร็จ โปรดลองใหม่', 'warning');
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
      }
    });
  }

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
