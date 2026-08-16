// ============================================================
// app.js — Daily Study Dashboard · Main Application Logic
// ============================================================

(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────
  const state = {
    currentDay: null,
    currentView: 'timeline',
    theme: 'light',
    checklist: {},      // { 'monday-2026-08-17': { 0: true, 1: false } }
    subjects: {},       // { 'monday-2026-08-17': { 0: 'GenPhy', 1: 'CompPro' } }
    customBlocks: {},   // per-day overrides { monday: [...extra blocks] }
    editingBlock: null,
    addingDay: null,
  };

  // ─── Init ────────────────────────────────────────────────
  function init() {
    loadFromStorage();
    detectTheme();
    applyTheme();
    state.currentDay = getDayKey(new Date().getDay());
    renderAll();
    setupEventListeners();
    startClock();
    startTimeIndicator();
  }

  // ─── Storage ─────────────────────────────────────────────
  function loadFromStorage() {
    try {
      state.theme       = localStorage.getItem('sd-theme') || 'light';
      state.checklist   = JSON.parse(localStorage.getItem('sd-checklist') || '{}');
      state.subjects    = JSON.parse(localStorage.getItem('sd-subjects') || '{}');
      state.customBlocks= JSON.parse(localStorage.getItem('sd-custom-blocks') || '{}');
    } catch(e) {}
  }
  function saveChecklist() {
    localStorage.setItem('sd-checklist', JSON.stringify(state.checklist));
  }
  function saveSubjects() {
    localStorage.setItem('sd-subjects', JSON.stringify(state.subjects));
  }
  function saveCustomBlocks() {
    localStorage.setItem('sd-custom-blocks', JSON.stringify(state.customBlocks));
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
    const mbtn = document.getElementById('mob-theme-toggle');
    if (mbtn) mbtn.querySelector('.icon').textContent = state.theme === 'dark' ? '☀️' : '🌙';
  }
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    saveTheme();
  }

  // ─── Time Helpers ─────────────────────────────────────────
  function getDayKey(jsDay) {
    const map = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
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
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
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
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function getDateKey(dayKey) {
    // Find next/current occurrence of dayKey in the current week (Mon-Sun)
    const now = new Date();
    const today = now.getDay(); // 0=Sun
    const dayMap = {sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
    const target = dayMap[dayKey];
    const diff = (target - today + 7) % 7;
    const d = new Date(now);
    d.setDate(d.getDate() - ((today - 1 + 7) % 7) + (target === 0 ? 6 : target - 1));
    // Simpler: just get monday of current week + offset
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const dayOffset = {monday:0,tuesday:1,wednesday:2,thursday:3,friday:4,saturday:5,sunday:6};
    const td = new Date(monday);
    td.setDate(monday.getDate() + (dayOffset[dayKey] || 0));
    return getISODate(td);
  }
  function getCheckKey(dayKey) {
    return `${dayKey}-${getDateKey(dayKey)}`;
  }

  // ─── Render All ──────────────────────────────────────────
  function renderAll() {
    renderDayTabs();
    renderCurrentView();
  }

  // ─── View Switching ──────────────────────────────────────
  function switchView(viewName) {
    state.currentView = viewName;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewName}`)?.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
    document.querySelectorAll('.mob-nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
    renderCurrentView();
  }
  function renderCurrentView() {
    if (state.currentView === 'timeline') renderTimeline(state.currentDay);
    else if (state.currentView === 'schedule') renderSchedule();
    else if (state.currentView === 'week') renderWeek();
  }

  // ─── Day Tabs ────────────────────────────────────────────
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
        <span class="day-tab-en">${day.labelEn.substring(0,3)}</span>
        <span class="day-tab-status">${day.statusEmoji}</span>
      `;
      btn.addEventListener('click', () => selectDay(key));
      container.appendChild(btn);
    });
  }
  function selectDay(key) {
    state.currentDay = key;
    renderDayTabs();
    if (state.currentView === 'timeline') renderTimeline(key);
  }

  // ─── Timeline ────────────────────────────────────────────
  function renderTimeline(dayKey) {
    const container = document.getElementById('view-timeline');
    if (!container) return;
    const day = ROUTINES[dayKey];
    if (!day) return;

    // Merge base blocks + custom blocks (overrides replace, extras are added)
    const customKey = dayKey;
    const customExtra = (state.customBlocks[customKey] || []);
    const overrideIds = new Set(customExtra.filter(b => b._override).map(b => b.id));
    const baseBlocks = day.blocks.filter(b => !overrideIds.has(b.id));
    const allBlocks = [...baseBlocks, ...customExtra].sort((a,b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    const checkKey = getCheckKey(dayKey);
    const checks = state.checklist[checkKey] || {};
    const subjects = state.subjects[checkKey] || {};

    container.innerHTML = `
      <div class="stats-bar glass">
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
        ${allBlocks.map((block, idx) => renderBlock(block, day, checks, subjects, dayKey)).join('')}
      </div>
    `;

    // Attach checklist listeners
    container.querySelectorAll('.study-check-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.study-subject-input')) return;
        const blockId = item.dataset.blockId;
        const sbIdx   = parseInt(item.dataset.sbIdx);
        toggleCheck(dayKey, blockId, sbIdx);
      });
    });

    // Attach subject input listeners
    container.querySelectorAll('.study-subject-input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const blockId = inp.dataset.blockId;
        const sbIdx   = parseInt(inp.dataset.sbIdx);
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

  // ─── Stats Bar ───────────────────────────────────────────
  function renderStatsBar(day, checks) {
    const totalStudyBlocks = day.blocks.filter(b => b.isStudyBlock).length;
    const doneBlocks = Object.values(checks).filter(Boolean).length;
    const pct = totalStudyBlocks > 0 ? Math.round((doneBlocks / totalStudyBlocks) * 100) : (day.studyMinutes === 0 ? 100 : 0);
    const sleepH = Math.floor(day.sleepMinutes / 60);
    const sleepM = day.sleepMinutes % 60;
    const studyH = Math.floor(day.studyMinutes / 60);
    const studyM = day.studyMinutes % 60;

    const r = 22, circ = 2 * Math.PI * r, offset = circ - (pct / 100) * circ;
    const color = pct === 100 ? '#10b981' : pct >= 50 ? '#60a5fa' : '#f59e0b';

    // Weekly streak
    const streak = calcWeeklyStreak();

    return `
      <div class="stat-item">
        <div class="stat-icon sleep">😴</div>
        <div class="stat-body">
          <div class="stat-label">นอน</div>
          <div class="stat-value">${sleepH}<span style="font-size:12px;font-weight:500"> ชม.</span>${sleepM > 0 ? sleepM + 'น.' : ''}</div>
          <div class="stat-sub">~8 ชม. เป้าหมาย</div>
        </div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-icon study">📚</div>
        <div class="stat-body">
          <div class="stat-label">ทบทวน</div>
          <div class="stat-value">${studyH > 0 ? studyH + ' ชม.' : ''}${studyM > 0 ? studyM + ' น.' : studyH === 0 ? 'พักผ่อน' : ''}</div>
          <div class="stat-sub">${totalStudyBlocks} บล็อก · ${doneBlocks} ทำแล้ว</div>
        </div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item progress-ring-wrap">
        <svg class="progress-ring-svg" width="56" height="56" viewBox="0 0 56 56">
          <circle class="progress-ring-bg" cx="28" cy="28" r="${r}"/>
          <circle class="progress-ring-fg" cx="28" cy="28" r="${r}"
            stroke="${color}"
            stroke-dasharray="${circ.toFixed(1)}"
            stroke-dashoffset="${offset.toFixed(1)}"
            transform="rotate(-90 28 28)"
          />
          <text class="progress-ring-text" x="28" y="28" fill="${color}" font-size="13">${pct}%</text>
        </svg>
        <div class="stat-body">
          <div class="stat-label">ความคืบหน้า</div>
          <div class="stat-value" style="color:${color}">${pct === 100 ? 'ครบแล้ว! 🎉' : pct + '%'}</div>
          <div class="stat-sub">วันนี้</div>
        </div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <div class="stat-icon streak">🔥</div>
        <div class="stat-body">
          <div class="stat-label">สัปดาห์นี้</div>
          <div class="stat-value">${streak.done}/${streak.total}</div>
          <div class="stat-sub">บล็อกที่ทำแล้ว</div>
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

  // ─── Checklist Toggle ────────────────────────────────────
  function toggleCheck(dayKey, blockId, sbIdx) {
    const ck = getCheckKey(dayKey);
    if (!state.checklist[ck]) state.checklist[ck] = {};
    const k = `${blockId}-${sbIdx}`;
    state.checklist[ck][k] = !state.checklist[ck][k];
    saveChecklist();
    renderTimeline(dayKey);
    if (state.checklist[ck][k]) showToast('✅ ทำครบแล้ว! ดีมาก 🎉', 'success');
  }

  // ─── Time Indicator ──────────────────────────────────────
  function updateTimeIndicator(dayKey, blocks) {
    const indicator = document.getElementById('time-now-indicator');
    if (!indicator) return;
    const todayKey = getDayKey(new Date().getDay());
    if (dayKey !== todayKey) { indicator.style.display = 'none'; return; }

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const label = document.getElementById('time-now-label');
    if (label) label.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    // Find which block we're in
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
      if (state.currentView === 'timeline') {
        const day = ROUTINES[state.currentDay];
        if (!day) return;
        const customKey = state.currentDay;
        const customExtra = state.customBlocks[customKey] || [];
        const allBlocks = [...day.blocks, ...customExtra].sort((a,b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        updateTimeIndicator(state.currentDay, allBlocks);
      }
    }, 30000);
  }

  // ─── Class Schedule ──────────────────────────────────────
  function renderSchedule() {
    const container = document.getElementById('view-schedule');
    if (!container) return;

    const days = ['monday','tuesday','wednesday','thursday','friday'];
    const dayLabels = { monday:'จันทร์', tuesday:'อังคาร', wednesday:'พุธ', thursday:'พฤหัส', friday:'ศุกร์' };
    const hours = [];
    for (let h = 7; h <= 19; h++) hours.push(h);
    const HOUR_PX = 50;

    // Build schedule grid
    let gridCells = `<div class="sg-time-header sg-header" style="grid-row:1;grid-column:1"></div>`;
    days.forEach((d, i) => {
      gridCells += `<div class="sg-header day-col" style="grid-row:1;grid-column:${i+2}">${d === getDayKey(new Date().getDay()) ? '⭐ ' : ''}${dayLabels[d]}</div>`;
    });
    hours.forEach((h, hi) => {
      gridCells += `<div class="sg-time-cell" style="grid-row:${hi+2};grid-column:1;height:${HOUR_PX}px">${String(h).padStart(2,'0')}:00</div>`;
      days.forEach((_, di) => {
        gridCells += `<div class="sg-cell" style="grid-row:${hi+2};grid-column:${di+2};height:${HOUR_PX}px"></div>`;
      });
    });

    // Class blocks (absolute positioned via JS after render)
    let classBlocks = '';
    days.forEach((d, di) => {
      (CLASS_SCHEDULE[d] || []).forEach(cls => {
        const sc = SUBJECT_COLORS[cls.code] || { color:'#64748b', bg:'rgba(100,116,139,0.15)', emoji:'📘', shortName:cls.code };
        const sMin = timeToMinutes(cls.start);
        const eMin = timeToMinutes(cls.end);
        const top  = ((sMin - 7*60) / 60) * HOUR_PX + HOUR_PX; // +HOUR_PX for header
        const h    = ((eMin - sMin) / 60) * HOUR_PX - 4;
        classBlocks += `
          <div class="sg-class-block" data-code="${cls.code}"
            style="
              top:${top}px; height:${h}px;
              background:${sc.bg}; color:${sc.color};
              border-left: 3px solid ${sc.color};
              grid-column:${di+2}; position:absolute;
            "
          >
            <div class="sg-class-code">${cls.code}</div>
            <div class="sg-class-name">${sc.emoji} ${sc.shortName || cls.name}</div>
            <div class="sg-class-room">📍 ${cls.room}</div>
            <div class="sg-class-time">${cls.start}–${cls.end}</div>
            <div class="sg-class-type">${cls.type}</div>
          </div>`;
      });
    });

    // Subject legend
    const legendItems = Object.entries(SUBJECT_COLORS).map(([code, sc]) => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${sc.color}"></div>
        <span style="color:${sc.color};font-weight:700">${code}</span>
        <span>${sc.shortName}</span>
      </div>`).join('');

    container.innerHTML = `
      <div class="schedule-header-row">
        <h2>📆 ตารางเรียน — ภาคเรียนที่ 1/2026</h2>
      </div>
      <div class="schedule-grid-wrap">
        <div class="schedule-grid schedule-grid-bg" style="grid-template-rows: repeat(${hours.length+1}, ${HOUR_PX}px); position:relative;">
          ${gridCells}
        </div>
      </div>
      <div style="position:relative;margin-top:8px">
        <p style="font-size:12px;color:var(--text-muted);text-align:center;margin-bottom:12px">
          💡 ตารางนี้สร้างจากข้อมูลจริง - คลิกวิชาเพื่อดูรายละเอียด
        </p>
      </div>
      <div class="subject-legend">${legendItems}</div>
      <div class="schedule-image-section" style="margin-top:24px">
        <img src="assets/schedule.png" alt="ตารางเรียนต้นฉบับ" />
        <div class="schedule-image-caption">📋 ตารางเรียนต้นฉบับ — 1st Year BME · Mahidol University · Semester 1/2026</div>
      </div>
    `;

    // Overlay absolute class blocks per day column
    const grid = container.querySelector('.schedule-grid');
    if (grid) {
      const dayColumns = {};
      grid.querySelectorAll('.sg-cell').forEach(cell => {});
      // Get header cells to position class blocks
      days.forEach((d, di) => {
        const col = di + 2;
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `position:absolute;top:0;bottom:0;left:0;right:0;pointer-events:none;grid-column:${col};grid-row:2/-1`;
        // Find column left/width by checking cells
        dayColumns[d] = { col, wrapper };
      });
    }

    // Use a simpler visual table approach
    renderScheduleTable(container);
  }

  function renderScheduleTable(container) {
    const days = ['monday','tuesday','wednesday','thursday','friday'];
    const dayLabels = { monday:'จ. (Mon)', tuesday:'อ. (Tue)', wednesday:'พ. (Wed)', thursday:'พฤ. (Thu)', friday:'ศ. (Fri)' };
    const todayKey = getDayKey(new Date().getDay());

    let classListHtml = '';
    days.forEach(d => {
      const classes = CLASS_SCHEDULE[d] || [];
      if (!classes.length) return;
      classListHtml += `<h4 style="font-size:13px;font-weight:700;color:var(--text-muted);margin-top:20px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">${dayLabels[d]} ${d === todayKey ? '⭐' : ''}</h4>`;
      classListHtml += `<div class="week-class-list">`;
      classes.forEach(cls => {
        const sc = SUBJECT_COLORS[cls.code] || { color:'#64748b', bg:'rgba(100,116,139,0.15)', emoji:'📘', shortName:cls.code };
        classListHtml += `
          <div class="week-class-item">
            <span class="wci-emoji">${sc.emoji}</span>
            <div class="wci-info">
              <div class="wci-name">${cls.name}</div>
              <div class="wci-meta">📍 ${cls.room} · ${cls.start}–${cls.end} · ${cls.type}</div>
            </div>
            <span class="wci-code" style="background:${sc.bg};color:${sc.color}">${cls.code}</span>
          </div>`;
      });
      classListHtml += `</div>`;
    });

    // Replace the grid with a clean list view
    const gridWrap = container.querySelector('.schedule-grid-wrap');
    if (gridWrap) {
      gridWrap.innerHTML = `
        <div class="glass" style="border-radius:var(--radius-lg);padding:20px 24px">
          <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:20px">
            ${days.map(d => {
              const classes = CLASS_SCHEDULE[d] || [];
              const isToday = d === todayKey;
              return `
                <div style="flex:1;min-width:140px;text-align:center;padding:16px 12px;border-radius:var(--radius-md);background:var(--bg-tertiary);border:${isToday ? '2px solid var(--accent-blue)' : '1px solid var(--glass-border)'}">
                  <div style="font-size:13px;font-weight:700;margin-bottom:4px;color:${isToday ? 'var(--accent-blue)' : 'var(--text-secondary)'}">${dayLabels[d]} ${isToday ? '⭐' : ''}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${classes.length} วิชา</div>
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
        </div>`;
    }
  }

  // ─── Week Overview ───────────────────────────────────────
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
        <div class="week-day-card ${isToday ? 'today' : ''}" data-day="${key}" onclick="app_selectDayFromWeek('${key}')">
          <div class="wdc-day">${day.short} <span style="font-size:10px;color:var(--text-muted)">${day.labelEn.substring(0,3)}</span></div>
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

    // All classes for the week
    const allClassItems = DAY_ORDER.flatMap(key => {
      const day = ROUTINES[key];
      const classes = CLASS_SCHEDULE[key] || [];
      return classes.map(cls => {
        const sc = SUBJECT_COLORS[cls.code] || { color:'#64748b', bg:'rgba(100,116,139,0.15)', emoji:'📘', shortName:cls.code };
        return `
          <div class="week-class-item">
            <span class="wci-emoji">${sc.emoji}</span>
            <div class="wci-info">
              <div class="wci-name">${cls.name} <span style="font-size:11px;color:var(--text-muted)">(${cls.type})</span></div>
              <div class="wci-meta">${day.label} · 📍 ${cls.room} · ⏰ ${cls.start}–${cls.end}</div>
            </div>
            <span class="wci-code" style="background:${sc.bg};color:${sc.color}">${cls.code}</span>
          </div>`;
      });
    }).join('');

    container.innerHTML = `
      <div class="glass" style="border-radius:var(--radius-lg);padding:20px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div>
            <div style="font-size:13px;color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:.5px">สรุปสัปดาห์นี้</div>
            <div style="font-size:28px;font-weight:800;letter-spacing:-1px">${weekStat.done} / ${weekStat.total} <span style="font-size:14px;font-weight:500;color:var(--text-muted)">บล็อก</span></div>
          </div>
          <div style="flex:1;min-width:200px">
            <div style="height:8px;border-radius:4px;background:var(--bg-tertiary);overflow:hidden">
              <div style="height:100%;border-radius:4px;background:linear-gradient(to right,var(--accent-sage),var(--accent-blue));width:${weekPct}%;transition:width 0.8s ease"></div>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${weekPct}% สำเร็จ</div>
          </div>
        </div>
      </div>
      <div class="week-grid">${dayCards}</div>
      <div class="week-classes-section">
        <h3>📚 วิชาทั้งหมดสัปดาห์นี้</h3>
        <div class="week-class-list">${allClassItems}</div>
      </div>
    `;
  }

  // Global fn for week card click
  window.app_selectDayFromWeek = function(key) {
    state.currentDay = key;
    switchView('timeline');
    renderDayTabs();
  };

  // ─── Edit Modal ──────────────────────────────────────────
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

    // Tag selector logic
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

    // Check if it's a base block or custom
    const day = ROUTINES[dayKey];
    const isBase = day.blocks.some(b => b.id === blockId);
    if (!state.customBlocks[dayKey]) state.customBlocks[dayKey] = [];

    if (isBase) {
      // Store override
      const override = state.customBlocks[dayKey].find(b => b.id === blockId);
      if (override) {
        Object.assign(override, { title, subtitle, start, end, notes, tag: selectedTag });
      } else {
        // Clone base block and override
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
    // Only allow deleting custom blocks, not base blocks
    const day = ROUTINES[dayKey];
    const isBase = day.blocks.some(b => b.id === blockId);
    if (isBase) { showToast('⚠️ ไม่สามารถลบตารางหลักได้', 'warning'); return; }
    state.customBlocks[dayKey] = state.customBlocks[dayKey].filter(b => b.id !== blockId);
    saveCustomBlocks();
    closeModal('edit-modal');
    showToast('🗑️ ลบแล้ว', 'info');
    renderTimeline(dayKey);
  }

  // ─── Add Modal ───────────────────────────────────────────
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

  // ─── Toast ───────────────────────────────────────────────
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
  function setupEventListeners() {
    // Theme toggle
    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('mob-theme-toggle')?.addEventListener('click', toggleTheme);

    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    document.querySelectorAll('.mob-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

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

    // Keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeModal('edit-modal');
        closeModal('add-modal');
      }
    });
  }

  // ─── Escape HTML ─────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  // ─── Expose & Start ──────────────────────────────────────
  window.APP = { switchView, selectDay: key => { state.currentDay = key; renderDayTabs(); renderTimeline(key); } };
  document.addEventListener('DOMContentLoaded', init);
})();
