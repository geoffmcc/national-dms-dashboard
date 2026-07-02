'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { loadEnv } = require('./src/env');
const { getDashboardData, startAutoRefresh, refreshData } = require('./src/service');

loadEnv(path.join(__dirname, '.env'));
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body, null, 2));
}

function serveStatic(reqPath, res) {
  const safe = reqPath === '/' ? '/index.html' : reqPath;
  const file = path.normalize(path.join(publicDir, safe));
  if (!file.startsWith(publicDir)) return false;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
    return true;
  } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString(), node: process.version });
  }
  if (url.pathname === '/api/signs') {
    try {
      const force = url.searchParams.get('refresh') === '1';
      return sendJson(res, 200, await getDashboardData({ force }));
    } catch (error) {
      return sendJson(res, 500, { error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
    }
  }
  if (serveStatic(url.pathname, res)) return;
  sendJson(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => {
  startAutoRefresh();
  refreshData().catch(error => console.error('Initial refresh failed:', error.message));
  console.log(`DMS dashboard: http://localhost:${port}`);
  console.log('Sources: public/keyless adapters enabled; see the dashboard status bar for per-source results.');
});
