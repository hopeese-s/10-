// ============================================================
// app.js — EgBE Memory Engine & Daily Study Dashboard
// Main Application Logic
// ============================================================

(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────
  const state = {
    currentDay: 'monday',
    currentView: 'home',       // 'home' | 'dashboard' | 'curriculum' | 'study' | 'scenarios' | 'graph'
    currentSubview: 'timeline',// 'timeline' | 'week' | 'schedule'
    theme: 'light',
    checklist: {},
    subjects: {},
    customBlocks: {},
    // 3rd Study / SRS State
    srsIndex: 0,
    srsShowAns: false,
    scenarioChoice: null,
  };

  // ─── Init ────────────────────────────────────────────────
  async function init() {
    loadFromStorage();
    detectTheme();
    applyTheme();
    state.currentDay = getDayKey(new Date().getDay()) || 'monday';

    if (CloudSync.getSyncKey()) {
      const cloudData = await CloudSync.pullFromCloud();
      if (cloudData) applyCloudData(cloudData);
    }
    CloudSync.updateUIStatus();

    renderAll();
    setupEventListeners();
    startClock();

    CloudSync.startAutoSync(cloudData => {
      if (cloudData && hasDataChanged(cloudData)) {
        applyCloudData(cloudData);
        renderCurrentView();
      }
    });
  }

  function hasDataChanged(cloudData) {
    if (!cloudData) return false;
    return (
      JSON.stringify(state.checklist) !== JSON.stringify(cloudData.checklist || {}) ||
      JSON.stringify(state.subjects) !== JSON.stringify(cloudData.subjects || {}) ||
      JSON.stringify(state.customBlocks) !== JSON.stringify(cloudData.customBlocks || {})
    );
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
      state.theme = localStorage.getItem('sd-theme') || 'light';
      state.checklist = JSON.parse(localStorage.getItem('sd-checklist') || '{}');
      state.subjects = JSON.parse(localStorage.getItem('sd-subjects') || '{}');
      state.customBlocks = JSON.parse(localStorage.getItem('sd-custom-blocks') || '{}');
    } catch(e) {}
  }

  function saveChecklist() {
    localStorage.setItem('sd-checklist', JSON.stringify(state.checklist));
    CloudSync.pushToCloud(state);
  }

  function detectTheme() {
    if (!localStorage.getItem('sd-theme')) {
      state.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = state.theme === 'dark' ? '☀️' : '🌙';
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    localStorage.setItem('sd-theme', state.theme);
  }

  function startClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const update = () => {
      const now = new Date();
      el.textContent = now.toLocaleTimeString('th-TH', { hour12: false });
    };
    update();
    setInterval(update, 1000);
  }

  function getDayKey(jsDay) {
    const map = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    return map[jsDay];
  }

  // ─── View Routing ─────────────────────────────────────────
  function switchView(viewName) {
    state.currentView = viewName;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewName}`)?.classList.add('active');

    document.querySelectorAll('.nav-link').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
    document.querySelectorAll('.mob-nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderCurrentView();
  }

  function switchSubview(subviewName) {
    state.currentSubview = subviewName;
    document.querySelectorAll('.subview').forEach(sv => {
      sv.style.display = sv.id === `subview-${subviewName}` ? 'block' : 'none';
    });
    document.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.subview === subviewName);
    });
    renderDashboardView();
  }

  function renderAll() {
    renderDayTabs();
    renderCurrentView();
  }

  function renderCurrentView() {
    if (state.currentView === 'home') return; // Static hero content in HTML
    else if (state.currentView === 'dashboard') renderDashboardView();
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
      btn.innerHTML = `<span>${day.short} ${day.labelEn.substring(0,3)}</span>`;
      btn.addEventListener('click', () => {
        state.currentDay = key;
        renderDayTabs();
        if (state.currentView === 'dashboard') renderDashboardView();
      });
      container.appendChild(btn);
    });
  }

  // ─── View 1: Dashboard (9th Core Workspace) ───────────────
  function renderDashboardView() {
    const dayTabsWrapper = document.getElementById('day-tabs-wrapper');
    if (dayTabsWrapper) {
      dayTabsWrapper.style.display = (state.currentSubview === 'timeline' || state.currentSubview === 'week') ? 'block' : 'none';
    }

    if (state.currentSubview === 'timeline') renderTimelineSubview();
    else if (state.currentSubview === 'week') renderWeekSubview();
    else if (state.currentSubview === 'schedule') renderScheduleSubview();
  }

  function renderTimelineSubview() {
    const container = document.getElementById('subview-timeline');
    if (!container) return;

    const dayKey = state.currentDay;
    const day = ROUTINES[dayKey];
    if (!day) return;

    const checkKey = `${dayKey}-${new Date().toISOString().split('T')[0]}`;
    const checks = state.checklist[checkKey] || {};

    const completed = day.blocks.filter(b => checks[b.id]).length;
    const pct = day.blocks.length > 0 ? Math.round((completed / day.blocks.length) * 100) : 0;

    container.innerHTML = `
      <div class="stats-bar">
        <div>
          <h2 style="font-family:var(--font-serif);font-size:1.25rem;font-weight:700">${day.labelEn} · ${day.label}</h2>
          <p style="font-size:12px;color:var(--text-muted);margin-top:2px">BME 2026 Daily Schedule & Checklist</p>
        </div>
        <div style="display:flex;align-items:center;gap:1rem">
          <div style="text-align:right">
            <span style="font-size:1.125rem;font-weight:700;color:var(--accent)">${pct}%</span>
            <div style="font-size:11px;color:var(--text-muted)">${completed}/${day.blocks.length} Completed</div>
          </div>
          <span class="online-pill">${day.statusEmoji} ${day.statusLabel}</span>
        </div>
      </div>

      <div style="margin-bottom:1.5rem;display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:1.125rem;font-weight:700">กิจกรรมประจำวัน</h3>
        <button class="btn-pill" id="add-block-btn">＋ เพิ่มกิจกรรม</button>
      </div>

      <div class="timeline">
        ${day.blocks.map(b => {
          const isDone = !!checks[b.id];
          return `
            <div class="tl-item ${isDone ? 'completed' : ''}" data-id="${b.id}">
              <div style="display:flex;align-items:center;gap:12px">
                <input type="checkbox" ${isDone ? 'checked' : ''} style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer" />
                <div>
                  <div style="font-weight:600;font-size:14px;color:var(--text-main)">${escHtml(b.title)}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escHtml(b.start)} - ${escHtml(b.end)} ${b.subtitle ? `· ${escHtml(b.subtitle)}` : ''}</div>
                </div>
              </div>
              <span class="online-pill" style="background:var(--accent-bg);color:var(--accent)">${escHtml(b.tag)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Bind checkboxes
    container.querySelectorAll('.tl-item').forEach(el => {
      const chk = el.querySelector('input[type="checkbox"]');
      el.addEventListener('click', (e) => {
        if (e.target !== chk) chk.checked = !chk.checked;
        const id = el.dataset.id;
        if (!state.checklist[checkKey]) state.checklist[checkKey] = {};
        state.checklist[checkKey][id] = chk.checked;
        saveChecklist();
        renderTimelineSubview();
      });
    });

    document.getElementById('add-block-btn')?.addEventListener('click', () => {
      openModal('add-modal');
    });
  }

  function renderWeekSubview() {
    const container = document.getElementById('subview-week');
    if (!container) return;

    container.innerHTML = `
      <div class="stats-bar" style="margin-bottom:1.5rem">
        <div>
          <h2 style="font-family:var(--font-serif);font-size:1.25rem;font-weight:700">ภาพรวมสัปดาห์ BME 2026</h2>
          <p style="font-size:12px;color:var(--text-muted);margin-top:2px">ตารางสรุปกิจกรรมทั้ง 7 วัน</p>
        </div>
      </div>
      <div class="cards-grid">
        ${DAY_ORDER.map(key => {
          const day = ROUTINES[key];
          const checkKey = `${key}-${new Date().toISOString().split('T')[0]}`;
          const checks = state.checklist[checkKey] || {};
          const done = day.blocks.filter(b => checks[b.id]).length;
          return `
            <div class="card-item" data-day="${key}" style="cursor:pointer">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="font-weight:700;font-size:14px;color:var(--accent)">${day.label} (${day.short})</span>
                <span class="online-pill">${day.statusEmoji}</span>
              </div>
              <p style="font-size:12px;color:var(--text-muted)">เสร็จแล้ว ${done}/${day.blocks.length} บล็อก</p>
              <div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">
                ${day.blocks.slice(0,4).map(b => `
                  <div style="font-size:11px;color:var(--text-main);${checks[b.id] ? 'text-decoration:line-through;opacity:0.5' : ''}">• ${escHtml(b.title)}</div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.querySelectorAll('.card-item').forEach(card => {
      card.addEventListener('click', () => {
        state.currentDay = card.dataset.day;
        renderDayTabs();
        switchSubview('timeline');
      });
    });
  }

  function renderScheduleSubview() {
    const container = document.getElementById('subview-schedule');
    if (!container) return;

    container.innerHTML = `
      <div class="stats-bar" style="margin-bottom:1.5rem;display:flex;justify-content:space-between;align-items:center">
        <div>
          <h2 style="font-family:var(--font-serif);font-size:1.25rem;font-weight:700">ตารางเรียนวิชา BME 2026/1 (Program B-BI)</h2>
          <p style="font-size:12px;color:var(--text-muted);margin-top:2px">คลิกที่รูปเพื่อเปิดดูตารางเต็มความละเอียดสูง</p>
        </div>
        <button class="btn-pill" id="open-img-modal-btn" style="background:var(--accent);color:#fff">🔍 ดูรูปเต็ม</button>
      </div>

      <div style="border-radius:var(--r-l);overflow:hidden;border:1px solid var(--border-color);background:#000;cursor:pointer;margin-bottom:1.5rem" id="schedule-img-card">
        <img src="/egmu-class-schedule-2026-1-program_B-BI.png" alt="Class Schedule" style="width:100%;height:auto;display:block;opacity:0.95" />
      </div>
    `;

    const openModalImg = () => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay open';
      modal.style.zIndex = '3000';
      modal.innerHTML = `
        <div style="max-width:92vw;max-height:92vh;overflow:auto;background:var(--bg-card);padding:1.5rem;border-radius:var(--r-l);border:1px solid var(--border-color)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
            <span style="font-family:var(--font-serif);font-weight:700;font-size:1.125rem">Mahidol BME Class Schedule 2026/1</span>
            <button class="modal-close" id="close-img-modal">✕</button>
          </div>
          <img src="/egmu-class-schedule-2026-1-program_B-BI.png" style="max-width:100%;height:auto;display:block;border-radius:var(--r-m)" />
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#close-img-modal')?.addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    };

    document.getElementById('open-img-modal-btn')?.addEventListener('click', openModalImg);
    document.getElementById('schedule-img-card')?.addEventListener('click', openModalImg);
  }

  // ─── View 2: Curriculum (3rd Core) ────────────────────────
  function renderCurriculumView() {
    const container = document.getElementById('view-curriculum');
    if (!container) return;

    const courses = [
      { code: 'SCPY161', type: 'Lecture/Lab', name: 'General Physics I', room: 'L2-002', time: '09:00 - 12:00 น.' },
      { code: 'EGBI122', type: 'Lecture/Lab', name: 'Computer Programming', room: 'R335', time: '13:00 - 16:00 น.' },
      { code: 'LAEN182', type: 'Lecture', name: 'English General Academic', room: 'Room 320', time: '09:00 - 12:00 น.' },
      { code: 'SCBE102', type: 'Lab', name: 'General Biology Lab 1', room: 'Lab SC', time: '13:00 - 16:00 น.' },
      { code: 'EGBI100', type: 'Lecture', name: 'BME in Real World', room: 'R238', time: '10:00 - 12:00 น.' },
      { code: 'SCMA101', type: 'Lecture', name: 'Mathematics I', room: 'SC1-152', time: '13:00 - 15:00 น.' }
    ];

    container.innerHTML = `
      <div style="margin-bottom:2rem">
        <h2 style="font-family:var(--font-serif);font-size:1.5rem;font-weight:700">Mahidol BME Curriculum 2026</h2>
        <p style="font-size:13px;color:var(--text-muted);margin-top:4px">รายวิชาและโครงสร้างหลักสูตรวิศวกรรมชีวแพทย์</p>
      </div>

      <div class="cards-grid">
        ${courses.map(c => `
          <div class="card-item">
            <span class="online-pill" style="background:var(--accent-bg);color:var(--accent);margin-bottom:8px">${escHtml(c.code)} · ${escHtml(c.type)}</span>
            <h3 style="font-size:15px;font-weight:700;margin:6px 0">${escHtml(c.name)}</h3>
            <p style="font-size:12px;color:var(--text-muted)">ห้องเรียน: ${escHtml(c.room)}</p>
            <p style="font-size:12px;color:var(--text-muted);margin-top:2px">เวลา: ${escHtml(c.time)}</p>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── View 3: Study (FSRS-5 Flashcards) ────────────────────
  function renderStudyView() {
    const container = document.getElementById('view-study');
    if (!container) return;

    const cards = MEMORY_DATA.flashcards || [];

    if (state.srsIndex >= cards.length) {
      container.innerHTML = `
        <div class="study-box" style="text-align:center;padding:3rem;background:var(--bg-card);border-radius:var(--r-l);border:1px solid var(--border-color)">
          <div style="font-size:40px;margin-bottom:1rem">🎉</div>
          <h2 style="font-family:var(--font-serif);font-size:1.375rem;font-weight:700">ทบทวนการ์ดประจำรอบเสร็จสิ้น!</h2>
          <p style="font-size:13px;color:var(--text-muted);margin:8px 0 20px">ระบบคำนวณช่วงเวลาทบทวนถัดไปตาม FSRS-5 เรียบร้อยแล้ว</p>
          <button class="btn-pill" id="restart-srs" style="background:var(--accent);color:#fff">เริ่มทบทวนอีกครั้ง</button>
        </div>
      `;
      document.getElementById('restart-srs')?.addEventListener('click', () => {
        state.srsIndex = 0;
        state.srsShowAns = false;
        renderStudyView();
      });
      return;
    }

    const card = cards[state.srsIndex];

    container.innerHTML = `
      <div class="study-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <span class="online-pill" style="background:var(--accent-bg);color:var(--accent);font-weight:700">${escHtml(card.code)} · ${escHtml(card.subject)}</span>
          <span style="font-size:12px;color:var(--text-muted)">Card ${state.srsIndex + 1} / ${cards.length}</span>
        </div>

        <div class="srs-card-surface" id="srs-card-element">
          <div style="font-size:11px;color:var(--text-light);text-align:right">คลิกเพื่อเปิดเฉลย</div>
          <div style="font-size:17px;font-weight:600;line-height:1.5;margin:1.5rem 0">
            ${escHtml(card.question)}
          </div>

          ${state.srsShowAns ? `
            <div style="border-top:1px solid var(--border-color);padding-top:1rem;margin-top:1rem">
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">เฉลย (Answer)</div>
              <div style="font-size:15px;font-weight:600;color:var(--accent)">${escHtml(card.answer)}</div>
              ${card.formula ? `<div style="font-family:var(--font-mono);font-size:12px;background:var(--bg-secondary);padding:6px 10px;border-radius:6px;margin-top:10px">${escHtml(card.formula)}</div>` : ''}
            </div>
          ` : ''}

          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-light)">
            <span>Stability: ${card.stability}d</span>
            <span>Difficulty: ${card.difficulty}</span>
          </div>
        </div>

        ${state.srsShowAns ? `
          <div class="ratings-grid">
            <button class="rate-btn rate-again" data-rating="1"><span>Again</span><span style="font-size:10px;font-weight:400">&lt; 1d</span></button>
            <button class="rate-btn rate-hard"  data-rating="2"><span>Hard</span><span style="font-size:10px;font-weight:400">~ 2d</span></button>
            <button class="rate-btn rate-good"  data-rating="3"><span>Good</span><span style="font-size:10px;font-weight:400">~ 4d</span></button>
            <button class="rate-btn rate-easy"  data-rating="4"><span>Easy</span><span style="font-size:10px;font-weight:400">~ 7d</span></button>
          </div>
        ` : `
          <button class="btn-pill" id="show-ans-btn" style="width:100%;margin-top:1rem;padding:12px;justify-content:center;background:var(--accent);color:#fff">
            แสดงเฉลย (Show Answer)
          </button>
        `}
      </div>
    `;

    document.getElementById('srs-card-element')?.addEventListener('click', () => {
      state.srsShowAns = !state.srsShowAns;
      renderStudyView();
    });

    document.getElementById('show-ans-btn')?.addEventListener('click', () => {
      state.srsShowAns = true;
      renderStudyView();
    });

    container.querySelectorAll('.rate-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const rating = parseInt(e.currentTarget.dataset.rating, 10);
        const c = cards[state.srsIndex];
        if (c) {
          c.reps = (c.reps || 0) + 1;
          if (rating === 1) c.stability = 0.5;
          else if (rating === 2) c.stability = Math.round((c.stability || 1) * 1.5 * 10) / 10;
          else if (rating === 3) c.stability = Math.round((c.stability || 1) * 2.5 * 10) / 10;
          else if (rating === 4) c.stability = Math.round((c.stability || 1) * 4.0 * 10) / 10;
        }
        state.srsIndex += 1;
        state.srsShowAns = false;
        renderStudyView();
      });
    });
  }

  // ─── View 4: Scenarios (3rd Clinical Decision Trees) ──────
  function renderScenariosView() {
    const container = document.getElementById('view-scenarios');
    if (!container) return;

    const scen = (MEMORY_DATA.scenarios || [])[0];
    if (!scen) return;

    container.innerHTML = `
      <div class="study-box">
        <div class="card-item" style="padding:2rem">
          <span class="online-pill" style="background:rgba(239,68,68,0.1);color:#ef4444">Scenario: ${escHtml(scen.domain)}</span>
          <h2 style="font-family:var(--font-serif);font-size:1.25rem;font-weight:700;margin:10px 0">${escHtml(scen.title)}</h2>
          <p style="font-size:13px;color:var(--text-muted);line-height:1.5;background:var(--bg-secondary);padding:14px;border-radius:var(--r-m);margin:12px 0">${escHtml(scen.prompt)}</p>

          <div style="display:flex;flex-direction:column;gap:8px;margin-top:1rem">
            <div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase">เลือกการตัดสินใจทางการแพทย์ / วิศวกรรม:</div>
            ${scen.choices.map((ch, idx) => `
              <button class="scenario-choice-btn" data-idx="${idx}" style="padding:12px 14px;border-radius:var(--r-m);border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-main);font-size:13px;text-align:left;cursor:pointer">
                ${escHtml(ch.text)}
              </button>
            `).join('')}
          </div>

          ${state.scenarioChoice !== null ? `
            <div style="margin-top:1rem;padding:14px;border-radius:var(--r-m);font-size:13px;line-height:1.4;${
              scen.choices[state.scenarioChoice].correct
                ? 'background:rgba(34,197,94,0.1);color:#15803d;border:1px solid rgba(34,197,94,0.3)'
                : 'background:rgba(239,68,68,0.1);color:#b91c1c;border:1px solid rgba(239,68,68,0.3)'
            }">
              ${escHtml(scen.choices[state.scenarioChoice].feedback)}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    container.querySelectorAll('.scenario-choice-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.scenarioChoice = parseInt(e.currentTarget.dataset.idx, 10);
        renderScenariosView();
      });
    });
  }

  // ─── View 5: Graph (`/graph` matching bme-revision-tools-w2oj.vercel.app) ───
  function renderGraphView() {
    const container = document.getElementById('view-graph');
    if (!container) return;

    const nodes = MEMORY_DATA.concepts || [];

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <h2 style="font-family:var(--font-serif);font-size:1.5rem;font-weight:700">BME Concept Knowledge Graph</h2>
            <p style="font-size:13px;color:var(--text-muted);margin-top:2px">ผังเชื่อมโยงความสัมพันธ์ของหัวข้อวิชา Biomedical Engineering</p>
          </div>
          <span class="online-pill">Interactive Graph Active</span>
        </div>

        <div class="cards-grid">
          ${nodes.map(n => `
            <div class="card-item">
              <span class="online-pill" style="background:var(--accent-bg);color:var(--accent)">${escHtml(n.category)} · ${escHtml(n.id)}</span>
              <h3 style="font-size:15px;font-weight:700;margin:6px 0">${escHtml(n.title)}</h3>
              <p style="font-size:12px;color:var(--text-muted);line-height:1.4">${escHtml(n.description)}</p>
              <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border-color);font-size:11px;color:var(--text-light)">
                เชื่อมโยงสู่: ${n.connectedTo.map(id => `<span style="background:var(--bg-secondary);padding:2px 6px;border-radius:4px;margin-left:4px;font-family:var(--font-mono);color:var(--accent)">${escHtml(id)}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ─── Helper Modals ────────────────────────────────────────
  function openModal(id) {
    document.getElementById(id)?.classList.add('open');
  }
  function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
  }

  function setupEventListeners() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        if (view) switchView(view);
      });
    });

    document.querySelectorAll('[data-subview]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const subview = e.currentTarget.dataset.subview;
        if (subview) switchSubview(subview);
      });
    });

    document.getElementById('brand-logo')?.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('home');
    });

    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

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
    });

    document.getElementById('sync-disconnect-btn')?.addEventListener('click', () => {
      CloudSync.setSyncKey('');
      closeModal('sync-modal');
      renderCurrentView();
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
