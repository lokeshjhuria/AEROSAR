require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 8000);
const root = process.cwd();
const demoSessionToken = 'demo-local-session';
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
  let rawBody = '';
  if (!request || typeof request[Symbol.asyncIterator] !== 'function') {
    return {};
  }

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
    const supabaseResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: supabaseHeaders(anonKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email: credentials.email, password: credentials.password })
    });
    const result = await supabaseResponse.json();

    if (!supabaseResponse.ok) {
      sendJson(response, 401, { error: result.error_description || result.msg || 'Invalid operator credentials.' });
      return;
    }

    sendJson(response, 200, { authenticated: true }, { 'Set-Cookie': `aerosar_access_token=${result.access_token}; HttpOnly; SameSite=Lax; Path=/` });
  } catch {
    sendJson(response, 400, { error: 'Sign-in request could not be processed.' });
  }
}

async function handleSignUp(request, response) {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) {
    try {
      const credentials = await readJson(request);
      if (!credentials.email || !credentials.password || credentials.password.length < 6) {
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
    if (!credentials.email || !credentials.password || credentials.password.length < 6) {
      sendJson(response, 400, { error: 'Provide an email and a password with at least 6 characters.' });
      return;
    }

    const supabaseResponse = await fetch(`${url}/auth/v1/signup`, {
      method: 'POST',
      headers: supabaseHeaders(anonKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email: credentials.email, password: credentials.password })
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

async function handleSession(request, response) {
  const { url, anonKey } = supabaseConfig();
  const accessToken = requestAccessToken(request);
  if (!url || !anonKey) {
    sendJson(response, accessToken === demoSessionToken ? 200 : 401, { authenticated: accessToken === demoSessionToken, demoMode: true });
    return;
  }

  const supabaseResponse = await fetch(`${url}/auth/v1/user`, {
    headers: supabaseHeaders(anonKey, { Authorization: `Bearer ${accessToken}` })
  });
  if (!supabaseResponse.ok) {
    sendJson(response, 401, { authenticated: false });
    return;
  }
  sendJson(response, 200, { authenticated: true });
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

const handler = (request, response) => {
  const safeRequest = request || {};
  const safeResponse = response || {
    setHeader() {},
    writeHead() {},
    end() {},
    write() {}
  };
  const requestUrl = new URL(safeRequest.url || '/', `http://${safeRequest.headers?.host || 'localhost'}`);
  const routePath = requestUrl.searchParams.get('__route') || requestUrl.pathname;
  const apiPath = routePath.startsWith('/api/') ? routePath.slice(4) : routePath;

  if (safeRequest.method === 'GET' && apiPath === '/health') {
    sendJson(safeResponse, 200, {
      ok: true,
      supabase: Boolean(supabaseConfig().url && supabaseConfig().anonKey),
      dashboard: Boolean(process.env.SUPABASE_DASHBOARD_ENDPOINT),
      reports: Boolean(process.env.SUPABASE_REPORTS_ENDPOINT),
      actions: Boolean(process.env.SUPABASE_ACTIONS_ENDPOINT)
    });
    return;
  }

  if (safeRequest.method === 'GET' && apiPath === '/dashboard') {
    handleDashboard(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Dashboard service error.' }));
    return;
  }
  if (safeRequest.method === 'POST' && apiPath === '/mission-actions') {
    handleAction(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Mission action service error.' }));
    return;
  }
  if (safeRequest.method === 'POST' && apiPath === '/auth/sign-in') {
    handleSignIn(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Authentication service error.' }));
    return;
  }
  if (safeRequest.method === 'POST' && apiPath === '/auth/sign-up') {
    handleSignUp(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Registration service error.' }));
    return;
  }
  if (safeRequest.method === 'GET' && apiPath === '/auth/session') {
    handleSession(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 401, { authenticated: false }));
    return;
  }
  if (safeRequest.method === 'GET' && apiPath === '/reports/sos') {
    handleReport(safeRequest, safeResponse).catch(() => sendJson(safeResponse, 500, { error: 'Report service error.' }));
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

  fs.readFile(filePath, (error, content) => {
    if (error) {
      safeResponse.writeHead(error.code === 'ENOENT' ? 404 : 500);
      safeResponse.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    safeResponse.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    safeResponse.end(content);
  });
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
