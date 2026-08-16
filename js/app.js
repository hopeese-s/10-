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
    checklist: {},      // { 'monday-2026-08-17': { 'mon-11-0': true } }
    subjects: {},       // { 'monday-2026-08-17': { 'mon-11-0': 'GenPhy' } }
    customBlocks: {},   // per-day overrides { monday: [...extra blocks] }
    editingBlock: null,
    addingDay: null,

    // Study Resource Links (Custom user links saved in localStorage)
    studyLinks: [
      { id: 'link-1', title: '📘 BME Undergraduate Handbook 2026', type: 'pdf', url: '2026_Handbok for Biomedical Engineering Undergraduate Student.pdf', desc: 'คู่มือนักศึกษาหลักสูตรวิศวกรรมชีวแพทย์ ม.มหิดล' },
      { id: 'link-2', title: '🏥 EGBI100 Lecture 1: Intro to BME', type: 'pdf', url: '2026-EGBI100_Lecture1_Intro_PN.pdf', desc: 'เอกสารประกอบการสอน BME in the Real World' },
      { id: 'link-3', title: '📆 ตารางเรียนปี 1 ภาคเรียนที่ 1/2026', type: 'image', url: 'egmu-class-schedule-2026-1-program_B-BI.png', desc: 'Class Schedule Program B-BI' }
    ]
  };

  // ─── Init ────────────────────────────────────────────────
  async function init() {
    loadFromStorage();
    detectTheme();
    applyTheme();

    const todayIndex = new Date().getDay();
    state.currentDay = getDayKey(todayIndex) || 'monday';

    // Cloud Sync initial pull
    if (window.CloudSync && CloudSync.getSyncKey()) {
      const cloudData = await CloudSync.pullFromCloud();
      if (cloudData) applyCloudData(cloudData);
    }
    if (window.CloudSync) CloudSync.updateUIStatus();

    setupGlobalEventListeners();
    setup9thEventListeners();
    startClock();
    startTimeIndicator();

    // Render initial views
    renderDayTabs();
    switchTopView('home');

    // Auto sync background polling (smooth, no flicker)
    if (window.CloudSync) {
      CloudSync.startAutoSync(cloudData => {
        if (cloudData && hasDataChanged(cloudData)) {
          applyCloudData(cloudData);
          if (state.currentTopView === 'dashboard') {
            renderDashboardCurrentView();
          }
        }
      });
    }
  }

  // ─── Storage & Cloud Sync ────────────────────────────────
  function hasDataChanged(cloudData) {
    if (!cloudData) return false;
    const cChecklist = JSON.stringify(state.checklist);
    const nChecklist = JSON.stringify(cloudData.checklist || {});
    const cSubjects  = JSON.stringify(state.subjects);
    const nSubjects  = JSON.stringify(cloudData.subjects || {});
    const cCustom    = JSON.stringify(state.customBlocks);
    const nCustom    = JSON.stringify(cloudData.customBlocks || {});
    return (cChecklist !== nChecklist) || (cSubjects !== nSubjects) || (cCustom !== nCustom);
  }

  function applyCloudData(cloudData) {
    if (cloudData.checklist) state.checklist = cloudData.checklist;
    if (cloudData.subjects) state.subjects = cloudData.subjects;
    if (cloudData.customBlocks) state.customBlocks = cloudData.customBlocks;

    localStorage.setItem('sd-checklist', JSON.stringify(state.checklist));
    localStorage.setItem('sd-subjects', JSON.stringify(state.subjects));
    localStorage.setItem('sd-custom-blocks', JSON.stringify(state.customBlocks));
  }

  function loadFromStorage() {
    try {
      state.theme        = localStorage.getItem('sd-theme') || 'light';
      state.checklist    = JSON.parse(localStorage.getItem('sd-checklist') || '{}');
      state.subjects     = JSON.parse(localStorage.getItem('sd-subjects') || '{}');
      state.customBlocks = JSON.parse(localStorage.getItem('sd-custom-blocks') || '{}');
      const savedLinks   = localStorage.getItem('sd-study-links');
      if (savedLinks) state.studyLinks = JSON.parse(savedLinks);
    } catch (e) {}
  }

  function saveChecklist() {
    localStorage.setItem('sd-checklist', JSON.stringify(state.checklist));
    if (window.CloudSync) CloudSync.pushToCloud(state);
  }

  function saveSubjects() {
    localStorage.setItem('sd-subjects', JSON.stringify(state.subjects));
    if (window.CloudSync) CloudSync.pushToCloud(state);
  }

  function saveCustomBlocks() {
    localStorage.setItem('sd-custom-blocks', JSON.stringify(state.customBlocks));
    if (window.CloudSync) CloudSync.pushToCloud(state);
  }

  function saveStudyLinks() {
    localStorage.setItem('sd-study-links', JSON.stringify(state.studyLinks));
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
    document.querySelectorAll('.mob-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Handle dashboard sub-nav bar visibility
    const subNavBar = document.getElementById('sub-nav-bar');
    if (subNavBar) {
      subNavBar.style.display = (viewName === 'dashboard') ? 'flex' : 'none';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Render view-specific content
    if (viewName === 'dashboard') {
      renderDashboardCurrentView();
    } else if (viewName === 'curriculum') {
      renderCurriculumView();
    } else if (viewName === 'study') {
      renderStudyView();
    } else if (viewName === 'graph') {
      renderGraphView();
    }
  }

  function switchDashboardView(subviewName) {
    state.currentDashboardView = subviewName;

    // Show/hide subviews in Dashboard
    document.querySelectorAll('#view-egbe-dashboard .view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${subviewName}`);
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
  function getDayKey(jsDay) {
    const map = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return map[jsDay];
  }

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

    // Attach subject input listeners
    container.querySelectorAll('.study-subject-input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const blockId = inp.dataset.blockId;
        const sbIdx   = parseInt(inp.dataset.sbIdx, 10);
        const ck = getCheckKey(dayKey);
        if (!state.subjects[ck]) state.subjects[ck] = {};
        state.subjects[ck][`${blockId}-${sbIdx}`] = e.target.value;
        saveSubjects();
      });
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
        const allBlocks = [...day.blocks, ...customExtra].sort((a,b) => timeToMinutes(a.start) - timeToMinutes(b.start));
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

    const allClassItems = DAY_ORDER.flatMap(key => {
      const day = ROUTINES[key];
      const classes = CLASS_SCHEDULE[key] || [];
      return classes.map(cls => {
        const sc = SUBJECT_COLORS[cls.code] || { color:'#64748b', bg:'rgba(100,116,139,0.15)', emoji:'📘', shortName:cls.code };
        return `
          <div class="week-class-item">
            <span class="wci-emoji">${sc.emoji}</span>
            <div class="wci-info">
              <div class="wci-name">${cls.name} <span style="font-size:11px;color:var(--label-3)">(${cls.type})</span></div>
              <div class="wci-meta">${day.label} · 📍 ${cls.room} · ⏰ ${cls.start}–${cls.end}</div>
            </div>
            <span class="wci-code" style="background:${sc.bg};color:${sc.color}">${cls.code}</span>
          </div>`;
      });
    }).join('');

    container.innerHTML = `
      <div style="background:var(--bg-2);border-radius:var(--r-l);border:1px solid var(--sep);padding:20px;margin-bottom:20px;box-shadow:var(--shadow-1)">
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
      <div class="week-classes-section">
        <h3>📚 วิชาทั้งหมดประจำสัปดาห์</h3>
        <div class="week-class-list">${allClassItems}</div>
      </div>
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

    container.innerHTML = `
      <div style="margin-bottom:2rem">
        <h2 style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;margin-bottom:6px">หลักสูตรวิศวกรรมชีวแพทย์ (BME Mahidol 2026)</h2>
        <p style="font-size:13.5px;color:var(--label-2)">โครงสร้างรายวิชาปีที่ 1 ภาคเรียนที่ 1 รวมทั้งสิ้น 21 หน่วยกิต</p>
      </div>
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

  // ─── View 3: Study Resources (Link Drive / Sheet / Files) ─
  function renderStudyView() {
    const container = document.getElementById('view-egbe-study');
    if (!container) return;

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem;flex-wrap:wrap;gap:1rem">
        <div>
          <h2 style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;margin-bottom:6px">Study Resources & Files</h2>
          <p style="font-size:13.5px;color:var(--label-2)">คลังเก็บชีทสรุป ลิงค์ Google Drive คลิปบรรยาย และเอกสารประกอบการเรียน BME ปี 1</p>
        </div>
        <button class="btn-pill" id="add-resource-btn" style="background:var(--accent);color:#FFFFFF;border-color:var(--accent)">
          ＋ เพิ่มลิงค์ / ชีทเรียน
        </button>
      </div>

      <div class="cards-grid" id="study-links-grid">
        ${state.studyLinks.map((item, idx) => `
          <div class="card-item" style="display:flex;flex-direction:column;justify-content:space-between">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span class="online-pill" style="background:var(--accent-bg);color:var(--accent)">${escHtml(item.type.toUpperCase())}</span>
                <button class="delete-resource-btn" data-idx="${idx}" style="background:none;border:none;cursor:pointer;color:var(--label-4);font-size:13px" title="ลบ">✕</button>
              </div>
              <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;color:var(--label)">${escHtml(item.title)}</h3>
              <p style="font-size:12.5px;color:var(--label-2);line-height:1.5">${escHtml(item.desc || '')}</p>
            </div>
            <div>
              <a href="${escHtml(item.url)}" target="_blank" rel="noopener" class="resource-link-btn">
                🔗 เปิดไฟล์ / ลิงค์
              </a>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Add Link Modal Embedded -->
      <div class="modal-overlay" id="resource-modal" role="dialog" aria-modal="true">
        <div class="modal-box">
          <div class="modal-header">
            <span class="modal-title">เพิ่มชีทเรียน / ลิงค์ Drive</span>
            <button class="modal-close" id="resource-modal-close">✕</button>
          </div>
          <div class="form-group">
            <label class="form-label">ชื่อชีท / หัวข้อวิชา</label>
            <input type="text" id="res-title" class="form-input" placeholder="เช่น GenPhy Chapter 1 Summary" />
          </div>
          <div class="form-group">
            <label class="form-label">ประเภท</label>
            <select id="res-type" class="form-select">
              <option value="drive">Google Drive</option>
              <option value="sheet">ชีทสรุป / PDF</option>
              <option value="video">คลิปวิดีโอ / YouTube</option>
              <option value="link">ลิงค์เว็บไซต์ทั่วไป</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">URL / ลิงค์</label>
            <input type="text" id="res-url" class="form-input" placeholder="https://drive.google.com/..." />
          </div>
          <div class="form-group">
            <label class="form-label">คำอธิบายเพิ่มเติม</label>
            <textarea id="res-desc" class="form-textarea" placeholder="รายละเอียดหรือหมายเหตุ..."></textarea>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="res-cancel-btn">ยกเลิก</button>
            <button class="btn btn-primary" id="res-save-btn">บันทึก</button>
          </div>
        </div>
      </div>
    `;

    // Modal listeners
    const modal = document.getElementById('resource-modal');
    document.getElementById('add-resource-btn')?.addEventListener('click', () => {
      if (modal) modal.classList.add('open');
    });
    document.getElementById('resource-modal-close')?.addEventListener('click', () => {
      if (modal) modal.classList.remove('open');
    });
    document.getElementById('res-cancel-btn')?.addEventListener('click', () => {
      if (modal) modal.classList.remove('open');
    });

    document.getElementById('res-save-btn')?.addEventListener('click', () => {
      const title = document.getElementById('res-title')?.value.trim();
      const type  = document.getElementById('res-type')?.value;
      const url   = document.getElementById('res-url')?.value.trim();
      const desc  = document.getElementById('res-desc')?.value.trim();
      if (!title || !url) {
        showToast('⚠️ กรุณากรอกชื่อและ URL', 'warning');
        return;
      }
      state.studyLinks.push({ id: `link-${Date.now()}`, title, type, url, desc });
      saveStudyLinks();
      if (modal) modal.classList.remove('open');
      showToast('✅ เพิ่มชีทเรียนแล้ว!', 'success');
      renderStudyView();
    });

    container.querySelectorAll('.delete-resource-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        state.studyLinks.splice(idx, 1);
        saveStudyLinks();
        renderStudyView();
        showToast('🗑️ ลบลิงค์แล้ว', 'info');
      });
    });
  }

  // ─── View 4: Concept Knowledge Graph (Year 1 BME) ─────────
  function renderGraphView() {
    const container = document.getElementById('view-egbe-graph');
    if (!container) return;

    const concepts = [
      {
        id: 'SCPY161',
        title: 'Physics & Biomechanics',
        cat: 'Foundation Science',
        color: '#3b82f6',
        desc: 'กฎการเคลื่อนที่ของนิวตัน งานและพลังงาน นำไปสู่การวิเคราะห์แรงกระทำในข้อต่อกระดูก (Joint Forces) และการไหลของของเหลวในหลอดเลือด',
        connections: ['EGBI100', 'SCPY111', 'Biomechanics']
      },
      {
        id: 'SCMA101',
        title: 'Calculus & Engineering Math',
        cat: 'Mathematics',
        color: '#ec4899',
        desc: 'การดิฟและอินทิเกรต เพื่อคำนวณอัตราการเปลี่ยนแปลงสัญญาณไฟฟ้าหัวใจ (ECG Derivative) และ Fourier Transform สำหรับกรองคลื่นสมอง',
        connections: ['EGBI122', 'SCPY161', 'Biosignals']
      },
      {
        id: 'EGBI122',
        title: 'Programming & Medical Data',
        cat: 'Engineering & Computing',
        color: '#10b981',
        desc: 'การเขียนโปรแกรมประมวลผลข้อมูลเชิงตัวเลข สู่การสร้างอัลกอริทึมวินิจฉัยภาพถ่ายรังสีและเชื่อมต่อเซ็นเซอร์ตรวจวัดชีพจรผู้ป่วย',
        connections: ['EGBI100', 'Medical_AI']
      },
      {
        id: 'SCCH161',
        title: 'Chemistry & Biomaterials',
        cat: 'Foundation Science',
        color: '#ef4444',
        desc: 'โครงสร้างพันธะและปฏิกิริยาเคมี สู่การพัฒนาวัสดุฝังในร่างกาย (Implants), พอลิเมอร์ส่งยาตรงเป้าหมาย และระบบนำส่งสารเคมี',
        connections: ['SCCH169', 'Biomaterials']
      },
      {
        id: 'SCBE102',
        title: 'Cell Biology & Physiology',
        cat: 'Life Science',
        color: '#6bae8e',
        desc: 'กลไกการทำงานของเซลล์และเยื่อหุ้มเซลล์ การส่งสัญญาณไอออน (Action Potential) ในเซลล์ประสาทและกล้ามเนื้อหัวใจ',
        connections: ['SCSL190', 'Tissue_Engineering']
      },
      {
        id: 'EGBI100',
        title: 'BME in the Real World & Medical Devices',
        cat: 'Core Biomedical',
        color: '#8b5cf6',
        desc: 'การรวมเอาฟิสิกส์ ชีววิทยา คณิตศาสตร์ และคอมพิวเตอร์มารวมกันเพื่อออกแบบเครื่องมือแพทย์และการรับรองมาตรฐานความปลอดภัยคลินิก',
        connections: ['Clinical_Safety', 'Medical_Sensors', 'BME_Design']
      }
    ];

    container.innerHTML = `
      <div style="margin-bottom:2rem">
        <h2 style="font-family:var(--font-serif);font-size:1.6rem;font-weight:700;margin-bottom:6px">Concept Knowledge Graph (BME Year 1)</h2>
        <p style="font-size:13.5px;color:var(--label-2)">ผังเชื่อมโยงมโนทัศน์ความรู้และวิชาพื้นฐานสู่การเป็นวิศวกรชีวแพทย์</p>
      </div>

      <div class="cards-grid">
        ${concepts.map(c => `
          <div class="card-item" style="border-left:4px solid ${c.color}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span class="tag-chip" style="background:${c.color}22;color:${c.color}">
                ● ${c.id}
              </span>
              <span style="font-size:11px;color:var(--label-3);font-weight:600">${escHtml(c.cat)}</span>
            </div>
            <h3 style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--label)">${escHtml(c.title)}</h3>
            <p style="font-size:12.5px;color:var(--label-2);line-height:1.55;margin-bottom:14px">${escHtml(c.desc)}</p>
            <div style="border-top:1px solid var(--sep);padding-top:10px;font-size:11.5px;color:var(--label-3)">
              เชื่อมต่อไปยัง:
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
                ${c.connections.map(con => `
                  <span style="background:var(--bg-3);padding:2px 8px;border-radius:12px;font-size:10.5px;font-weight:600;color:var(--label)">
                    → ${escHtml(con)}
                  </span>
                `).join('')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
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

    if (!title || !start || !end) { showToast('⚠️ กรุณากรอกข้อมูลให้ครบ', 'warning'); return; }

    const newBlock = {
      id: `custom-${dayKey}-${Date.now()}`,
      start, end, title, subtitle, tag, notes,
      isCustom: true
    };
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
    document.querySelectorAll('.mob-nav-btn[data-view]').forEach(btn => {
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
    document.getElementById('edit-cancel-btn-footer')?.addEventListener('click', () => closeModal('edit-modal'));
    document.getElementById('edit-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal('edit-modal');
    });

    // Add modal
    document.getElementById('add-save-btn')?.addEventListener('click', saveNewBlock);
    document.getElementById('add-cancel-btn')?.addEventListener('click', () => closeModal('add-modal'));
    document.getElementById('add-cancel-btn-footer')?.addEventListener('click', () => closeModal('add-modal'));
    document.getElementById('add-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal('add-modal');
    });

    // Cloud Sync modal
    document.getElementById('cloud-sync-btn')?.addEventListener('click', () => {
      const modal = document.getElementById('sync-modal');
      const input = document.getElementById('sync-key-input');
      if (input && window.CloudSync) input.value = CloudSync.getSyncKey();
      if (window.CloudSync) CloudSync.updateUIStatus();
      if (modal) modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    document.getElementById('sync-cancel-btn')?.addEventListener('click', () => closeModal('sync-modal'));
    document.getElementById('sync-modal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal('sync-modal');
    });

    document.getElementById('sync-connect-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('sync-key-input');
      const key = input?.value.trim();
      if (!key) {
        showToast('⚠️ กรุณากรอก Sync Key', 'warning');
        return;
      }
      if (window.CloudSync) {
        CloudSync.setSyncKey(key);
        showToast('🔄 กำลังเชื่อมต่อ Cloud...', 'info');

        const cloudData = await CloudSync.pullFromCloud();
        if (cloudData) {
          applyCloudData(cloudData);
          if (state.currentTopView === 'dashboard') renderDashboardCurrentView();
          showToast('✅ ซิงค์ข้อมูลสำเร็จ!', 'success');
        } else {
          await CloudSync.pushToCloud(state);
          showToast('✅ สร้าง Sync Key บน Cloud แล้ว!', 'success');
        }
      }
      closeModal('sync-modal');
    });

    document.getElementById('sync-disconnect-btn')?.addEventListener('click', () => {
      if (window.CloudSync) CloudSync.setSyncKey('');
      showToast('⚪ ยกเลิกการซิงค์ Cloud แล้ว', 'info');
      closeModal('sync-modal');
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeModal('edit-modal');
        closeModal('add-modal');
        closeModal('sync-modal');
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
