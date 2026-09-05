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

async function handleSignIn(request, response) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    sendJson(response, 503, { error: 'Authentication is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.' });
    return;
  }

  let rawBody = '';
  request.on('data', (chunk) => { rawBody += chunk; });
  request.on('end', async () => {
    try {
      const credentials = JSON.parse(rawBody);
      const supabaseResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
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
  });
}

async function handleReport(request, response) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_REPORTS_ENDPOINT) {
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
  const supabaseResponse = await fetch(reportUrl, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` } });
  const result = await supabaseResponse.json();
  if (!supabaseResponse.ok) {
    sendJson(response, supabaseResponse.status, { error: 'Supabase could not return the mission report.' });
    return;
  }
  sendJson(response, 200, Array.isArray(result) ? result[0] || {} : result);
}

const server = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/auth/sign-in') {
    handleSignIn(request, response).catch(() => sendJson(response, 500, { error: 'Authentication service error.' }));
    return;
  }
  if (request.method === 'GET' && request.url.startsWith('/api/reports/sos')) {
    handleReport(request, response).catch(() => sendJson(response, 500, { error: 'Report service error.' }));
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405);
    response.end('Method not allowed');
    return;
  }

  const requestPath = decodeURIComponent(request.url.split('?')[0]);
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
});

server.listen(port, () => {
  console.log(`AEROSAR dev server running at http://localhost:${port}`);
});
