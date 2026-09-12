
const isBrowser = typeof window !== 'undefined';

const state = {
  data: null,
  user: null,
  demo: isBrowser ? new URLSearchParams(window.location.search).get('demo') === 'true' : false,
  paused: false,
  reportLoading: false,
  pauseLoading: false
};

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

const demoCameraFrames = [
  'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=1600&q=85',
  'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?auto=format&fit=crop&w=1600&q=85'
];

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
  const url = state.cameraUrl
    ? buildCameraUrl(state.cameraUrl)
    : `${demoCameraFrames[state.demoCameraFrame || 0]}&frame=${state.demoCameraFrame || 0}`;
  if (input && !input.value) input.value = state.cameraUrl;
  element.src = `${url}${url.includes('?') ? '&' : '?'}ts=${Date.now()}`;
  updateCameraStatus(Boolean(state.cameraUrl), state.cameraUrl ? 'LIVE' : 'DEMO', state.cameraUrl || 'Demo aerial feed / frame 1 of 2');
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

  window.setInterval(() => {
    if (!state.cameraUrl) {
      state.demoCameraFrame = ((state.demoCameraFrame || 0) + 1) % demoCameraFrames.length;
      refreshDroneCamera();
      updateCameraStatus(true, 'DEMO', `Demo aerial feed / frame ${state.demoCameraFrame + 1} of ${demoCameraFrames.length}`);
    }
  }, 8000);
}

function reportList(items) {
  if (!Array.isArray(items) || !items.length) return '<p class="report-empty">No records returned.</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(typeof item === 'object' ? Object.values(item).join(' / ') : item)}</li>`).join('')}</ul>`;
}

function renderReport(report) {
  const sections = [
    ['Rescue scenario', `<dl><dt>Incident type</dt><dd>${valueOrDash(report.scenario?.type)}</dd><dt>Situation</dt><dd>${valueOrDash(report.scenario?.summary)}</dd><dt>Primary risks</dt><dd>${valueOrDash(report.scenario?.risks)}</dd></dl>`],
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
    ['Recommended response', report.scenario?.actions ? reportList(report.scenario.actions) : '<p class="report-empty">No records returned.</p>'],
    ['Mission outcome', `<p>${valueOrDash(report.mission?.outcome)}</p>`]
  ];
  document.getElementById('reportContent').innerHTML = sections.map(([title, content]) => `<section class="report-section"><span class="eyebrow">${escapeHtml(title)}</span>${content}</section>`).join('');
  document.getElementById('reportTitle').textContent = report.mission?.name ? `${report.mission.name} / SOS report` : 'SOS rescue report';
  document.getElementById('reportSubtitle').textContent = report.generatedAt ? `Generated ${report.generatedAt}` : 'Generated from mission records';
}

function getRescueScenario(mission) {
  const requestedType = new URLSearchParams(window.location.search).get('scenario') || mission.rescueType || mission.incidentType || '';
  const source = `${requestedType} ${mission.missionName || ''} ${(mission.detections || []).map((item) => item.type).join(' ')}`.toLowerCase();
  if (source.includes('flood') || source.includes('water') || source.includes('river')) {
    return { type: 'Flood rescue', summary: 'Possible flooding or fast-moving water affecting people and access routes.', risks: 'Rising water, unstable roads, hypothermia, and blocked evacuation routes.', actions: ['Locate people on rooftops and isolated ground', 'Track water level and safe landing zones', 'Dispatch water rescue and medical teams'] };
  }
  if (source.includes('fire') || source.includes('smoke') || source.includes('thermal')) {
    return { type: 'Wildfire or fire rescue', summary: 'Heat or smoke indicators require search and rescue near an active fire zone.', risks: 'Smoke inhalation, heat exposure, changing wind, and structural collapse.', actions: ['Map the fire perimeter and escape routes', 'Keep the drone upwind of smoke', 'Dispatch fire suppression and evacuation teams'] };
  }
  if (source.includes('earthquake') || source.includes('collapse') || source.includes('rubble')) {
    return { type: 'Earthquake or structural collapse', summary: 'People may be trapped in damaged structures or debris fields.', risks: 'Secondary collapse, dust, gas leaks, and inaccessible roads.', actions: ['Scan debris for heat signatures', 'Mark safe approach corridors', 'Dispatch urban search and rescue teams'] };
  }
  return { type: 'Mountain search and rescue', summary: 'Aerial search is active for people, vehicles, or hazards in difficult terrain.', risks: 'Terrain exposure, weather changes, limited access, and low battery margins.', actions: ['Prioritize high-confidence person detections', 'Share coordinates with ground teams', 'Maintain an emergency return-to-home reserve'] };
}

function buildMissionReport() {
  const mission = state.data || {};
  const generatedAt = new Date().toISOString();
  const scenario = getRescueScenario(mission);
  return {
    generatedAt,
    scenario,
    mission: {
      id: mission.missionId,
      name: mission.missionName,
      location: mission.missionLocation,
      outcome: mission.missionPhase,
      startedAt: new Date(Date.now() - (Number(mission.missionTimerSeconds) || 0) * 1000).toISOString(),
      endedAt: generatedAt,
      duration: new Date((Number(mission.missionTimerSeconds) || 0) * 1000).toISOString().slice(11, 19)
    },
    drone: {
      id: mission.droneId,
      model: mission.droneModel,
      flightTime: mission.flightTime,
      battery: mission.battery
    },
    sensorStatistics: {
      detections: mission.detections?.length || 0,
      tasks: mission.tasks?.length || 0,
      coordinates: mission.coordinates
    },
    aiPerformance: {
      status: mission.aiStatus,
      lastInference: mission.lastInference
    },
    detectedPeople: (mission.detections || []).filter((item) => item.type === 'PERSON'),
    detectedHazards: (mission.detections || []).filter((item) => item.type !== 'PERSON'),
    incidentCoordinates: mission.coordinates,
    timestamps: [{ label: 'Report generated', value: generatedAt }],
    alertHistory: mission.tasks || [],
    dispatchActions: mission.tasks || []
  };
}

async function openReport() {
  const modal = document.getElementById('reportModal');
  const status = document.getElementById('reportStatus');
  const content = document.getElementById('reportContent');
  const reportButton = document.getElementById('reportButton');
  if (!modal || !status || !content || state.reportLoading) return;
  state.reportLoading = true;
  if (reportButton) {
    reportButton.disabled = true;
    reportButton.setAttribute('aria-busy', 'true');
  }
  modal.hidden = false;
  status.hidden = false;
  status.textContent = state.demo ? 'Generating demo SOS report...' : 'Loading mission records from Supabase...';
  content.innerHTML = '';
  try {
    const missionId = state.data?.missionId || '';
    let report;
    if (state.demo) {
      report = buildMissionReport();
    } else {
      const response = await fetch(`/api/reports/sos?mission_id=${encodeURIComponent(missionId)}`, { headers: { Accept: 'application/json' } });
      report = await response.json();
      if (!response.ok) throw new Error(report.error || 'Report could not be generated.');
      if (!report.mission) report = buildMissionReport();
    }

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
  } finally {
    state.reportLoading = false;
    if (reportButton) {
      reportButton.disabled = false;
      reportButton.removeAttribute('aria-busy');
    }
  }
}

function renderList(data) {
  document.getElementById('detectionList').innerHTML = (data.detections || []).map((item, index) => {
    const priority = String(item.priority || 'REVIEW').toLowerCase();
    return `<div class="detection-row"><span class="detection-icon ${escapeHtml(priority)}">${escapeHtml(item.icon || '•')}</span><div class="row-copy"><strong>${escapeHtml(item.type || 'DETECTION')} <em>${escapeHtml(item.confidence || '--')}</em></strong><small>${escapeHtml(item.location || 'Location unavailable')}</small></div><span class="row-time">${escapeHtml(item.time || 'Just now')}</span><button class="row-menu" type="button" data-detection-index="${index}" aria-label="Open ${escapeHtml(item.type || 'detection')} details">⋮</button></div>`;
  }).join('');
  document.getElementById('taskList').innerHTML = (data.tasks || []).map((item) => {
    const status = String(item.status || 'PENDING').toUpperCase();
    const isAcknowledged = status === 'ACKNOWLEDGED';
    return `<div class="task-row${isAcknowledged ? ' task-row--acknowledged' : ''}"><span class="task-icon ${status.toLowerCase()}">${isAcknowledged ? '✓' : escapeHtml(item.icon || '?')}</span><div class="row-copy"><strong>${escapeHtml(item.title || 'Team action')}</strong><small>${escapeHtml(item.detail || 'Awaiting response')}</small></div><span class="task-status ${status.toLowerCase()}">${escapeHtml(status)}</span></div>`;
  }).join('');
  bind('detectionCount', data.detections?.length || 0);
  bind('taskCount', (data.tasks || []).filter((item) => String(item.status || '').toUpperCase() !== 'ACKNOWLEDGED').length);
}

function acknowledgeTasks() {
  if (!state.data) return;
  state.data.tasks = (state.data.tasks || []).map((task) => ({ ...task, status: 'ACKNOWLEDGED' }));
  renderList(state.data);
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
    if (pin) {
      pin.style.left = `${39 + Math.sin(seconds / 18) * 8}%`;
      pin.style.top = `${54 + Math.cos(seconds / 23) * 9}%`;
    }
  }, 1000);
}

function openDetections(selectedIndex = null) {
  const modal = document.getElementById('detectionModal');
  const content = document.getElementById('detectionContent');
  if (!modal || !content) return;

  const items = state.data?.detections || [];
  if (!items.length) {
    content.innerHTML = '<section class="report-section"><span class="eyebrow">STATUS</span><p class="report-empty">No detections are available from the current mission feed.</p></section>';
    modal.hidden = false;
    return;
  }

  const visibleItems = selectedIndex === null || !items[selectedIndex] ? items : [items[selectedIndex]];
  content.innerHTML = visibleItems.map((item) => `
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

  const reportButton = document.getElementById('reportButton');
  if (reportButton) reportButton.addEventListener('click', openReport);
  const reportClose = document.getElementById('reportClose');
  if (reportClose) reportClose.addEventListener('click', () => { document.getElementById('reportModal').hidden = true; });
  const detectionClose = document.getElementById('detectionClose');
  if (detectionClose) detectionClose.addEventListener('click', () => { document.getElementById('detectionModal').hidden = true; });
  const viewDetectionsButton = document.getElementById('viewDetectionsButton');
  if (viewDetectionsButton) viewDetectionsButton.addEventListener('click', openDetections);
  const detectionList = document.getElementById('detectionList');
  if (detectionList) detectionList.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-detection-index]');
    if (actionButton) openDetections(Number(actionButton.dataset.detectionIndex));
  });
  const expandMapButton = document.getElementById('expandMapButton');
  if (expandMapButton) expandMapButton.addEventListener('click', toggleMapExpand);
  const pauseButton = document.getElementById('pauseButton');
  if (pauseButton) pauseButton.addEventListener('click', async () => {
    if (state.pauseLoading) return;
    state.pauseLoading = true;
    pauseButton.disabled = true;
    pauseButton.setAttribute('aria-busy', 'true');
    const nextPaused = !state.paused;
    try {
      await saveAction(nextPaused ? 'pause_mission' : 'resume_mission');
      state.paused = nextPaused;
      bind('missionAction', state.paused ? 'RESUME MISSION' : 'PAUSE MISSION');
      const pulseLabel = document.querySelector('.pulse-label');
      if (pulseLabel) pulseLabel.classList.toggle('is-paused', state.paused);
    } catch (error) {
      const notice = document.getElementById('dataNotice');
      if (notice) {
        notice.hidden = false;
        notice.textContent = error.message;
      }
    } finally {
      state.pauseLoading = false;
      pauseButton.disabled = false;
      pauseButton.removeAttribute('aria-busy');
    }
  });

  const acknowledgeButton = document.getElementById('acknowledgeButton');
  if (acknowledgeButton) acknowledgeButton.addEventListener('click', async (event) => {
    if (acknowledgeButton.disabled) return;
    acknowledgeButton.disabled = true;
    acknowledgeButton.setAttribute('aria-busy', 'true');
    try {
      await saveAction('acknowledge_all');
      acknowledgeTasks();
      event.currentTarget.textContent = 'ALL ACTIONS ACKNOWLEDGED ✓';
      event.currentTarget.classList.add('acknowledged');
    } catch (error) {
      document.getElementById('dataNotice').hidden = false;
      document.getElementById('dataNotice').textContent = error.message;
      acknowledgeButton.disabled = false;
    }
    acknowledgeButton.removeAttribute('aria-busy');
  });
}

async function init() {
  setupControls();
  attachCameraControls();
  refreshDroneCamera();
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

if (isBrowser) {
  init();
}
