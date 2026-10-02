import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const html = read('public/index.html');
const css = read('public/css/style.css');

test('the build copies lib/ into public/lib/ byte for byte', () => {
  execFileSync(process.execPath, [join(root, 'scripts/build.js')], { stdio: 'pipe' });
  const libFiles = readdirSync(join(root, 'lib')).filter((f) => f.endsWith('.js')).sort();
  const copied = readdirSync(join(root, 'public/lib')).sort();
  assert.deepEqual(copied, libFiles);
  for (const f of libFiles) assert.equal(read(`public/lib/${f}`), read(`lib/${f}`), f);
});

test('public/lib is generated, so it is gitignored; vercel.json builds then serves public/', () => {
  assert.match(read('.gitignore'), /^\/public\/lib\/$/m);
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(vercel.outputDirectory, 'public');
  assert.match(vercel.buildCommand, /build/);
  assert.equal(JSON.parse(read('package.json')).scripts.build, 'node scripts/build.js');
});

test('every browser import is relative and resolves to a file the deploy contains', () => {
  const jsDir = join(root, 'public/js');
  for (const file of readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(join(jsDir, file), 'utf8');
    for (const [, spec] of source.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g)) {
      assert.match(spec, /^\.\.?\//, `${file} imports "${spec}": must be relative so it works from any base path`);
      assert.ok(existsSync(resolve(jsDir, spec)), `${file} imports ${spec}, which does not exist under public/ after the build`);
    }
  }
});

test('lib/ is browser-safe: no Node-only modules or globals', () => {
  for (const file of readdirSync(join(root, 'lib')).filter((f) => f.endsWith('.js'))) {
    const source = read(`lib/${file}`);
    assert.doesNotMatch(source, /from\s+['"]node:/, `${file} imports a node: module`);
    assert.doesNotMatch(source, /\brequire\s*\(/, `${file} uses require`);
    assert.doesNotMatch(source, /\bprocess\./, `${file} touches process`);
    assert.doesNotMatch(source, /\b(Buffer|__dirname|__filename)\b/, `${file} uses a Node global`);
  }
});

test('the UI imports only the adapter and display helpers, never the generator, solver or view', () => {
  const main = read('public/js/main.js');
  const imports = [...main.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['../lib/data.js', '../lib/scoring.js', './art.js', './config.js', './gameClient.js', './storage.js']);
  assert.doesNotMatch(main, /\bseed\b/, 'the UI must not touch the seed');
  // The culprit is only ever read from a finished case (result or run summary), never off the live case view.
  assert.doesNotMatch(main, /\b(?:v|view|ui\.view)\.culprit/, 'culprit read from the live case view');
  assert.match(main, /r\.culprit/, 'expected the result screen to read the culprit from the finished result');
});

test('the UI takes the accuse rule from the adapter instead of re-implementing it', () => {
  const main = read('public/js/main.js');
  assert.match(main, /v\.canAccuse/);
  assert.match(main, /v\.accuseBlockedMessage/);
  assert.doesNotMatch(main, /Open at least \d/, 'the message text lives in the adapter');
  assert.doesNotMatch(main, /cardsOpened\s*(<|>=|<=|>)\s*(MIN_CARDS|\d)/, 'no card-count rule checks in the UI');
  assert.doesNotMatch(main, /cardsOpened\s*<=\s*\w+\.par/, 'the par bonus must come from the score breakdown');
  const how = main.match(/Open at least \$\{MIN_CARDS_TO_ACCUSE\} clues first/);
  assert.ok(how, 'How to Play explains the rule using the shared constant');
});

test('page metadata supports a bare shared link', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1/);
  assert.match(html, /<title>[^<]{5,}<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{20,}"/);
  assert.match(html, /<meta property="og:title" content="[^"]+"/);
  assert.match(html, /<meta property="og:description" content="[^"]{20,}"/);
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,[^"]*%F0%9F%95%B5/); // emoji favicon, no file
  assert.match(html, /<html lang="en">/);
});

test('page uses only relative URLs so it works at any base path, and loads nothing external', () => {
  for (const [, url] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    if (url.startsWith('data:') || url.startsWith('#')) continue;
    assert.doesNotMatch(url, /^(\/|https?:)/, `index.html references "${url}"`);
  }
  assert.doesNotMatch(css, /url\(\s*['"]?(https?:|\/)/);
  assert.doesNotMatch(html + css, /fonts\.googleapis|cdn\./);
});

test('CSS: touch-friendly, safe-area aware, and nothing depends on hover', () => {
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*48px/);
  // Any :hover rule must sit inside @media (hover: hover), so touch devices never need it.
  const withoutHoverBlocks = css.replace(/@media \(hover: hover\) \{[\s\S]*?\n\}\n/g, '');
  assert.doesNotMatch(withoutHoverBlocks, /:hover/);
  assert.doesNotMatch(css, /@media[^{]*\(pointer:\s*fine\)/);
});

test('feedback link is a swappable placeholder, not a real address', () => {
  const config = read('public/js/config.js');
  const [, url] = config.match(/FEEDBACK_URL\s*=\s*'([^']+)'/);
  assert.match(url, /^(mailto:|https:\/\/)/);
  assert.match(url, /example\.(com|org)/, 'ship a placeholder; swap it before sharing widely');
});

test('index.html has the four screens, the dialog and a live region', () => {
  for (const id of ['screen-title', 'screen-case', 'screen-result', 'screen-final', 'howto', 'announcer', 'btn-howto-top']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /<script type="module" src="js\/main\.js"/);
});
