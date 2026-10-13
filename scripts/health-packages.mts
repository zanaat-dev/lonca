#!/usr/bin/env -S pnpm exec tsx
/**
 * Package health checks for the published packages.
 *
 *   pnpm health:packages
 *
 * For each published package this runs:
 *   - `publint --strict`  — package.json / files / exports correctness
 *   - `attw --pack <dir> --profile node16` — "Are the types wrong?" on the packed
 *     tarball, checking node16 (CJS + ESM) and bundler resolution. The node10
 *     profile is skipped deliberately: every package declares `engines.node >= 22`
 *     and TypeScript's `node10` (a.k.a. legacy `node`) resolution predates the
 *     `exports` maps these packages are built around.
 *
 * Exit code: 0 when every check passes, 1 otherwise. Requires `pnpm build` first
 * (attw packs the on-disk `dist/`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface PublishedPackage {
  name: string;
  dir: string;
}

const packages: PublishedPackage[] = [
  { name: '@lonca/core', dir: 'packages/core' },
  { name: '@lonca/trendyol', dir: 'sdks/trendyol' },
  { name: '@lonca/hepsiburada', dir: 'sdks/hepsiburada' },
  { name: '@lonca/n11', dir: 'sdks/n11' },
];

const repoRoot = process.cwd();

function run(label: string, command: string, args: string[], cwd: string): boolean {
  console.log(`\n--- ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(`${label} failed to start: ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

let failures = 0;

for (const pkg of packages) {
  const pkgDir = join(repoRoot, pkg.dir);
  console.log(`\n=== ${pkg.name} (${pkg.dir}) ===`);

  if (!existsSync(join(pkgDir, 'dist'))) {
    console.error(`dist/ missing for ${pkg.name} — run \`pnpm build\` first.`);
    failures += 1;
    continue;
  }

  if (!run(`publint ${pkg.name}`, 'pnpm', ['exec', 'publint', '--strict'], pkgDir)) {
    failures += 1;
  }

  if (
    !run(
      `attw ${pkg.name}`,
      'pnpm',
      ['exec', 'attw', '--pack', pkg.dir, '--profile', 'node16'],
      repoRoot,
    )
  ) {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\nPackage health: ${failures} check(s) failed.`);
  process.exit(1);
}

console.log('\nPackage health: all checks passed.');
