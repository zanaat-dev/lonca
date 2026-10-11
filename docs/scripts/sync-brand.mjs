// Copy the canonical Lonca brand assets from the repo's `brand/` directory into
// `docs/public/brand/` so Astro can serve the logos from the doc site.
// Runs automatically before `pnpm dev` / `pnpm build` (predev / prebuild in
// docs/package.json). `docs/public/brand/` is gitignored — it's copied, not
// committed.

import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The assets the doc site references (logo + favicon) plus the rest of the set
// for completeness. The brand README itself is documentation, not an asset.
const FILES = ['logomark.svg', 'icon.svg', 'wordmark.svg', 'social-preview.png'];

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'brand');
const dest = join(here, '..', 'public', 'brand');
mkdirSync(dest, { recursive: true });

for (const file of FILES) {
  copyFileSync(join(src, file), join(dest, file));
}

console.log(`sync-brand: copied ${FILES.length} file(s) from brand/ → docs/public/brand/`);
