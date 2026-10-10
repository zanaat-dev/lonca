// Check every internal link and asset reference in the built docs site.
//
// Scans `docs/dist/**/*.html` for `href`/`src` attributes that point inside the
// site (root-relative `/…` or relative `./…`, `../…`, `foo/`). Each one must
// resolve to a file in `dist/`, or to a directory that holds an `index.html`.
// External URLs, protocol-relative URLs, `mailto:`/`tel:` links and same-page
// `#fragments` are skipped.
//
// Usage: pnpm docs:build && pnpm docs:check-links
// Exits 1 and lists each broken target (with up to three pages that link to it).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

if (!existsSync(DIST)) {
  console.error('check-links: docs/dist not found — run `pnpm docs:build` first.');
  process.exit(2);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

function resolves(sitePath) {
  const target = join(DIST, ...sitePath.split('/').filter(Boolean));
  if (!existsSync(target)) return false;
  return statSync(target).isFile() || existsSync(join(target, 'index.html'));
}

const ATTR = /\s(?:href|src)="([^"]*)"/g;
const SKIP = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

const pages = walk(DIST);
const broken = new Map();
let checked = 0;

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const pageDir = '/' + relative(DIST, dirname(file)).split(sep).join('/');
  for (const [, raw] of html.matchAll(ATTR)) {
    if (!raw || SKIP.test(raw)) continue;
    const path = decodeURIComponent(raw.split('#')[0].split('?')[0]);
    if (!path) continue;
    const sitePath = path.startsWith('/') ? path : posix.join(pageDir, path);
    checked++;
    if (resolves(sitePath)) continue;
    const from = '/' + relative(DIST, file).split(sep).join('/');
    const list = broken.get(sitePath) ?? [];
    list.push(from);
    broken.set(sitePath, list);
  }
}

if (broken.size === 0) {
  console.log(`check-links: ${checked} internal links across ${pages.length} pages — all resolve.`);
  process.exit(0);
}

console.error(`check-links: ${broken.size} broken target(s) in ${pages.length} pages:`);
for (const [target, from] of broken) {
  const shown = from.slice(0, 3).join(', ');
  const more = from.length > 3 ? ` (+${from.length - 3} more)` : '';
  console.error(`  ${target}  ←  ${shown}${more}`);
}
process.exit(1);
