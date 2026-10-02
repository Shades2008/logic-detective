// Zero-dependency static server for local play: npm run dev
//   /          -> public/
//   /lib/*     -> lib/ (straight from source, so edits show without a rebuild)
// PORT=3000 npm run dev to change the port.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8080);

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
    const url = new URL(req.url, 'http://localhost');
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
