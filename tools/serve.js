// Local preview server:  node tools/serve.js  [port]
//
// Serves the site exactly as GitHub Pages will, and also lets the Dugout page
// save straight to the data files on this computer ("local mode"), so games
// can be added offline and pushed to GitHub later.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.gif': 'image/gif',
};

const sha = (text) => crypto.createHash('sha1').update(text).digest('hex');
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

// Local saves may only touch files inside data/.
function dataPath(rel) {
  const full = path.resolve(ROOT, String(rel || ''));
  if (!full.startsWith(path.join(ROOT, 'data') + path.sep)) throw Object.assign(new Error('Only files in data/ can be changed.'), { status: 400 });
  return full;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function localApi(req, res, url) {
  // The custom header keeps other websites open in the browser from calling this.
  if (req.headers['x-sluggers-local'] !== '1') return send(res, 403, { message: 'Missing local header.' });
  const action = url.pathname.replace('/__local/', '');
  const rel = url.searchParams.get('path');
  if (action === 'ping') return send(res, 200, { ok: true });
  if (action === 'read') {
    const text = await fs.readFile(dataPath(rel), 'utf8').catch(() => null);
    return text == null ? send(res, 404, { message: 'Not found' }) : send(res, 200, { text, sha: sha(text) });
  }
  if (action === 'list') {
    const names = await fs.readdir(dataPath(rel)).catch(() => []);
    return send(res, 200, names.map((name) => ({ name, path: `${rel}/${name}` })));
  }
  if (action === 'write' && req.method === 'PUT') {
    const body = await readBody(req);
    const file = dataPath(body.path);
    const current = await fs.readFile(file, 'utf8').catch(() => null);
    if (current != null && body.sha !== sha(current)) return send(res, 409, { message: 'The file changed since it was read.' });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body.text, 'utf8');
    return send(res, 200, { sha: sha(body.text) });
  }
  if (action === 'remove' && req.method === 'DELETE') {
    await fs.rm(dataPath(rel), { force: true });
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { message: 'Unknown action' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/__local/')) return await localApi(req, res, url);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const full = path.resolve(ROOT, '.' + rel);
    if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
    const body = await fs.readFile(full).catch(() => null);
    if (body == null) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, body, TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream');
  } catch (err) {
    send(res, err.status || 500, { message: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Sluggers league site:  http://localhost:${PORT}/`);
  console.log(`Dugout (upload page):  http://localhost:${PORT}/dugout.html`);
  console.log('Press Ctrl+C to stop.');
});
