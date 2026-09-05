require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 8000);
const root = process.cwd();
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

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL?.replace(/\/$/, ''),
    anonKey: process.env.SUPABASE_ANON_KEY
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

async function readJson(request) {
  let rawBody = '';
  for await (const chunk of request) rawBody += chunk;
  return JSON.parse(rawBody || '{}');
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
    sendJson(response, 503, { error: 'Authentication is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.' });
    return;
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

async function handleSession(request, response) {
  const { url, anonKey } = supabaseConfig();
  const accessToken = requestAccessToken(request);
  if (!url || !anonKey || !accessToken) {
    sendJson(response, 401, { authenticated: false });
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
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const routePath = requestUrl.searchParams.get('__route') || requestUrl.pathname;
  const apiPath = routePath.startsWith('/api/') ? routePath.slice(4) : routePath;

  if (request.method === 'GET' && apiPath === '/dashboard') {
    handleDashboard(request, response).catch(() => sendJson(response, 500, { error: 'Dashboard service error.' }));
    return;
  }
  if (request.method === 'POST' && apiPath === '/mission-actions') {
    handleAction(request, response).catch(() => sendJson(response, 500, { error: 'Mission action service error.' }));
    return;
  }
  if (request.method === 'POST' && apiPath === '/auth/sign-in') {
    handleSignIn(request, response).catch(() => sendJson(response, 500, { error: 'Authentication service error.' }));
    return;
  }
  if (request.method === 'GET' && apiPath === '/auth/session') {
    handleSession(request, response).catch(() => sendJson(response, 401, { authenticated: false }));
    return;
  }
  if (request.method === 'GET' && apiPath === '/reports/sos') {
    handleReport(request, response).catch(() => sendJson(response, 500, { error: 'Report service error.' }));
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405);
    response.end('Method not allowed');
    return;
  }

  const requestPath = decodeURIComponent(requestUrl.pathname);
  const isDemo = requestUrl.searchParams.get('demo') === 'true';
  if ((requestPath === '/' || requestPath === '/index.html') && !requestAccessToken(request) && !isDemo) {
    response.writeHead(302, { Location: '/auth.html' });
    response.end();
    return;
  }
  const relativePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.resolve(root, `.${relativePath}`);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  });
};

module.exports = handler;

if (require.main === module) {
  http.createServer(handler).listen(port, () => {
    console.log(`AEROSAR dev server running at http://localhost:${port}`);
  });
}
