#!/usr/bin/env -S pnpm exec tsx
/**
 * API surface lock for the published packages.
 *
 *   pnpm api:check    # compare dist/*.d.ts against etc/*.api.d.ts.snapshot, exit 1 on drift
 *   pnpm api:update   # regenerate the snapshots from dist/
 *
 * tsup rolls each entry point up into a single .d.ts. For a package with more
 * than one entry (index + testing) it moves the shared declarations into a
 * hashed chunk (`client-<hash>.d.ts`) and the entries only re-export from it
 * under minified aliases. So that the lock covers the actual type shapes, every
 * chunk an entry imports is snapshotted too (`etc/<pkg>-<chunk>.d.ts.snapshot`),
 * and the volatile parts are normalised: chunk hashes are dropped
 * (`./client-AbC123xy.js` -> `./client.js`), minified aliases are stripped from
 * the import/export lists that link entries and chunks, and those lists are
 * sorted. Everything is byte-normalised (CRLF -> LF, one trailing newline).
 * Requires `pnpm build` first.
 *
 * Exit codes: 0 in sync, 1 drift detected (--check), 2 usage / missing build output.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parseArgs } from 'node:util';

interface SurfaceEntry {
  /** Short package label, used to name chunk snapshots. */
  pkg: string;
  /** Rolled-up declaration file produced by tsup. */
  source: string;
  /** Committed snapshot path. */
  snapshot: string;
}

const entries: SurfaceEntry[] = [
  { pkg: 'core', source: 'packages/core/dist/index.d.ts', snapshot: 'etc/core-api.d.ts.snapshot' },
  {
    pkg: 'trendyol',
    source: 'sdks/trendyol/dist/index.d.ts',
    snapshot: 'etc/trendyol-api.d.ts.snapshot',
  },
  {
    pkg: 'trendyol',
    source: 'sdks/trendyol/dist/testing.d.ts',
    snapshot: 'etc/trendyol-testing-api.d.ts.snapshot',
  },
  {
    pkg: 'hepsiburada',
    source: 'sdks/hepsiburada/dist/index.d.ts',
    snapshot: 'etc/hepsiburada-api.d.ts.snapshot',
  },
  {
    pkg: 'hepsiburada',
    source: 'sdks/hepsiburada/dist/testing.d.ts',
    snapshot: 'etc/hepsiburada-testing-api.d.ts.snapshot',
  },
  {
    pkg: 'n11',
    source: 'sdks/n11/dist/index.d.ts',
    snapshot: 'etc/n11-api.d.ts.snapshot',
  },
  {
    pkg: 'n11',
    source: 'sdks/n11/dist/testing.d.ts',
    snapshot: 'etc/n11-testing-api.d.ts.snapshot',
  },
];

/** `'./client-AbC123xy.js'` — a hashed tsup chunk referenced from a declaration file. */
const CHUNK_REF = /(['"])\.\/([A-Za-z0-9_]+)-([A-Za-z0-9_-]{8})\.js\1/g;
/** A minified alias tsup uses to link entries and chunks (`a`, `aZ`, `b0`, `$`). */
const MINIFIED = /^[A-Za-z_$][A-Za-z0-9_$]?$/;

/** Chunks (`client`) imported by a declaration file, with their on-disk declaration path. */
function chunkRefs(source: string, content: string): { name: string; source: string }[] {
  const refs = new Map<string, string>();
  for (const match of content.matchAll(CHUNK_REF)) {
    const [, , name, hash] = match;
    refs.set(name!, posix.join(posix.dirname(source), `${name}-${hash}.d.ts`));
  }
  return [...refs].map(([name, path]) => ({ name, source: path }));
}

/** `x as Name` / `Name as x` (either side a minified alias) -> `Name`. */
function stripAlias(spec: string): string {
  const typePrefix = spec.startsWith('type ') ? 'type ' : '';
  const parts = spec.slice(typePrefix.length).split(/\s+as\s+/);
  if (parts.length !== 2) return spec;
  const [left, right] = parts as [string, string];
  if (MINIFIED.test(left) && !MINIFIED.test(right)) return typePrefix + right;
  if (MINIFIED.test(right) && !MINIFIED.test(left)) return typePrefix + left;
  return spec;
}

/**
 * Make a declaration file independent of chunk hashes and minified aliases:
 * `./client-<hash>.js` -> `./client.js`, and in single-line `import { … }` /
 * `export { … }` lists the aliases are stripped and the names sorted.
 */
function stabilise(content: string): string {
  const unhashed = content.replace(
    CHUNK_REF,
    (_match, quote: string, name: string) => `${quote}./${name}.js${quote}`,
  );
  return unhashed.replace(
    /^(import|export)( type)? \{([^}\n]*)\}( from '[^']+')?;$/gm,
    (
      _match,
      keyword: string,
      typeOnly: string | undefined,
      list: string,
      from: string | undefined,
    ) => {
      const specifiers = list
        .split(',')
        .map((spec) => spec.trim())
        .filter(Boolean)
        .map(stripAlias)
        .sort((a, b) => a.replace(/^type /, '').localeCompare(b.replace(/^type /, ''), 'en'));
      return `${keyword}${typeOnly ?? ''} { ${specifiers.join(', ')} }${from ?? ''};`;
    },
  );
}

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    update: { type: 'boolean', default: false },
  },
});

if (values.check === values.update) {
  console.error('Usage: api-surface.mts --check | --update');
  process.exit(2);
}

const repoRoot = process.cwd();

function normalise(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
}

/** Minimal line-level diff: shows which snapshot lines were removed/added. */
function printDiff(snapshot: string, current: string): void {
  const oldLines = snapshot.split('\n');
  const newLines = current.split('\n');
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const removed = oldLines.filter((line) => !newSet.has(line));
  const added = newLines.filter((line) => !oldSet.has(line));
  const cap = 40;
  for (const line of removed.slice(0, cap)) console.log(`  - ${line}`);
  if (removed.length > cap) console.log(`  … ${removed.length - cap} more removed line(s)`);
  for (const line of added.slice(0, cap)) console.log(`  + ${line}`);
  if (added.length > cap) console.log(`  … ${added.length - cap} more added line(s)`);
}

/** Every snapshot to produce: the entries plus each distinct chunk they import. */
const targets: { source: string; snapshot: string }[] = [];
for (const entry of entries) {
  const sourcePath = join(repoRoot, entry.source);
  if (!existsSync(sourcePath)) {
    console.error(`Missing ${entry.source} — run \`pnpm build\` first.`);
    process.exit(2);
  }
  targets.push(entry);
  for (const chunk of chunkRefs(entry.source, readFileSync(sourcePath, 'utf8'))) {
    const snapshot = `etc/${entry.pkg}-${chunk.name}.d.ts.snapshot`;
    if (!targets.some((t) => t.snapshot === snapshot)) {
      targets.push({ source: chunk.source, snapshot });
    }
  }
}

let drift = 0;

for (const entry of targets) {
  const sourcePath = join(repoRoot, entry.source);
  const snapshotPath = join(repoRoot, entry.snapshot);

  if (!existsSync(sourcePath)) {
    console.error(`Missing ${entry.source} — run \`pnpm build\` first.`);
    process.exit(2);
  }

  const current = normalise(stabilise(readFileSync(sourcePath, 'utf8')));

  if (values.update) {
    mkdirSync(join(repoRoot, 'etc'), { recursive: true });
    writeFileSync(snapshotPath, current);
    console.log(`updated  ${entry.snapshot}`);
    continue;
  }

  if (!existsSync(snapshotPath)) {
    console.error(`missing  ${entry.snapshot} — run \`pnpm api:update\` and commit it.`);
    drift += 1;
    continue;
  }

  const snapshot = normalise(readFileSync(snapshotPath, 'utf8'));
  if (snapshot === current) {
    console.log(`ok       ${entry.snapshot}`);
  } else {
    console.error(`changed  ${entry.snapshot} (from ${entry.source})`);
    printDiff(snapshot, current);
    drift += 1;
  }
}

// A snapshot nothing produces any more (e.g. a chunk tsup stopped emitting) is stale.
if (values.check) {
  const expected = new Set(targets.map((t) => t.snapshot));
  for (const file of readdirSync(join(repoRoot, 'etc'))) {
    if (file.endsWith('.snapshot') && !expected.has(`etc/${file}`)) {
      console.error(`stale    etc/${file} — no longer produced; delete it.`);
      drift += 1;
    }
  }
}

if (drift > 0) {
  console.error(
    '\nAPI surface changed — regenerate with `pnpm api:update` and include the diff in your PR.',
  );
  process.exit(1);
}

if (values.check) {
  console.log('\nAPI surface: in sync.');
}
