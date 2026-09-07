const state = { data: null, demo: new URLSearchParams(window.location.search).get('demo') === 'true', paused: false, cameraUrl: '', rescueHistory: [] };

const bind = (key, value) => document.querySelectorAll(`[data-bind="${key}"]`).forEach((element) => { element.textContent = value ?? '--'; });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const valueOrDash = (value) => escapeHtml(value || '--');

function loadRescueHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem('aerosar_rescue_history') || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function persistRescueHistoryAsync(record) {
  const entry = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    missionId: record.missionId || state.data?.missionId || 'unknown',
    missionName: record.missionName || state.data?.missionName || 'Unknown mission',
    eventType: record.eventType || 'mission_event',
    timestamp: record.timestamp || new Date().toISOString(),
    details: record.details || {},
    snapshot: record.snapshot || state.data || null
  };

  const history = loadRescueHistory();
  history.push(entry);
  const trimmed = history.slice(-200);
  localStorage.setItem('aerosar_rescue_history', JSON.stringify(trimmed));
  state.rescueHistory = trimmed;

  fetch('/api/rescue/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(entry)
  }).catch(() => {});

  return entry;
}

function resolveCameraUrl() {
  const candidate = localStorage.getItem('aerosar_drone_camera_url') || window.DRONE_CAMERA_URL || '';
  if (candidate) return candidate.trim();
  return '';
}

function buildCameraUrl(url) {
  const source = url || state.cameraUrl || '/api/drone/camera?demo=true';
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return `/api/drone/camera?url=${encodeURIComponent(source)}`;
  }
  return source;
}

function updateCameraStatus(isLive, label, sourceLabel = 'No source connected') {
  const statusDot = document.getElementById('cameraStatusDot');
  const statusLabel = document.getElementById('cameraStatusLabel');
  const sourceText = document.getElementById('cameraStreamSource');
  if (statusDot) {
    statusDot.classList.toggle('live', isLive);
    statusDot.classList.toggle('warn', !isLive);
  }
  if (statusLabel) statusLabel.textContent = label;
  if (sourceText) sourceText.textContent = sourceLabel;
}

function refreshDroneCamera() {
  const element = document.getElementById('droneCameraImage');
  const input = document.getElementById('droneCameraUrl');
  if (!element) return;

  state.cameraUrl = resolveCameraUrl();
  const url = buildCameraUrl(state.cameraUrl);
  if (input && !input.value) input.value = state.cameraUrl;
  element.src = `${url}${url.includes('?') ? '&' : '?'}ts=${Date.now()}`;
  updateCameraStatus(Boolean(state.cameraUrl), state.cameraUrl ? 'LIVE' : 'DEMO', state.cameraUrl || 'Demo feed active');
}

function attachCameraControls() {
  const connectButton = document.getElementById('cameraConnectButton');
  const cameraInput = document.getElementById('droneCameraUrl');
  const image = document.getElementById('droneCameraImage');

  if (cameraInput) {
    cameraInput.value = resolveCameraUrl();
  }

  if (connectButton) {
    connectButton.addEventListener('click', () => {
      const nextUrl = (cameraInput?.value || '').trim();
      if (!nextUrl) {
        localStorage.removeItem('aerosar_drone_camera_url');
        state.cameraUrl = '';
        refreshDroneCamera();
        return;
      }
      state.cameraUrl = nextUrl;
      localStorage.setItem('aerosar_drone_camera_url', nextUrl);
      refreshDroneCamera();
    });
  }

  if (image) {
    image.addEventListener('load', () => updateCameraStatus(true, 'LIVE', state.cameraUrl || 'Demo feed active'));
    image.addEventListener('error', () => updateCameraStatus(false, 'OFFLINE', 'Camera stream unavailable'));
  }
}

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
  modal.hidden = false; status.hidden = false; status.textContent = 'Loading mission records from Supabase...'; content.innerHTML = '';
  try {
    const missionId = state.data?.missionId || '';
    const response = await fetch(`/api/reports/sos?mission_id=${encodeURIComponent(missionId)}`, { headers: { Accept: 'application/json' } });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || 'Report could not be generated.');
    status.hidden = true; renderReport(report);
    persistRescueHistoryAsync({
      eventType: 'mission_report',
      missionId: state.data?.missionId || missionId || 'unknown',
      missionName: state.data?.missionName || 'Unknown mission',
      details: { reportTitle: report.mission?.name || 'SOS rescue report' },
      snapshot: report
    });
  } catch (error) {
    status.textContent = error.message;
  }
}

function renderList(data) {
  document.getElementById('detectionList').innerHTML = (data.detections || []).map((item) => `<div class="detection-row"><span class="detection-icon ${item.priority.toLowerCase()}">${escapeHtml(item.icon)}</span><div class="row-copy"><strong>${escapeHtml(item.type)} <em>${escapeHtml(item.confidence)}</em></strong><small>${escapeHtml(item.location)}</small></div><span class="row-time">${escapeHtml(item.time)}</span><button class="row-menu" aria-label="Open detection actions">⋮</button></div>`).join('');
  document.getElementById('taskList').innerHTML = (data.tasks || []).map((item) => `<div class="task-row"><span class="task-icon ${item.status.toLowerCase()}">${escapeHtml(item.icon)}</span><div class="row-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><span class="task-status ${item.status.toLowerCase()}">${escapeHtml(item.status)}</span></div>`).join('');
  bind('detectionCount', data.detections?.length || 0); bind('taskCount', data.tasks?.length || 0);
}

function renderMap(data) {
  document.getElementById('mapSectors').innerHTML = (data.mapSectors || []).map((sector) => `<div class="map-zone ${escapeHtml(sector.className)}"><span>${escapeHtml(sector.label)}</span></div>`).join('');
}

function render(data) {
  state.data = data;
  Object.entries(data).forEach(([key, value]) => { if (!Array.isArray(value) && typeof value !== 'object') bind(key, value); });
  if (Number.isFinite(data.missionTimerSeconds)) bind('missionTimer', new Date(data.missionTimerSeconds * 1000).toISOString().slice(11, 19));
  renderMap(data);
  renderList(data);
  const mapTitle = document.querySelector('.map-panel h2');
  if (mapTitle) mapTitle.textContent = (data.mapMode && data.mapMode.toUpperCase() !== 'LIVE FEED') ? `${data.mapMode} search area` : 'Live search area';
  document.querySelector('[data-status="drone"]').className = `status-dot ${data.droneStatus === 'IN FLIGHT' ? 'live' : 'warn'}`;
  document.querySelector('[data-status="connection"]').className = `status-dot ${data.connectionStatus === 'CONNECTED' ? 'live' : 'danger'}`;
  document.querySelector('[data-status="ai"]').className = `status-dot ${data.aiStatus === 'PROCESSING' ? 'live' : 'warn'}`;
  persistRescueHistoryAsync({
    eventType: 'mission_snapshot',
    missionId: data.missionId || state.data?.missionId || 'unknown',
    missionName: data.missionName || 'Unknown mission',
    details: { missionPhase: data.missionPhase || 'snapshot', dataSource: data.dataSource || 'browser' },
    snapshot: data
  });
}

async function loadProductionData() {
  const sessionResponse = await fetch('/api/auth/session', { headers: { Accept: 'application/json' } });
  if (!sessionResponse.ok) {
    window.location.replace('auth.html');
    throw new Error('Your operator session is required.');
  }
  const response = await fetch('/api/dashboard', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Dashboard API returned ${response.status}`);
  return response.json();
}

function startLiveRefresh() {
  setInterval(async () => {
    try {
      const data = await loadProductionData();
      render(data);
    } catch (error) {
      const notice = document.getElementById('dataNotice');
      notice.hidden = false;
      notice.textContent = `LIVE DATA UNAVAILABLE: ${error.message}`;
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
  persistRescueHistoryAsync({
    eventType: 'mission_action',
    missionId: state.data?.missionId || 'unknown',
    missionName: state.data?.missionName || 'Unknown mission',
    details: { action, details }
  });
}

function startDemoClock() {
  setInterval(() => {
    if (!state.data || state.paused) return;
    state.data.missionTimerSeconds += 1;
    const seconds = state.data.missionTimerSeconds;
    bind('missionTimer', new Date(seconds * 1000).toISOString().slice(11, 19));
    const pin = document.getElementById('dronePin');
    pin.style.left = `${39 + Math.sin(seconds / 18) * 8}%`; pin.style.top = `${54 + Math.cos(seconds / 23) * 9}%`;
  }, 1000);
}

function openDetections() {
  const modal = document.getElementById('detectionModal');
  const content = document.getElementById('detectionContent');
  if (!modal || !content) return;

  const items = state.data?.detections || [];
  if (!items.length) {
    content.innerHTML = '<section class="report-section"><span class="eyebrow">STATUS</span><p class="report-empty">No detections are available from the current mission feed.</p></section>';
    modal.hidden = false;
    return;
  }

  content.innerHTML = items.map((item) => `
    <section class="report-section">
      <span class="eyebrow">${escapeHtml(item.type || 'DETECTION')}</span>
      <dl>
        <dt>Confidence</dt><dd>${valueOrDash(item.confidence)}</dd>
        <dt>Priority</dt><dd>${valueOrDash(item.priority)}</dd>
        <dt>Location</dt><dd>${valueOrDash(item.location)}</dd>
        <dt>Time</dt><dd>${valueOrDash(item.time)}</dd>
      </dl>
    </section>
  `).join('');
  modal.hidden = false;
}

function toggleMapExpand() {
  const mapPanel = document.querySelector('.map-panel');
  if (!mapPanel) return;
  mapPanel.classList.toggle('map-panel--expanded');
  const button = document.getElementById('expandMapButton');
  if (button) {
    button.innerHTML = mapPanel.classList.contains('map-panel--expanded') ? 'COLLAPSE MAP <span>↘</span>' : 'EXPAND MAP <span>↗</span>';
  }
}

function setupControls() {
  document.getElementById('reportButton').addEventListener('click', openReport);
  document.getElementById('reportClose').addEventListener('click', () => { document.getElementById('reportModal').hidden = true; });
  document.getElementById('detectionClose').addEventListener('click', () => { document.getElementById('detectionModal').hidden = true; });
  document.getElementById('viewDetectionsButton').addEventListener('click', openDetections);
  document.getElementById('expandMapButton').addEventListener('click', toggleMapExpand);
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
  attachCameraControls();
  refreshDroneCamera();
  try {
    const data = state.demo ? window.AEROSAR_DEMO : await loadProductionData();
    render(data);
    if (state.demo) startDemoClock();
    else startLiveRefresh();
  } catch (error) {
    const notice = document.getElementById('dataNotice');
    notice.hidden = false;
    notice.innerHTML = `<strong>LIVE DATA UNAVAILABLE</strong><span>${escapeHtml(error.message)}. Connect the Supabase/API adapter or open <code>?demo=true</code> to run the isolated simulation.</span>`;
    render({ platformName: 'AEROSAR', missionName: 'NO ACTIVE MISSION', missionLocation: 'Awaiting live telemetry', missionPhase: 'OFFLINE', missionTimer: '--:--:--', droneStatus: 'OFFLINE', connectionStatus: 'DISCONNECTED', aiStatus: 'STANDBY', operatorName: 'UNASSIGNED', operatorInitials: '--', mapMode: 'NO SIGNAL', detectionCount: 0, taskCount: 0, dataSource: 'NO CONNECTION', lastSyncFooter: '--', detections: [], tasks: [] });
  }
}
init();















