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
    // 3rd Memory Engine State
    srsIndex: 0,
    srsShowAns: false,
    scenarioChoice: null,
  };

  // ─── Init ────────────────────────────────────────────────
  async function init() {
    loadFromStorage();
    detectTheme();
    applyTheme();
    state.currentDay = getDayKey(new Date().getDay());

    // Pull from Cloud if Sync Key exists
    if (CloudSync.getSyncKey()) {
      const cloudData = await CloudSync.pullFromCloud();
      if (cloudData) applyCloudData(cloudData);
    }
    CloudSync.updateUIStatus();

    renderAll();
    setupEventListeners();
    startClock();
    startTimeIndicator();

    // Start auto sync background polling
    CloudSync.startAutoSync(cloudData => {
      if (cloudData && hasDataChanged(cloudData)) {
        applyCloudData(cloudData);
        renderCurrentView();
      }
    });
  }

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
    CloudSync.pushToCloud(state);
  }
  function saveSubjects() {
    localStorage.setItem('sd-subjects', JSON.stringify(state.subjects));
    CloudSync.pushToCloud(state);
  }
  function saveCustomBlocks() {
    localStorage.setItem('sd-custom-blocks', JSON.stringify(state.customBlocks));
    CloudSync.pushToCloud(state);
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
    const [h,m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  function getISODate(d) {
    return d.toISOString().split('T')[0];
  }
  function getDateKey(dayKey) {
    const now = new Date();
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
    const dTabs = document.getElementById('day-tabs-wrapper');
    if (dTabs) dTabs.style.display = (viewName === 'timeline' || viewName === 'week') ? 'block' : 'none';
    renderCurrentView();
  }

  function renderCurrentView() {
    if (state.currentView === 'home') return; // static html
    else if (state.currentView === 'timeline') renderTimeline(state.currentDay);
    else if (state.currentView === 'schedule') renderSchedule();
    else if (state.currentView === 'week') renderWeek();
    else if (state.currentView === 'curriculum') renderCurriculumView();
    else if (state.currentView === 'study') renderStudyView();
    else if (state.currentView === 'scenarios') renderScenariosView();
    else if (state.currentView === 'graph') renderGraphView();
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
        </div>
        ${allBlocks.map((block, idx) => renderTimelineCard(block, idx, checks, subjects, dayKey)).join('')}
      </div>
    `;

    bindTimelineEvents(container, dayKey);
    updateTimeIndicator();
  }

  function renderStatsBar(day, checks) {
    const totalBlocks = day.blocks.length;
    const doneBlocks  = day.blocks.filter(b => checks[b.id]).length;
    const pct         = totalBlocks ? Math.round((doneBlocks / totalBlocks) * 100) : 0;
    const circumference = 2 * Math.PI * 18;
    const dashoffset    = circumference - (pct / 100) * circumference;

    return `
      <div class="stat-item">
        <span class="stat-num">${day.studyMinutes}</span>
        <span class="stat-unit">นาที</span>
        <span class="stat-lbl">ทบทวนหนังสือ</span>
      </div>
      <div class="stat-item">
        <span class="stat-num">${(day.sleepMinutes/60).toFixed(1)}</span>
        <span class="stat-unit">ชม.</span>
        <span class="stat-lbl">เวลานอน</span>
      </div>
      <div class="stat-item">
        <span class="stat-num">${doneBlocks}/${totalBlocks}</span>
        <span class="stat-unit">บล็อก</span>
        <span class="stat-lbl">เสร็จแล้ว (${pct}%)</span>
      </div>
      <div class="progress-ring-wrap">
        <svg class="progress-ring" width="48" height="48">
          <circle class="ring-bg" cx="24" cy="24" r="18"/>
          <circle class="ring-fill" cx="24" cy="24" r="18"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${dashoffset}"/>
        </svg>
        <span class="ring-pct">${pct}%</span>
      </div>
    `;
  }

  function renderTimelineCard(block, idx, checks, subjects, dayKey) {
    const tagInfo = TAGS[block.tag] || { emoji: '📌', label: block.tag, color: '#007aff', bg: 'rgba(0,122,255,0.1)', border: 'rgba(0,122,255,0.3)' };
    const isChecked = !!checks[block.id];
    let classSubjectInfo = null;

    if (block.isClass && block.classCode) {
      classSubjectInfo = SUBJECT_COLORS[block.classCode];
    }

    return `
      <div class="tl-card ${isChecked ? 'checked' : ''} ${block.isClass ? 'is-class' : ''} ${block.isStudyBlock ? 'is-study' : ''}"
           data-id="${block.id}" data-start="${block.start}" data-end="${block.end}">
        <div class="tl-time-col">
          <span class="tl-time-start">${block.start}</span>
          <span class="tl-time-end">${block.end}</span>
        </div>
        <div class="tl-content-col">
          <div class="tl-card-header">
            <span class="tag-pill" style="color:${tagInfo.color};background:${tagInfo.bg};border-color:${tagInfo.border}">
              ${tagInfo.emoji} ${tagInfo.label}
            </span>
            ${classSubjectInfo ? `
              <span class="tag-pill" style="color:${classSubjectInfo.color};background:${classSubjectInfo.bg};border-color:${classSubjectInfo.color}40">
                ${classSubjectInfo.emoji} ${classSubjectInfo.shortName}
              </span>
            ` : ''}
          </div>
          <div class="tl-title">${escHtml(block.title)}</div>
          ${block.subtitle ? `<div class="tl-subtitle">${escHtml(block.subtitle)}</div>` : ''}
          ${block.notes ? `<div class="tl-notes">📝 ${escHtml(block.notes)}</div>` : ''}
        </div>
        <div class="tl-action-col">
          <input type="checkbox" class="check-box" data-id="${block.id}" ${isChecked ? 'checked' : ''} title="ทำเสร็จแล้ว" />
        </div>
      </div>
    `;
  }

  function bindTimelineEvents(container, dayKey) {
    const checkKey = getCheckKey(dayKey);

    container.querySelectorAll('.check-box').forEach(box => {
      box.addEventListener('change', e => {
        const id = e.target.dataset.id;
        if (!state.checklist[checkKey]) state.checklist[checkKey] = {};
        state.checklist[checkKey][id] = e.target.checked;
        saveChecklist();

        const card = container.querySelector(`.tl-card[data-id="${id}"]`);
        if (card) card.classList.toggle('checked', e.target.checked);

        const day = ROUTINES[dayKey];
        const statsEl = container.querySelector('.stats-bar');
        if (statsEl && day) statsEl.innerHTML = renderStatsBar(day, state.checklist[checkKey]);
      });
    });

    document.getElementById('add-block-btn')?.addEventListener('click', () => {
      state.addingDay = dayKey;
      openAddModal();
    });
  }

  // ─── Week View (9th Original View 2) ─────────────────────
  function renderWeek() {
    const container = document.getElementById('view-week');
    if (!container) return;

    container.innerHTML = `
      <div class="stats-bar glass" style="margin-bottom:20px">
        <div>
          <h2 style="font-size:16px;font-weight:600">ภาพรวมสัปดาห์ BME 2026</h2>
          <p style="font-size:12px;color:var(--label-2)">ตารางกิจกรรม 7 วันเรียงต่อกัน</p>
        </div>
      </div>
      <div class="week-grid">
        ${DAY_ORDER.map(key => renderWeekDayCard(key)).join('')}
      </div>
    `;

    container.querySelectorAll('.week-day-card').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.dataset.day;
        selectDay(key);
        switchView('timeline');
      });
    });
  }

  function renderWeekDayCard(dayKey) {
    const day = ROUTINES[dayKey];
    const checkKey = getCheckKey(dayKey);
    const checks = state.checklist[checkKey] || {};
    const done = day.blocks.filter(b => checks[b.id]).length;
    const total = day.blocks.length;

    return `
      <div class="week-day-card" data-day="${dayKey}">
        <div class="week-day-header">
          <div>
            <span class="week-day-name">${day.label}</span>
            <span class="week-day-en">${day.labelEn}</span>
          </div>
          <span class="status-badge ${day.status}" style="font-size:10px;padding:2px 6px">
            ${day.statusEmoji}
          </span>
        </div>
        <div style="font-size:11px;color:var(--label-3);margin-bottom:8px">เสร็จ ${done}/${total} บล็อก</div>
        <div class="week-day-blocks">
          ${day.blocks.slice(0,5).map(b => `
            <div class="week-block-item ${checks[b.id] ? 'done' : ''}">
              <span class="dot" style="background:${(TAGS[b.tag]||{}).color||'#007aff'}"></span>
              <span class="title">${escHtml(b.title)}</span>
            </div>
          `).join('')}
          ${total > 5 ? `<div style="font-size:10px;color:var(--label-3)">+ อีก ${total-5} บล็อก</div>` : ''}
        </div>
      </div>
    `;
  }

  // ─── Schedule View (9th Original View 3) ─────────────────
  function renderSchedule() {
    const container = document.getElementById('view-schedule');
    if (!container) return;

    const days = ['monday','tuesday','wednesday','thursday','friday'];

    container.innerHTML = `
      <div class="stats-bar glass" style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <h2 style="font-size:16px;font-weight:600">ตารางเรียนวิชา BME 2026/1</h2>
          <p style="font-size:12px;color:var(--label-2)">Program B-BI Mahidol University</p>
        </div>
        <button class="btn btn-primary" id="open-schedule-img-btn" style="font-size:12px;padding:6px 12px">
          🔍 ดูรูปตารางเรียนเต็ม
        </button>
      </div>

      <div style="margin-bottom:24px;border-radius:var(--r-l);overflow:hidden;border:0.5px solid var(--sep);background:#000;cursor:pointer" id="schedule-img-banner">
        <img src="/egmu-class-schedule-2026-1-program_B-BI.png" alt="Class Schedule" style="width:100%;height:auto;display:block;opacity:0.9" />
      </div>

      <div class="week-grid">
        ${days.map(dayKey => {
          const list = CLASS_SCHEDULE[dayKey] || [];
          const day = ROUTINES[dayKey];
          return `
            <div class="card" style="padding:14px">
              <h3 style="font-size:14px;font-weight:600;margin-bottom:10px;color:var(--accent)">${day.label} (${day.labelEn})</h3>
              ${list.length === 0 ? `<p style="font-size:12px;color:var(--label-3)">ไม่มีเรียน</p>` : list.map(c => `
                <div style="background:var(--bg-3);padding:8px 10px;border-radius:var(--r-m);margin-bottom:8px">
                  <div style="font-size:11px;font-weight:700;color:var(--accent)">${c.code} · ${c.type}</div>
                  <div style="font-size:12.5px;font-weight:600;color:var(--label)">${escHtml(c.name)}</div>
                  <div style="font-size:11px;color:var(--label-2);margin-top:2px">📍 ${escHtml(c.room)} | 🕒 ${c.start}-${c.end}</div>
                </div>
              `).join('')}
            </div>
          `;
        }).join('')}
      </div>
    `;

    document.getElementById('open-schedule-img-btn')?.addEventListener('click', openScheduleImageModal);
    document.getElementById('schedule-img-banner')?.addEventListener('click', openScheduleImageModal);
  }

  function openScheduleImageModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.style.zIndex = '3000';
    modal.innerHTML = `
      <div style="max-width:90vw;max-height:90vh;overflow:auto;background:var(--bg-2);padding:14px;border-radius:var(--r-l)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-weight:600;font-size:14px">BME 2026/1 Official Schedule</span>
          <button class="modal-close" id="close-img-modal">✕</button>
        </div>
        <img src="/egmu-class-schedule-2026-1-program_B-BI.png" style="max-width:100%;height:auto" />
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-img-modal')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  // ─── 3rd Feature Views (Curriculum, Study, Scenarios, Graph) ───
  function renderCurriculumView() {
    const container = document.getElementById('view-curriculum');
    if (!container) return;
    const list = [
      { code: 'SCPY161', name: 'General Physics I', room: 'L2-002' },
      { code: 'EGBI122', name: 'Computer Programming', room: 'R335' },
      { code: 'LAEN182', name: 'English General Academic', room: 'Room 320' },
      { code: 'SCBE102', name: 'General Biology Lab 1', room: 'Lab SC' },
      { code: 'EGBI100', name: 'BME in Real World', room: 'R238' },
      { code: 'SCMA101', name: 'Mathematics I', room: 'SC1-152' }
    ];

    container.innerHTML = `
      <div class="stats-bar glass" style="margin-bottom:20px">
        <div>
          <h2 style="font-size:16px;font-weight:600">BME Curriculum 2026</h2>
          <p style="font-size:12px;color:var(--label-2)">โครงสร้างหลักสูตรวิศวกรรมชีวแพทย์ มหาวิทยาลัยมหิดล</p>
        </div>
      </div>
      <div class="week-grid">
        ${list.map(c => `
          <div class="card" style="padding:16px">
            <span class="status-badge dorm" style="font-size:10px">${c.code}</span>
            <h3 style="font-size:14px;font-weight:600;margin:8px 0">${c.name}</h3>
            <p style="font-size:12px;color:var(--label-2)">ห้องเรียน: ${c.room}</p>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderStudyView() {
    const container = document.getElementById('view-study');
    if (!container) return;
    const cards = MEMORY_DATA.flashcards || [];

    if (state.srsIndex >= cards.length) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:40px;max-width:500px;margin:0 auto">
          <div style="font-size:36px;margin-bottom:10px">🎉</div>
          <h3 style="font-size:16px;font-weight:600">ทบทวนการ์ดเสร็จสิ้น!</h3>
          <p style="font-size:12px;color:var(--label-2);margin:8px 0 16px">ระบบ FSRS-5 คำนวณความถี่รอบถัดไปเรียบร้อยแล้ว</p>
          <button class="btn btn-primary" id="reset-srs-btn">เริ่มใหม่</button>
        </div>
      `;
      container.querySelector('#reset-srs-btn')?.addEventListener('click', () => {
        state.srsIndex = 0;
        state.srsShowAns = false;
        renderStudyView();
      });
      return;
    }

    const card = cards[state.srsIndex];
    container.innerHTML = `
      <div style="max-width:560px;margin:0 auto">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--label-2);margin-bottom:8px">
          <span>${card.code} · ${card.subject}</span>
          <span>Card ${state.srsIndex+1}/${cards.length}</span>
        </div>
        <div class="card" id="srs-card-box" style="padding:28px;text-align:center;min-height:220px;cursor:pointer">
          <div style="font-size:11px;color:var(--label-3);text-align:right">คลิกเพื่อเฉลย</div>
          <div style="font-size:16px;font-weight:600;margin:20px 0">${escHtml(card.question)}</div>
          ${state.srsShowAns ? `
            <div style="border-top:1px solid var(--sep);padding-top:14px;margin-top:14px">
              <div style="font-size:11px;color:var(--label-2);text-transform:uppercase">เฉลย</div>
              <div style="font-size:14px;font-weight:600;color:var(--accent);margin-top:4px">${escHtml(card.answer)}</div>
            </div>
          ` : ''}
        </div>

        ${state.srsShowAns ? `
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px">
            <button class="btn rate-btn rate-again" data-r="1">Again</button>
            <button class="btn rate-btn rate-hard"  data-r="2">Hard</button>
            <button class="btn rate-btn rate-good"  data-r="3">Good</button>
            <button class="btn rate-btn rate-easy"  data-r="4">Easy</button>
          </div>
        ` : `
          <button class="btn btn-primary" id="show-ans-btn" style="width:100%;margin-top:14px;padding:10px">แสดงเฉลย (Show Answer)</button>
        `}
      </div>
    `;

    container.querySelector('#srs-card-box')?.addEventListener('click', () => {
      state.srsShowAns = !state.srsShowAns;
      renderStudyView();
    });
    container.querySelector('#show-ans-btn')?.addEventListener('click', () => {
      state.srsShowAns = true;
      renderStudyView();
    });
    container.querySelectorAll('.rate-btn').forEach(b => {
      b.addEventListener('click', () => {
        state.srsIndex += 1;
        state.srsShowAns = false;
        renderStudyView();
      });
    });
  }

  function renderScenariosView() {
    const container = document.getElementById('view-scenarios');
    if (!container) return;
    const scen = (MEMORY_DATA.scenarios || [])[0];
    if (!scen) return;

    container.innerHTML = `
      <div style="max-width:560px;margin:0 auto">
        <div class="card" style="padding:20px">
          <span class="status-badge" style="background:rgba(255,59,48,0.1);color:#ff3b30">Scenario: ${scen.domain}</span>
          <h3 style="font-size:15px;font-weight:600;margin:10px 0">${scen.title}</h3>
          <p style="font-size:12.5px;color:var(--label-2);background:var(--bg-3);padding:10px;border-radius:var(--r-m)">${scen.prompt}</p>
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:6px">
            ${scen.choices.map((ch, idx) => `
              <button class="btn btn-secondary choice-btn" data-idx="${idx}" style="text-align:left;font-size:12px">${ch.text}</button>
            `).join('')}
          </div>
          ${state.scenarioChoice !== null ? `
            <div style="margin-top:12px;padding:10px;border-radius:var(--r-m);font-size:12px;${scen.choices[state.scenarioChoice].correct ? 'background:rgba(52,199,89,0.1);color:#34c759' : 'background:rgba(255,59,48,0.1);color:#ff3b30'}">
              ${scen.choices[state.scenarioChoice].feedback}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    container.querySelectorAll('.choice-btn').forEach(b => {
      b.addEventListener('click', e => {
        state.scenarioChoice = parseInt(e.currentTarget.dataset.idx, 10);
        renderScenariosView();
      });
    });
  }

  function renderGraphView() {
    const container = document.getElementById('view-graph');
    if (!container) return;
    const nodes = MEMORY_DATA.concepts || [];

    container.innerHTML = `
      <div class="stats-bar glass" style="margin-bottom:20px">
        <div>
          <h2 style="font-size:16px;font-weight:600">BME Concept Knowledge Graph</h2>
          <p style="font-size:12px;color:var(--label-2)">ผังเชื่อมโยงความสัมพันธ์ของหัวข้อวิชา BME 2026</p>
        </div>
      </div>
      <div class="week-grid">
        ${nodes.map(n => `
          <div class="card" style="padding:16px">
            <span class="status-badge dorm" style="font-size:10px">${n.category}</span>
            <h3 style="font-size:14px;font-weight:600;margin:6px 0">${n.title}</h3>
            <p style="font-size:12px;color:var(--label-2)">${n.description}</p>
            <div style="margin-top:8px;font-size:10px;color:var(--label-3)">เชื่อมโยง: ${n.connectedTo.join(', ')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── Time Indicator ──────────────────────────────────────
  function startTimeIndicator() {
    setInterval(updateTimeIndicator, 60000);
  }
  function updateTimeIndicator() {
    const el = document.getElementById('time-now-indicator');
    const lbl = document.getElementById('time-now-label');
    if (!el) return;

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const todayKey = getDayKey(now.getDay());

    if (state.currentView !== 'timeline' || state.currentDay !== todayKey) {
      el.style.display = 'none';
      return;
    }

    const day = ROUTINES[todayKey];
    if (!day || !day.blocks.length) { el.style.display = 'none'; return; }

    const firstStart = timeToMinutes(day.blocks[0].start);
    const lastEnd    = timeToMinutes(day.blocks[day.blocks.length - 1].end);

    if (currentMins < firstStart || currentMins > lastEnd) {
      el.style.display = 'none';
      return;
    }

    const totalRange = lastEnd - firstStart;
    const pct = ((currentMins - firstStart) / totalRange) * 100;

    el.style.display = 'flex';
    el.style.top = `${Math.min(Math.max(pct, 2), 98)}%`;
    if (lbl) lbl.textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  function startClock() {
    const clockEl = document.getElementById('clock');
    if (!clockEl) return;
    const update = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('th-TH', { hour12: false });
    };
    update();
    setInterval(update, 1000);
  }

  function formatDayDate(dayKey) {
    const dateKey = getDateKey(dayKey);
    const [y,m,d] = dateKey.split('-');
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${parseInt(d,10)} ${months[parseInt(m,10)-1]} ${parseInt(y,10)+543}`;
  }

  // ─── Modals ──────────────────────────────────────────────
  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }
  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  function openAddModal() {
    const modal = document.getElementById('add-modal');
    const body  = modal?.querySelector('.modal-body');
    if (!body) return;

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">ชื่อกิจกรรม</label>
        <input class="form-input" id="add-title" type="text" placeholder="เช่น อ่านหนังสือ GenPhy" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">เวลาเริ่ม</label>
          <input class="form-input" id="add-start" type="time" value="19:00" />
        </div>
        <div class="form-group">
          <label class="form-label">เวลาสิ้นสุด</label>
          <input class="form-input" id="add-end" type="time" value="20:00" />
        </div>
      </div>
    `;

    openModal('add-modal');
  }

  function saveNewBlock() {
    const title = document.getElementById('add-title')?.value.trim();
    const start = document.getElementById('add-start')?.value;
    const end   = document.getElementById('add-end')?.value;

    if (!title) {
      showToast('⚠️ กรุณากรอกชื่อกิจกรรม', 'warning');
      return;
    }

    const dayKey = state.addingDay || state.currentDay;
    if (!state.customBlocks[dayKey]) state.customBlocks[dayKey] = [];

    const newBlock = {
      id: `custom-${Date.now()}`,
      start: start || '19:00',
      end: end || '20:00',
      title,
      tag: 'study',
      notes: 'เพิ่มเอง'
    };

    state.customBlocks[dayKey].push(newBlock);
    saveCustomBlocks();
    closeModal('add-modal');
    renderCurrentView();
    showToast('✅ เพิ่มกิจกรรมสำเร็จ!', 'success');
  }

  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 250);
    }, 2500);
  }

  // ─── Event Listeners ─────────────────────────────────────
  function setupEventListeners() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', e => {
        const view = e.currentTarget.dataset.view;
        if (view) switchView(view);
      });
    });

    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('mob-theme-toggle')?.addEventListener('click', toggleTheme);

    document.getElementById('add-cancel-btn')?.addEventListener('click', () => closeModal('add-modal'));
    document.getElementById('add-cancel-btn-footer')?.addEventListener('click', () => closeModal('add-modal'));
    document.getElementById('add-save-btn')?.addEventListener('click', saveNewBlock);

    document.getElementById('cloud-sync-btn')?.addEventListener('click', () => {
      const input = document.getElementById('sync-key-input');
      if (input) input.value = CloudSync.getSyncKey();
      openModal('sync-modal');
    });

    document.getElementById('sync-cancel-btn')?.addEventListener('click', () => closeModal('sync-modal'));
    document.getElementById('sync-connect-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('sync-key-input');
      const key = input?.value.trim();
      if (!key) return;
      CloudSync.setSyncKey(key);
      const cloudData = await CloudSync.pullFromCloud();
      if (cloudData) applyCloudData(cloudData);
      else await CloudSync.pushToCloud(state);
      closeModal('sync-modal');
      renderCurrentView();
      showToast('✅ ซิงค์ Cloud สำเร็จ!', 'success');
    });

    document.getElementById('sync-disconnect-btn')?.addEventListener('click', () => {
      CloudSync.setSyncKey('');
      closeModal('sync-modal');
      renderCurrentView();
      showToast('⚪ ยกเลิก Sync Key แล้ว', 'info');
    });
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
