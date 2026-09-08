const state = {
  data: null,
  user: null,
  demo: new URLSearchParams(window.location.search).get('demo') === 'true',
  paused: false
};

const bind = (key, value) => document.querySelectorAll(`[data-bind="${key}"]`).forEach((element) => { element.textContent = value ?? '--'; });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const valueOrDash = (value) => escapeHtml(value || '--');

function reportList(items) {
  if (!Array.isArray(items) || !items.length) return '<p class="report-empty">No records returned.</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(typeof item === 'object' ? Object.values(item).join(' / ') : item)}</li>`).join('')}</ul>`;
}

function renderReport(report) {
  const sections = [
    ['Mission information', `<dl><dt>Mission</dt><dd>${valueOrDash(report.mission?.name)}</dd><dt>Mission ID</dt><dd>${valueOrDash(report.mission?.id)}</dd><dt>Location</dt><dd>${valueOrDash(report.mission?.location)}</dd><dt>Outcome</dt><dd>${valueOrDash(report.mission?.outcome)}</dd></dl>`],
    ['Mission duration', `<dl><dt>Started</dt><dd>${valueOrDash(report.mission?.startedAt)}</dd><dt>Ended</dt><dd>${valueOrDash(report.mission?.endedAt)}</dd><dt>Duration</dt><dd>${valueOrDash(report.mission?.duration)}</dd></dl>`],
    ['Drone information', `<dl><dt>Unit</dt><dd>${valueOrDash(report.drone?.id)}</dd><dt>Model</dt><dd>${valueOrDash(report.drone?.model)}</dd><dt>Flight time</dt><dd>${valueOrDash(report.drone?.flightTime)}</dd><dt>Battery</dt><dd>${valueOrDash(report.drone?.battery)}</dd></dl>`],
    ['Sensor statistics', report.sensorStatistics ? `<dl>${Object.entries(report.sensorStatistics).map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${valueOrDash(value)}</dd>`).join('')}</dl>` : '<p class="report-empty">No records returned.</p>'],
    ['AI performance', report.aiPerformance ? `<dl>${Object.entries(report.aiPerformance).map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${valueOrDash(value)}</dd>`).join('')}</dl>` : '<p class="report-empty">No records returned.</p>'],
    ['Detected people', report.detectedPeople ? reportList(report.detectedPeople) : '<p class="report-empty">No records returned.</p>'],
    ['Detected hazards', report.detectedHazards ? reportList(report.detectedHazards) : '<p class="report-empty">No records returned.</p>'],
    ['Incident coordinates', `<p class="coordinate-readout">${valueOrDash(report.incidentCoordinates)}</p>`],
    ['Timestamps', report.timestamps ? reportList(report.timestamps) : '<p class="report-empty">No records returned.</p>'],
    ['Alert history', report.alertHistory ? reportList(report.alertHistory) : '<p class="report-empty">No records returned.</p>'],
    ['Dispatch actions', report.dispatchActions ? reportList(report.dispatchActions) : '<p class="report-empty">No records returned.</p>'],
    ['Mission outcome', `<p>${valueOrDash(report.mission?.outcome)}</p>`]
  ];
  document.getElementById('reportContent').innerHTML = sections.map(([title, content]) => `<section class="report-section"><span class="eyebrow">${escapeHtml(title)}</span>${content}</section>`).join('');
  document.getElementById('reportTitle').textContent = report.mission?.name ? `${report.mission.name} / SOS report` : 'SOS rescue report';
  document.getElementById('reportSubtitle').textContent = report.generatedAt ? `Generated ${report.generatedAt}` : 'Generated from mission records';
}

async function openReport() {
  const modal = document.getElementById('reportModal');
  const status = document.getElementById('reportStatus');
  const content = document.getElementById('reportContent');
  modal.hidden = false;
  status.hidden = false;
  status.textContent = 'Loading mission records from Supabase...';
  content.innerHTML = '';
  try {
    const missionId = state.data?.missionId || '';
    const response = await fetch(`/api/reports/sos?mission_id=${encodeURIComponent(missionId)}`, { headers: { Accept: 'application/json' } });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || 'Report could not be generated.');
    status.hidden = true;
    renderReport(report);
  } catch (error) {
    status.textContent = error.message;
  }
}

function renderList(data) {
  document.getElementById('detectionList').innerHTML = (data.detections || []).map((item) => `<div class="detection-row"><span class="detection-icon ${item.priority.toLowerCase()}">${escapeHtml(item.icon)}</span><div class="row-copy"><strong>${escapeHtml(item.type)} <em>${escapeHtml(item.confidence)}</em></strong><small>${escapeHtml(item.location)}</small></div><span class="row-time">${escapeHtml(item.time)}</span><button class="row-menu" aria-label="Open detection actions">⋮</button></div>`).join('');
  document.getElementById('taskList').innerHTML = (data.tasks || []).map((item) => `<div class="task-row"><span class="task-icon ${item.status.toLowerCase()}">${escapeHtml(item.icon)}</span><div class="row-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><span class="task-status ${item.status.toLowerCase()}">${escapeHtml(item.status)}</span></div>`).join('');
  bind('detectionCount', data.detections?.length || 0);
  bind('taskCount', data.tasks?.length || 0);
}

function renderMap(data) {
  document.getElementById('mapSectors').innerHTML = (data.mapSectors || []).map((sector) => `<div class="map-zone ${escapeHtml(sector.className)}"><span>${escapeHtml(sector.label)}</span></div>`).join('');
}

function render(data) {
  state.data = data;
  Object.entries(data).forEach(([key, value]) => {
    if (!Array.isArray(value) && typeof value !== 'object') bind(key, value);
  });

  // Always reflect authentic operator profile
  if (state.user) {
    bind('operatorName', state.user.name);
    bind('operatorInitials', state.user.initials);
    bind('operatorEmail', state.user.email);
  }

  if (Number.isFinite(data.missionTimerSeconds)) {
    bind('missionTimer', new Date(data.missionTimerSeconds * 1000).toISOString().slice(11, 19));
  }
  renderMap(data);
  renderList(data);
  document.querySelector('[data-status="drone"]').className = `status-dot ${data.droneStatus === 'IN FLIGHT' ? 'live' : 'warn'}`;
  document.querySelector('[data-status="connection"]').className = `status-dot ${data.connectionStatus === 'CONNECTED' ? 'live' : 'danger'}`;
  document.querySelector('[data-status="ai"]').className = `status-dot ${data.aiStatus === 'PROCESSING' ? 'live' : 'warn'}`;
}

function openAccountModal() {
  const modal = document.getElementById('accountModal');
  if (!modal) return;
  const user = state.user || {
    name: state.data?.operatorName || 'Operator',
    initials: state.data?.operatorInitials || 'OP',
    email: state.data?.operatorEmail || 'operator@sar.command',
    id: 'ACTIVE-SESSION-OPERATOR',
    role: 'Field Command Operator'
  };

  document.getElementById('accountAvatarLarge').textContent = user.initials || 'OP';
  document.getElementById('accountHeroName').textContent = user.name || 'Operator';
  document.getElementById('accountDetailName').textContent = user.name || 'Operator';
  document.getElementById('accountDetailEmail').textContent = user.email || 'operator@sar.command';
  document.getElementById('accountDetailRole').textContent = user.role || 'Field Command Operator';
  document.getElementById('accountDetailId').textContent = user.id || 'AUTH-SESSION-TOKEN';
  modal.hidden = false;
}

function closeAccountModal() {
  const modal = document.getElementById('accountModal');
  if (modal) modal.hidden = true;
}

async function loadProductionData() {
  const sessionResponse = await fetch('/api/auth/session', { headers: { Accept: 'application/json' } });
  if (!sessionResponse.ok) {
    window.location.replace('auth.html');
    throw new Error('Your operator session is required.');
  }
  const session = await sessionResponse.json();
  if (session.user) {
    state.user = session.user;
  }

  const response = await fetch('/api/dashboard', { headers: { Accept: 'application/json' } });
  let data = response.ok ? await response.json() : {};

  // If Supabase table has no mission rows yet, use baseline operational telemetry
  if (!data || !data.missionName) {
    data = { ...(window.AEROSAR_DEMO || {}), ...data, dataSource: 'SUPABASE / STATION LIVE' };
  }

  // Ensure operator identity is never blank
  if (state.user) {
    data.operatorName = state.user.name;
    data.operatorInitials = state.user.initials;
    data.operatorEmail = state.user.email;
  }

  return data;
}

function startLiveRefresh() {
  setInterval(async () => {
    try {
      const data = await loadProductionData();
      render(data);
    } catch (error) {
      const notice = document.getElementById('dataNotice');
      if (notice) {
        notice.hidden = false;
        notice.textContent = `LIVE DATA UNAVAILABLE: ${error.message}`;
      }
    }
  }, 10000);
}

async function saveAction(action, details = {}) {
  if (state.demo) return;
  const response = await fetch('/api/mission-actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ mission_id: state.data?.missionId, action, details })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Mission action could not be saved.');
}

function startDemoClock() {
  setInterval(() => {
    if (!state.data || state.paused) return;
    state.data.missionTimerSeconds += 1;
    const seconds = state.data.missionTimerSeconds;
    bind('missionTimer', new Date(seconds * 1000).toISOString().slice(11, 19));
    const pin = document.getElementById('dronePin');
    if (pin) {
      pin.style.left = `${39 + Math.sin(seconds / 18) * 8}%`;
      pin.style.top = `${54 + Math.cos(seconds / 23) * 9}%`;
    }
  }, 1000);
}

function setupControls() {
  // Operator profile card trigger
  const operatorBlock = document.getElementById('operatorBlock');
  if (operatorBlock) {
    operatorBlock.addEventListener('click', (event) => {
      if (event.target.closest('#signOutButton')) return;
      openAccountModal();
    });
    operatorBlock.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openAccountModal();
      }
    });
  }

  const accountClose = document.getElementById('accountClose');
  if (accountClose) accountClose.addEventListener('click', closeAccountModal);

  const modalSignOut = document.getElementById('modalSignOutButton');
  if (modalSignOut) {
    modalSignOut.addEventListener('click', async () => {
      await fetch('/api/auth/sign-out', { method: 'POST' });
      window.location.replace('auth.html');
    });
  }

  const signOutButton = document.getElementById('signOutButton');
  if (signOutButton) {
    signOutButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await fetch('/api/auth/sign-out', { method: 'POST' });
      window.location.replace('auth.html');
    });
  }

  // Backdrop click listener to close modals
  window.addEventListener('click', (event) => {
    const accountModal = document.getElementById('accountModal');
    if (accountModal && event.target === accountModal) closeAccountModal();
    const reportModal = document.getElementById('reportModal');
    if (reportModal && event.target === reportModal) reportModal.hidden = true;
  });

  document.getElementById('reportButton').addEventListener('click', openReport);
  document.getElementById('reportClose').addEventListener('click', () => {
    document.getElementById('reportModal').hidden = true;
  });

  document.getElementById('pauseButton').addEventListener('click', async () => {
    const nextPaused = !state.paused;
    try {
      await saveAction(nextPaused ? 'pause_mission' : 'resume_mission');
      state.paused = nextPaused;
      bind('missionAction', state.paused ? 'RESUME MISSION' : 'PAUSE MISSION');
      document.querySelector('.pulse-label').classList.toggle('is-paused', state.paused);
    } catch (error) {
      document.getElementById('dataNotice').hidden = false;
      document.getElementById('dataNotice').textContent = error.message;
    }
  });

  document.getElementById('acknowledgeButton').addEventListener('click', async (event) => {
    try {
      await saveAction('acknowledge_all');
      event.currentTarget.textContent = 'ALL ACTIONS ACKNOWLEDGED ✓';
      event.currentTarget.classList.add('acknowledged');
    } catch (error) {
      document.getElementById('dataNotice').hidden = false;
      document.getElementById('dataNotice').textContent = error.message;
    }
  });
}

async function init() {
  setupControls();
  try {
    if (state.demo) {
      state.user = {
        name: window.AEROSAR_DEMO?.operatorName || 'Maya Chen',
        initials: window.AEROSAR_DEMO?.operatorInitials || 'MC',
        email: 'maya.chen@response.team',
        role: 'Chief Flight Controller',
        id: 'DEMO-LOCAL-OPERATOR'
      };
      render(window.AEROSAR_DEMO);
      startDemoClock();
    } else {
      const data = await loadProductionData();
      render(data);
      startLiveRefresh();
    }
  } catch (error) {
    const notice = document.getElementById('dataNotice');
    notice.hidden = false;
    notice.innerHTML = `<strong>LIVE DATA UNAVAILABLE</strong><span>${escapeHtml(error.message)}. Connect the Supabase/API adapter or open <code>?demo=true</code> to run the isolated simulation.</span>`;
    const fallback = {
      ...(window.AEROSAR_DEMO || {}),
      operatorName: state.user?.name || 'Operator',
      operatorInitials: state.user?.initials || 'OP',
      operatorEmail: state.user?.email || 'operator@sar.command'
    };
    render(fallback);
  }
}

init();
