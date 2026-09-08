require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const port = Number(process.env.PORT || 8000);
const root = process.cwd();
const demoSessionToken = 'demo-local-session';
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const defaultRescueHistoryFile = path.resolve(root, 'rescue-history.json');
const writableRescueHistoryFile = isServerless ? path.resolve('/tmp', 'rescue-history.json') : defaultRescueHistoryFile;
let inMemoryRescueHistory = null;
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}

function isConfiguredSupabaseValue(value) {
  return typeof value === 'string' && value.trim() !== '' && !value.includes('your-project.supabase.co') && !value.includes('your-anon-key') && !value.includes('your-');
}

function getEnvValue(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function supabaseConfig() {
  const url = getEnvValue('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getEnvValue('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return {
    url: isConfiguredSupabaseValue(url) ? url.replace(/\/$/, '') : '',
    anonKey: isConfiguredSupabaseValue(anonKey) ? anonKey : ''
  };
}

function supabaseHeaders(anonKey, extra = {}) {
  return { apikey: anonKey, Authorization: `Bearer ${anonKey}`, ...extra };
}

function requestAccessToken(request) {
  const cookies = request.headers.cookie || '';
  const token = cookies.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith('aerosar_access_token='));
  return token ? decodeURIComponent(token.slice('aerosar_access_token='.length)) : '';
}

function demoCookieHeader() {
  return { 'Set-Cookie': `aerosar_access_token=${encodeURIComponent(demoSessionToken)}; HttpOnly; SameSite=Lax; Path=/` };
}

async function readJson(request) {
  if (!request) return {};
  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === 'object') return request.body;
    if (typeof request.body === 'string') {
      try {
        return request.body.trim() ? JSON.parse(request.body) : {};
      } catch {
        throw new Error('Invalid JSON request body.');
      }
    }
  }

  if (typeof request[Symbol.asyncIterator] !== 'function') {
    return {};
  }

  let rawBody = '';
  for await (const chunk of request) rawBody += chunk;
  if (!rawBody.trim()) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error('Invalid JSON request body.');
  }
}

async function handleDashboard(request, response) {
  const { anonKey } = supabaseConfig();
  if (!process.env.SUPABASE_DASHBOARD_ENDPOINT || !anonKey) {
    sendJson(response, 503, { error: 'Dashboard is not configured. Set SUPABASE_DASHBOARD_ENDPOINT and Supabase credentials.' });
    return;
  }

  const supabaseResponse = await fetch(process.env.SUPABASE_DASHBOARD_ENDPOINT, {
    headers: supabaseHeaders(anonKey, { Accept: 'application/json', ...(requestAccessToken(request) ? { Authorization: `Bearer ${requestAccessToken(request)}` } : {}) })
  });
  const result = await supabaseResponse.json();
  if (!supabaseResponse.ok) {
    sendJson(response, supabaseResponse.status, { error: 'Supabase could not return dashboard data.' });
    return;
  }
  sendJson(response, 200, Array.isArray(result) ? result[0] || {} : result);
}

async function handleAction(request, response) {
  const { url, anonKey } = supabaseConfig();
  const accessToken = requestAccessToken(request);
  if (!url || !anonKey || !process.env.SUPABASE_ACTIONS_ENDPOINT) {
    sendJson(response, 503, { error: 'Action storage is not configured. Set Supabase credentials and SUPABASE_ACTIONS_ENDPOINT.' });
    return;
  }
  if (!accessToken) {
    sendJson(response, 401, { error: 'Sign in before saving mission actions.' });
    return;
  }

  const action = await readJson(request);
  if (!action.mission_id || !action.action) {
    sendJson(response, 400, { error: 'mission_id and action are required.' });
    return;
  }

  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: supabaseHeaders(anonKey, { Authorization: `Bearer ${accessToken}` }) });
  const user = await userResponse.json();
  if (!userResponse.ok) {
    sendJson(response, 401, { error: 'Your Supabase session has expired. Sign in again.' });
    return;
  }

  const supabaseResponse = await fetch(process.env.SUPABASE_ACTIONS_ENDPOINT, {
    method: 'POST',
    headers: supabaseHeaders(anonKey, { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ mission_id: action.mission_id, action: action.action, details: action.details || {}, operator_id: user.id })
  });
  if (!supabaseResponse.ok) {
    sendJson(response, supabaseResponse.status, { error: 'Supabase could not save the mission action.' });
    return;
  }
  sendJson(response, 201, { saved: true });
}

async function handleSignIn(request, response) {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) {
    try {
      const credentials = await readJson(request);
      if (!credentials.email || !credentials.password || credentials.password.length < 6) {
        sendJson(response, 400, { error: 'Provide an email and a password with at least 6 characters.' });
        return;
      }
      sendJson(response, 200, { authenticated: true, demoMode: true }, demoCookieHeader());
      return;
    } catch {
      sendJson(response, 400, { error: 'Sign-in request could not be processed.' });
      return;
    }
  }

  try {
    const credentials = await readJson(request);
    const email = credentials.email ? String(credentials.email).trim().toLowerCase() : '';
    const password = credentials.password ? String(credentials.password) : '';
    const supabaseResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: supabaseHeaders(anonKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, password })
    });
    const result = await supabaseResponse.json();

    if (!supabaseResponse.ok) {
      sendJson(response, 401, { error: result.error_description || result.msg || 'Invalid operator credentials.' });
      return;
    }

    const secureFlag = isConfiguredSupabaseValue(url) && url.startsWith('https') ? '; Secure' : '';
    const maxAge = credentials.remember ? '; Max-Age=2592000' : '';
    sendJson(response, 200, { authenticated: true }, { 'Set-Cookie': `aerosar_access_token=${result.access_token}; HttpOnly; SameSite=Lax; Path=/${secureFlag}${maxAge}` });
  } catch {
    sendJson(response, 400, { error: 'Sign-in request could not be processed.' });
  }
}

function handleSignOut(request, response) {
  sendJson(response, 200, { authenticated: false }, { 'Set-Cookie': 'aerosar_access_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
}

async function handleRecover(request, response) {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) {
    sendJson(response, 400, { error: 'Recovery requires configured Supabase.' });
    return;
  }
  try {
    const body = await readJson(request);
    const email = body.email ? String(body.email).trim().toLowerCase() : '';
    if (!email) {
      sendJson(response, 400, { error: 'Email is required.' });
      return;
    }
    const supabaseResponse = await fetch(`${url}/auth/v1/recover`, {
      method: 'POST',
      headers: supabaseHeaders(anonKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email })
    });
    const result = await supabaseResponse.json().catch(() => ({}));
    if (!supabaseResponse.ok) {
      sendJson(response, 400, { error: result.msg || result.error_description || 'Recovery request failed.' });
      return;
    }
    sendJson(response, 200, { recoverySent: true });
  } catch {
    sendJson(response, 400, { error: 'Recovery request could not be processed.' });
  }
}

async function handleUpdatePassword(request, response) {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) {
    sendJson(response, 400, { error: 'Requires configured Supabase.' });
    return;
  }
  try {
    const { access_token, password } = await readJson(request);
    if (!access_token || !password || password.length < 6) {
      sendJson(response, 400, { error: 'Invalid request or password too short.' });
      return;
    }
    const supabaseResponse = await fetch(`${url}/auth/v1/user`, {
      method: 'PUT',
      headers: supabaseHeaders(anonKey, { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` }),
      body: JSON.stringify({ password })
    });
    const result = await supabaseResponse.json().catch(() => ({}));
    if (!supabaseResponse.ok) {
      sendJson(response, 400, { error: result.msg || result.error_description || 'Update failed.' });
      return;
    }
    sendJson(response, 200, { updated: true });
  } catch {
    sendJson(response, 400, { error: 'Update request could not be processed.' });
  }
}

async function handleSignUp(request, response) {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) {
    try {
      const credentials = await readJson(request);
      const email = credentials.email ? String(credentials.email).trim().toLowerCase() : '';
      const password = credentials.password ? String(credentials.password) : '';
      if (!email || !password || password.length < 6) {
        sendJson(response, 400, { error: 'Provide an email and a password with at least 6 characters.' });
        return;
      }
      sendJson(response, 201, { created: true, authenticated: true, confirmationRequired: false, demoMode: true }, demoCookieHeader());
      return;
    } catch {
      sendJson(response, 400, { error: 'Sign-up request could not be processed.' });
      return;
    }
  }

  try {
    const credentials = await readJson(request);
    const email = credentials.email ? String(credentials.email).trim().toLowerCase() : '';
    const password = credentials.password ? String(credentials.password) : '';
    if (!email || !password || password.length < 6) {
      sendJson(response, 400, { error: 'Provide an email and a password with at least 6 characters.' });
      return;
    }

    const supabaseResponse = await fetch(`${url}/auth/v1/signup`, {
      method: 'POST',
      headers: supabaseHeaders(anonKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, password })
    });
    const result = await supabaseResponse.json();
    if (!supabaseResponse.ok) {
      sendJson(response, 400, { error: result.msg || result.error_description || 'Account creation failed.' });
      return;
    }

    const headers = result.access_token
      ? { 'Set-Cookie': `aerosar_access_token=${result.access_token}; HttpOnly; SameSite=Lax; Path=/` }
      : {};
    sendJson(response, 201, { created: true, authenticated: Boolean(result.access_token), confirmationRequired: !result.access_token }, headers);
  } catch {
    sendJson(response, 400, { error: 'Sign-up request could not be processed.' });
  }
}

function formatOperatorName(user) {
  if (!user) return 'Operator';
  if (user.user_metadata?.full_name) return user.user_metadata.full_name;
  if (user.user_metadata?.name) return user.user_metadata.name;
  if (user.user_metadata?.operator_name) return user.user_metadata.operator_name;
  if (user.email) {
    const handle = user.email.split('@')[0];
    const formatted = handle
      .replace(/[._-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
    if (formatted) return formatted;
  }
  return 'Operator';
}

function formatInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return 'OP';
}

async function handleSession(request, response) {
  const { url, anonKey } = supabaseConfig();
  const accessToken = requestAccessToken(request);
  if (!url || !anonKey) {
    const isAuthed = accessToken === demoSessionToken;
    sendJson(response, isAuthed ? 200 : 401, {
      authenticated: isAuthed,
      demoMode: true,
      user: isAuthed ? {
        id: 'demo-local-operator',
        email: 'operator@response.team',
        name: 'Field Operator',
        initials: 'FO',
        role: 'SAR Controller'
      } : null
    });
    return;
  }

  const supabaseResponse = await fetch(`${url}/auth/v1/user`, {
    headers: supabaseHeaders(anonKey, { Authorization: `Bearer ${accessToken}` })
  });
  if (!supabaseResponse.ok) {
    sendJson(response, 401, { authenticated: false });
    return;
  }
  const user = await supabaseResponse.json();
  const name = formatOperatorName(user);
  const initials = formatInitials(name);
  sendJson(response, 200, {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name,
      initials,
      avatarUrl: user.user_metadata?.avatar_url || null,
      role: user.role || 'Operator',
      createdAt: user.created_at,
      lastSignIn: user.last_sign_in_at || user.created_at
    }
  });
}

async function handleReport(request, response) {
  const { anonKey } = supabaseConfig();
  const accessToken = requestAccessToken(request);
  if (!process.env.SUPABASE_REPORTS_ENDPOINT || !anonKey) {
    sendJson(response, 503, { error: 'SOS reports are not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_REPORTS_ENDPOINT.' });
    return;
  }

  const missionId = new URL(request.url, `http://${request.headers.host}`).searchParams.get('mission_id');
  if (!missionId) {
    sendJson(response, 400, { error: 'A mission id is required to generate a report.' });
    return;
  }

  const reportUrl = new URL(process.env.SUPABASE_REPORTS_ENDPOINT);
  reportUrl.searchParams.set('mission_id', `eq.${missionId}`);
  const supabaseResponse = await fetch(reportUrl, { headers: supabaseHeaders(anonKey, { Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }) });
  const result = await supabaseResponse.json();
  if (!supabaseResponse.ok) {
    sendJson(response, supabaseResponse.status, { error: 'Supabase could not return the mission report.' });
    return;
  }
  sendJson(response, 200, Array.isArray(result) ? result[0] || {} : result);
}

async function handleDroneCamera(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const cameraFromQuery = requestUrl.searchParams.get('url');
  const cameraUrl = cameraFromQuery || process.env.DRONE_CAMERA_URL || '';
  const fallback = 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=1200&q=80';
  const remoteUrl = cameraUrl || (requestUrl.searchParams.get('demo') === 'true' ? fallback : '');

  if (!remoteUrl) {
    if (!response.headersSent) {
      sendJson(response, 503, { error: 'No drone camera URL is configured. Set DRONE_CAMERA_URL or connect a stream manually.' });
    }
    return;
  }

  try {
    const streamResponse = await fetch(remoteUrl, {
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/*,multipart/x-mixed-replace;boundary=--jpg' }
    });

    if (!streamResponse.ok) {
      if (!response.headersSent) {
        sendJson(response, 502, { error: 'Drone camera stream is unreachable.' });
      }
      return;
    }

    const contentType = streamResponse.headers.get('content-type') || 'image/jpeg';
    if (!response.headersSent) {
      response.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0'
      });
    }

    if (streamResponse.body) {
      const readable = typeof streamResponse.body.pipe === 'function'
        ? streamResponse.body
        : (typeof Readable.fromWeb === 'function' ? Readable.fromWeb(streamResponse.body) : null);

      if (readable && typeof readable.pipe === 'function') {
        readable.on('error', () => {
          if (!response.writableEnded) {
            response.destroy();
          }
        });
        readable.pipe(response);
        return;
      }
    }

    const buffer = Buffer.from(await streamResponse.arrayBuffer());
    response.end(buffer);
  } catch {
    try {
      const fallbackResponse = await fetch(fallback);
      const fallbackBuffer = Buffer.from(await fallbackResponse.arrayBuffer());
      if (!response.headersSent) {
        response.writeHead(200, {
          'Content-Type': fallbackResponse.headers.get('content-type') || 'image/jpeg',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0'
        });
      }
      response.end(fallbackBuffer);
    } catch {
      if (!response.headersSent) {
        sendJson(response, 503, { error: 'Drone camera stream is unavailable.' });
      } else {
        response.end();
      }
    }
  }
}

function readRescueHistory() {
  if (Array.isArray(inMemoryRescueHistory)) {
    return inMemoryRescueHistory;
  }
  try {
    const fileToRead = (isServerless && fs.existsSync(writableRescueHistoryFile))
      ? writableRescueHistoryFile
      : (fs.existsSync(defaultRescueHistoryFile) ? defaultRescueHistoryFile : null);

    if (fileToRead) {
      const raw = fs.readFileSync(fileToRead, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      inMemoryRescueHistory = Array.isArray(parsed) ? parsed : [];
      return inMemoryRescueHistory;
    }

    if (!isServerless) {
      fs.writeFileSync(defaultRescueHistoryFile, JSON.stringify([], null, 2));
    }
    inMemoryRescueHistory = [];
    return [];
  } catch {
    inMemoryRescueHistory = [];
    return [];
  }
}

function writeRescueHistory(records) {
  const nextRecords = Array.isArray(records) ? records : [];
  inMemoryRescueHistory = nextRecords;
  try {
    fs.writeFileSync(writableRescueHistoryFile, JSON.stringify(nextRecords, null, 2));
  } catch (error) {
    console.warn('Could not write rescue history to disk:', error.message);
  }
  return nextRecords;
}

async function handleRescueHistory(request, response) {
  const method = request.method || 'GET';
  if (method === 'GET') {
    sendJson(response, 200, readRescueHistory());
    return;
  }

  if (method === 'POST') {
    try {
      const payload = await readJson(request);
      const entry = {
        id: payload?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        missionId: payload?.missionId || 'unknown',
        missionName: payload?.missionName || 'Unknown mission',
        eventType: payload?.eventType || 'mission_event',
        timestamp: payload?.timestamp || new Date().toISOString(),
        details: payload?.details || {},
        snapshot: payload?.snapshot || null
      };
      const history = readRescueHistory();
      const nextHistory = [...history, entry].slice(-200);
      writeRescueHistory(nextHistory);
      sendJson(response, 200, { saved: true, total: nextHistory.length });
      return;
    } catch {
      sendJson(response, 400, { error: 'Rescue history payload could not be stored.' });
      return;
    }
  }

  sendJson(response, 405, { error: 'Method not allowed.' });
}

const handler = async (request, response) => {
  const safeRequest = request || {};
  const safeResponse = response || {
    setHeader() {},
    writeHead() {},
    end() {},
    write() {}
  };

  try {
    const requestUrl = new URL(safeRequest.url || '/', `http://${safeRequest.headers?.host || 'localhost'}`);
    const routePath = requestUrl.searchParams.get('__route') || requestUrl.pathname;
    let apiPath = routePath.startsWith('/api/') ? routePath.slice(4) : routePath;
    if (apiPath.length > 1 && apiPath.endsWith('/')) {
      apiPath = apiPath.slice(0, -1);
    }

    if (safeRequest.method === 'GET' && (apiPath === '/health' || apiPath === 'health')) {
      sendJson(safeResponse, 200, {
        ok: true,
        supabase: Boolean(supabaseConfig().url && supabaseConfig().anonKey),
        dashboard: Boolean(process.env.SUPABASE_DASHBOARD_ENDPOINT),
        reports: Boolean(process.env.SUPABASE_REPORTS_ENDPOINT),
        actions: Boolean(process.env.SUPABASE_ACTIONS_ENDPOINT)
      });
      return;
    }

    if (safeRequest.method === 'GET' && (apiPath === '/dashboard' || apiPath === 'dashboard')) {
      await handleDashboard(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Dashboard service error.' }));
      return;
    }
    if (safeRequest.method === 'POST' && (apiPath === '/mission-actions' || apiPath === 'mission-actions')) {
      await handleAction(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Mission action service error.' }));
      return;
    }
    if (safeRequest.method === 'POST' && (apiPath === '/auth/sign-in' || apiPath === 'auth/sign-in')) {
      await handleSignIn(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Authentication service error.' }));
      return;
    }
    if (safeRequest.method === 'POST' && (apiPath === '/auth/sign-up' || apiPath === 'auth/sign-up')) {
      await handleSignUp(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Registration service error.' }));
      return;
    }
    if (safeRequest.method === 'POST' && (apiPath === '/auth/sign-out' || apiPath === 'auth/sign-out')) {
      handleSignOut(safeRequest, safeResponse);
      return;
    }
    if (safeRequest.method === 'POST' && (apiPath === '/auth/recover' || apiPath === 'auth/recover')) {
      await handleRecover(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Recovery service error.' }));
      return;
    }
    if (safeRequest.method === 'POST' && (apiPath === '/auth/update-password' || apiPath === 'auth/update-password')) {
      await handleUpdatePassword(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Update service error.' }));
      return;
    }
    if (safeRequest.method === 'GET' && (apiPath === '/auth/session' || apiPath === 'auth/session')) {
      await handleSession(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 401, { authenticated: false }));
      return;
    }
    if (safeRequest.method === 'GET' && (apiPath === '/reports/sos' || apiPath === 'reports/sos')) {
      await handleReport(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Report service error.' }));
      return;
    }
    if (safeRequest.method === 'GET' && (apiPath === '/drone/camera' || apiPath === 'drone/camera')) {
      await handleDroneCamera(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Drone camera service error.' }));
      return;
    }
    if ((safeRequest.method === 'GET' || safeRequest.method === 'POST') && (apiPath === '/rescue/history' || apiPath === 'rescue/history')) {
      await handleRescueHistory(safeRequest, safeResponse);
      return;
    }

    if (apiPath.startsWith('/') && (routePath.startsWith('/api/') || routePath === '/api')) {
      sendJson(safeResponse, 404, { error: `API route not found: ${routePath}` });
      return;
    }

    if (safeRequest.method !== 'GET' && safeRequest.method !== 'HEAD') {
      safeResponse.writeHead(405);
      safeResponse.end('Method not allowed');
      return;
    }

    const requestPath = decodeURIComponent(requestUrl.pathname);
    const isDemo = requestUrl.searchParams.get('demo') === 'true';
    if ((requestPath === '/' || requestPath === '/index.html') && !requestAccessToken(safeRequest) && !isDemo) {
      safeResponse.writeHead(302, { Location: '/auth.html' });
      safeResponse.end();
      return;
    }
    const relativePath = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = path.resolve(root, `.${relativePath}`);

    if (!filePath.startsWith(root)) {
      safeResponse.writeHead(403);
      safeResponse.end('Forbidden');
      return;
    }

    try {
      const content = await fs.promises.readFile(filePath);
      safeResponse.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
      safeResponse.end(content);
    } catch (error) {
      safeResponse.writeHead(error.code === 'ENOENT' ? 404 : 500);
      safeResponse.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
  } catch (error) {
    console.error('Unhandled server error:', error);
    if (!safeResponse.headersSent) {
      sendJson(safeResponse, 500, { error: 'Internal server error.' });
    } else if (!safeResponse.writableEnded) {
      safeResponse.end();
    }
  }
};

module.exports = handler;

function startServer(portToTry) {
  const server = http.createServer(handler);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = portToTry + 1;
      console.warn(`Port ${portToTry} is already in use. Retrying on http://localhost:${nextPort}`);
      startServer(nextPort);
      return;
    }

    console.error('Server failed to start:', error);
    process.exitCode = 1;
  });

  server.listen(portToTry, () => {
    console.log(`AEROSAR dev server running at http://localhost:${portToTry}`);
  });
}

if (require.main === module) {
  startServer(port);
}
