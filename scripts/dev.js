// Zero-dependency local server: npm run dev
//   /            -> public/
//   /lib/*       -> lib/ (straight from source, so edits show without a rebuild)
//   /api/scores  -> api/scores.js, the same handler Vercel runs
//
// PORT=3000 npm run dev            change the port
// .env.local                       KV_REST_API_URL / KV_REST_API_TOKEN, to try the real Redis
// DEV_MEMORY_STORE=1 npm run dev   use an in-memory leaderboard (with a few sample runs),
//                                  so you can see the screens without any Redis
//
// With neither, /api/scores answers 503, exactly as it does in production
// when the variables are missing.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8080);

// Tiny .env.local reader (KEY=value lines). Real environment variables win.
const envFile = join(root, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

// Optional in-memory leaderboard for local play.
let memoryDeps = null;
if (process.env.DEV_MEMORY_STORE === '1') {
  const { createMemoryRedis } = await import('../server/memoryRedis.js');
  const { createLeaderboard } = await import('../server/leaderboard.js');
  const redis = createMemoryRedis();
  const board = createLeaderboard({ redis });
  for (const [name, score, solved] of [['Marlowe', 3850, 4], ['Velma', 3120, 4], ['Dolores', 2440, 3], ['Frankie', 1990, 3], ['Ruby', 1160, 2], ['Eddie', 640, 1]]) {
    await board.submit({ name, score, casesSolved: solved });
  }
  memoryDeps = { redis };
  console.log('DEV_MEMORY_STORE=1: leaderboard is in memory (6 sample runs), reset on restart.');
}

// Node request -> web Request, web Response -> Node response.
async function runApi(req, res, url) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  let response;
  if (memoryDeps) {
    const { handleScores } = await import('../server/scores.js');
    response = await handleScores(request, memoryDeps);
  } else {
    const route = await import('../api/scores.js');
    const handler = route[req.method];
    response = handler ? await handler(request) : new Response('Method not allowed', { status: 405 });
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const [top, ...rest] = clean.split(sep);
  const base = top === 'lib' ? join(root, 'lib') : join(root, 'public');
  const file = top === 'lib' ? join(base, ...rest) : join(base, clean);
  // Stay inside the folder we picked (no ../ escapes).
  return file === base || file.startsWith(base + sep) ? file : null;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === '/api/scores') { await runApi(req, res, url.href); return; }
    let file = resolvePath(url.pathname);
    if (!file) { res.writeHead(403).end('Forbidden'); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, () => console.log(`Logic Detective running at http://localhost:${port}`));
