// The browser can only fetch what is inside public/, but the game rules live
// in lib/ (shared with the serverless API). This copies lib/*.js to
// public/lib/ so `../lib/x.js` imports resolve in the browser. lib/ stays the
// single source of truth; public/lib/ is generated and gitignored.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'lib');
const to = join(root, 'public', 'lib');

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
const files = readdirSync(from).filter((f) => f.endsWith('.js'));
for (const f of files) cpSync(join(from, f), join(to, f));
console.log(`build: copied ${files.length} files from lib/ to public/lib/`);
