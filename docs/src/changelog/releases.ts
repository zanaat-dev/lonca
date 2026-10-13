// Release notes for /surum-notlari/ and /en/changelog/, read at build time
// from the CHANGELOG.md files that changesets writes. The English text is the
// changeset itself; the Turkish text rides along in the same entry inside an
// HTML comment that GitHub and npm do not render:
//
//   <!-- tr
//   Türkçe not…
//   -->
//
// Dates come from the commit that added each version heading, so the docs
// build needs the full history (fetch-depth: 0); a shallow clone gets none.
import { execFileSync } from 'node:child_process';
import { Marked } from 'marked';
import coreLog from '../../../packages/core/CHANGELOG.md?raw';
import trendyolLog from '../../../sdks/trendyol/CHANGELOG.md?raw';
import hepsiburadaLog from '../../../sdks/hepsiburada/CHANGELOG.md?raw';
import n11Log from '../../../sdks/n11/CHANGELOG.md?raw';

export type Bump = 'major' | 'minor' | 'patch';

export interface ChangelogEntry {
  bump: Bump;
  pr?: { number: number; url: string };
  /** Rendered HTML. */
  en: string;
  /** Rendered HTML; missing until someone writes the Turkish note. */
  tr?: string;
}

export interface Release {
  pkg: string;
  version: string;
  /** ISO date (YYYY-MM-DD) the version heading was committed, when known. */
  date?: string;
  entries: ChangelogEntry[];
  /** Workspace packages bumped alongside, e.g. `@lonca/core@1.1.0`. */
  deps: string[];
}

const SOURCES = [
  { pkg: '@lonca/trendyol', file: 'sdks/trendyol/CHANGELOG.md', text: trendyolLog },
  { pkg: '@lonca/hepsiburada', file: 'sdks/hepsiburada/CHANGELOG.md', text: hepsiburadaLog },
  { pkg: '@lonca/n11', file: 'sdks/n11/CHANGELOG.md', text: n11Log },
  { pkg: '@lonca/core', file: 'packages/core/CHANGELOG.md', text: coreLog },
];

export const changelogFiles = SOURCES.map(({ pkg, file }) => ({
  pkg,
  href: `https://github.com/zanaat-dev/lonca/blob/main/${file}`,
}));

// The prefix @changesets/changelog-github puts before each summary.
const ENTRY_HEAD =
  /^(?:\[#(\d+)\]\(([^)]+)\)\s+)?(?:\[`[0-9a-f]+`\]\([^)]+\)\s+)?(?:Thanks (?:\[@[^\]]+\]\([^)]+\)(?:,\s*|\s+and\s+)?)+!\s+-\s+)?/;
const TR_BLOCK = /<!--\s*tr\s*\n([\s\S]*?)-->/;

const marked = new Marked({ gfm: true });
const render = (md: string) =>
  (marked.parse(fixLinks(md), { async: false }) as string)
    // Links out of the page open as usual, but say where they go.
    .replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" rel="noopener"');

// Entries written before the move still link to the old org and docs host.
const fixLinks = (s: string) =>
  s
    .replaceAll('https://github.com/loncadev/lonca', 'https://github.com/zanaat-dev/lonca')
    .replaceAll('https://loncadev.github.io/lonca/', '/');

function parse(pkg: string, text: string): Release[] {
  const releases: Release[] = [];
  let release: Release | undefined;
  let bump: Bump = 'patch';
  let lines: string[] | undefined;

  const flush = () => {
    if (!release || !lines) return;
    const [first, ...rest] = lines;
    lines = undefined;
    if (first.startsWith('Updated dependencies')) {
      for (const l of rest) {
        const dep = l.match(/^- (@lonca\/[\w-]+@\S+)/);
        if (dep) release.deps.push(dep[1]);
      }
      return;
    }
    const head = first.match(ENTRY_HEAD)!;
    const body = [first.slice(head[0].length), ...rest].join('\n');
    const tr = body.match(TR_BLOCK)?.[1].trim();
    release.entries.push({
      bump,
      pr: head[1] ? { number: Number(head[1]), url: fixLinks(head[2]) } : undefined,
      en: render(body.replace(TR_BLOCK, '').trim()),
      tr: tr ? render(tr) : undefined,
    });
  };

  for (const line of text.split(/\r?\n/)) {
    const version = line.match(/^## (\d+\.\d+\.\d+\S*)$/);
    const section = line.match(/^### (Major|Minor|Patch) Changes$/);
    if (version) {
      flush();
      release = { pkg, version: version[1], entries: [], deps: [] };
      releases.push(release);
    } else if (section) {
      flush();
      bump = section[1].toLowerCase() as Bump;
    } else if (line.startsWith('- ')) {
      flush();
      lines = [line.slice(2)];
    } else if (lines && (line === '' || line.startsWith('  '))) {
      lines.push(line.slice(2));
    }
  }
  flush();
  return releases;
}

function git(args: string[]) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const shallow = git(['rev-parse', '--is-shallow-repository']) !== 'false';

function releaseDate(file: string, version: string) {
  if (shallow) return undefined;
  const dates = git([
    'log',
    '--format=%cs',
    '--reverse',
    '-S',
    `## ${version}\n`,
    '--',
    `:(top)${file}`,
  ]);
  return dates.split('\n')[0] || undefined;
}

let cache: Release[] | undefined;

/** Stable (1.0+) releases of the public packages, newest first. */
export function loadReleases(): Release[] {
  cache ??= SOURCES.flatMap(({ pkg, file, text }) =>
    parse(pkg, text)
      .filter((r) => !r.version.startsWith('0.'))
      .map((r) => ({ ...r, date: releaseDate(file, r.version) })),
  ).sort(
    (a, b) =>
      (b.date ?? '').localeCompare(a.date ?? '') ||
      SOURCES.findIndex((s) => s.pkg === a.pkg) - SOURCES.findIndex((s) => s.pkg === b.pkg) ||
      b.version.localeCompare(a.version, 'en', { numeric: true }),
  );
  return cache;
}
