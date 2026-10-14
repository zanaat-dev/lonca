#!/usr/bin/env -S pnpm exec tsx
/**
 * Request check: run every catalog call over a recording `fetch` (no network,
 * no credentials) and compare each request the SDK sends with `specs/`.
 *
 *   pnpm build && pnpm drift:requests
 *   pnpm drift:requests -- --only hepsiburada
 *   pnpm drift:requests -- --fail-on never
 *
 * Exit codes: 0 nothing at or above `--fail-on` (default `breaking`), 1
 * findings at that level or a sample that threw, 2 usage error.
 *
 * Findings a maintainer has reviewed and accepted live in `known.json`
 * (`{ call, kind, path, reason, since }`); the report lists stale entries.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOperationIndex,
  checkRequest,
  createRequestRecorder,
  loadSpecs,
  SEVERITIES,
  type Finding,
  type Severity,
} from '@lonca/drift';
import { hepsiburadaRequests } from './hepsiburada.mts';
import { n11Requests } from './n11.mts';
import { methodOf, type RequestSet } from './registry.mts';
import { trendyolRequests } from './trendyol.mts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SETS: Record<
  string,
  { set: RequestSet<unknown>; snapshot: string; clientInterface: string }
> = {
  trendyol: {
    set: trendyolRequests as RequestSet<unknown>,
    snapshot: 'etc/trendyol-client.d.ts.snapshot',
    clientInterface: 'TrendyolClient',
  },
  hepsiburada: {
    set: hepsiburadaRequests as RequestSet<unknown>,
    snapshot: 'etc/hepsiburada-client.d.ts.snapshot',
    clientInterface: 'HepsiburadaClient',
  },
  n11: {
    set: n11Requests as RequestSet<unknown>,
    snapshot: 'etc/n11-client.d.ts.snapshot',
    clientInterface: 'N11Client',
  },
};

interface KnownEntry {
  call: string;
  kind: string;
  path: string;
  reason: string;
  since: string;
}

interface CallReport {
  marketplace: string;
  call: string;
  operations: string[];
  error?: string;
  skip?: string;
  findings: (Finding & { accepted?: string })[];
}

function parseArgs(argv: string[]) {
  const only: string[] = [];
  let failOn: Severity | 'never' = 'breaking';
  let outDir = join(ROOT, 'drift-output');
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--only') only.push(argv[++i] ?? '');
    else if (arg === '--fail-on') failOn = (argv[++i] ?? '') as Severity | 'never';
    else if (arg === '--out-dir') outDir = argv[++i] ?? outDir;
    else {
      console.error(`unknown argument ${arg}`);
      process.exit(2);
    }
  }
  if (failOn !== 'never' && !SEVERITIES.includes(failOn)) {
    console.error(`--fail-on must be one of ${SEVERITIES.join(', ')}, never`);
    process.exit(2);
  }
  for (const name of only) {
    if (!SETS[name]) {
      console.error(`unknown marketplace ${name}`);
      process.exit(2);
    }
  }
  return { only, failOn, outDir };
}

/** Public `resource.method` names, read from the API lock (`etc/*.snapshot`). */
function publicMethods(snapshotFile: string, clientInterface: string): string[] {
  const text = readFileSync(join(ROOT, snapshotFile), 'utf8');
  const block = (header: RegExp): string[] => {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((l) => header.test(l));
    if (start < 0) return [];
    const end = lines.findIndex((l, i) => i > start && l === '}');
    return lines.slice(start + 1, end);
  };
  const out: string[] = [];
  for (const line of block(new RegExp(`^interface ${clientInterface} \\{`))) {
    const m = /^ {4}(\w+): (\w+);/.exec(line);
    if (!m) continue;
    for (const member of block(new RegExp(`^declare class ${m[2]} \\{`))) {
      const method = /^ {4}(?!private |constructor|static |readonly )(\w+)(?:<[^(]*>)?\(/.exec(
        member,
      );
      if (method) out.push(`${m[1]}.${method[1]}`);
    }
  }
  return [...new Set(out)].sort();
}

const { only, failOn, outDir } = parseArgs(process.argv.slice(2));
const specs = loadSpecs(join(ROOT, 'specs'));
const index = buildOperationIndex(specs);
const known: KnownEntry[] = JSON.parse(
  readFileSync(join(ROOT, 'scripts/probe/requests/known.json'), 'utf8'),
);
const usedKnown = new Set<KnownEntry>();
const reports: CallReport[] = [];
const uncovered: Record<string, string[]> = {};

for (const [marketplace, { set, snapshot, clientInterface }] of Object.entries(SETS)) {
  if (only.length && !only.includes(marketplace)) continue;
  for (const call of set.calls) {
    const recorder = createRequestRecorder(call.respond);
    const client = set.createClient(recorder.fetch);
    const report: CallReport = { marketplace, call: call.name, operations: [], findings: [] };
    let failure: unknown;
    try {
      await call.call(client);
    } catch (error) {
      failure = error ?? 'unknown error';
    }
    const requests = recorder.take();
    // A sample that throws before sending is a broken sample; after sending,
    // the SDK may simply dislike the canned answer, which is fine.
    if (failure !== undefined && requests.length === 0) {
      report.error =
        failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure);
    }
    if (call.skip) report.skip = call.skip;
    for (const request of requests) {
      const checked = checkRequest(request, index, specs);
      report.operations.push(checked.operation.key);
      if (call.skip) continue;
      for (const f of checked.findings) {
        const entry = known.find(
          (k) => k.call === call.name && k.kind === f.kind && k.path === f.path,
        );
        if (entry) usedKnown.add(entry);
        report.findings.push(entry ? { ...f, severity: 'info', accepted: entry.reason } : f);
      }
    }
    reports.push(report);
  }
  const sampled = new Set(set.calls.map((c) => methodOf(c.name)));
  const exempt = new Set(Object.keys(set.noRequest ?? {}));
  uncovered[marketplace] = publicMethods(snapshot, clientInterface).filter(
    (m) => !sampled.has(m) && !exempt.has(m),
  );
}

// ─── Report ────────────────────────────────────────────────────────────────
const rank = (s: Severity) => SEVERITIES.indexOf(s);
const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
for (const r of reports) for (const f of r.findings) counts[f.severity]++;
const broken = reports.filter((r) => r.error);
const stale = known.filter((k) => !usedKnown.has(k));

const md: string[] = ['# Request check', ''];
md.push(
  `${reports.length} calls, ${reports.reduce((n, r) => n + r.operations.length, 0)} requests · ` +
    SEVERITIES.map((s) => `${counts[s]} ${s}`).join(' · ') +
    (broken.length ? ` · **${broken.length} samples threw before sending**` : ''),
  '',
);
for (const r of reports) {
  const shown = r.findings.filter((f) => f.severity !== 'info' || f.accepted);
  if (!r.error && shown.length === 0) continue;
  md.push(`## ${r.marketplace} · \`${r.call}\``, '');
  if (r.operations.length)
    md.push(`Operations: ${r.operations.map((o) => `\`${o}\``).join(', ')}`, '');
  if (r.error) md.push(`- **sample threw before sending:** ${r.error}`);
  for (const f of shown.sort((a, b) => rank(a.severity) - rank(b.severity))) {
    md.push(
      `- **${f.accepted ? 'accepted' : f.severity}** \`${f.kind}\` at \`${f.path || '(body)'}\`: ${f.message}` +
        (f.accepted ? ` — ${f.accepted}` : ''),
    );
  }
  md.push('');
}
for (const [marketplace, methods] of Object.entries(uncovered)) {
  if (methods.length)
    md.push(`**${marketplace}: no sample for** ${methods.map((m) => `\`${m}\``).join(', ')}`, '');
}
if (stale.length) {
  md.push(
    '**Stale `known.json` entries:**',
    ...stale.map((k) => `- ${k.call} · ${k.kind} · ${k.path}`),
    '',
  );
}
const markdown = md.join('\n');
console.log(markdown);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'requests.md'), markdown);
writeFileSync(
  join(outDir, 'requests.json'),
  JSON.stringify({ reports, uncovered, stale }, null, 2),
);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);

const failing =
  broken.length > 0 ||
  (failOn !== 'never' && SEVERITIES.some((s) => rank(s) <= rank(failOn) && counts[s] > 0));
process.exit(failing ? 1 : 0);
