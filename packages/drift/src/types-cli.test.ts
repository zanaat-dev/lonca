/**
 * End-to-end: `pnpm drift:types` against the REAL SDK sources, specs/ and
 * probe-snapshots/. No network, no credentials, no SDK import.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CliIo } from './cli.js';
import type { Finding } from './engine.js';
import { runTypesCli } from './types-cli.js';
import type { SdkTypeMapEntry } from './types-map.js';
import type { TypeEntryReport, TypesReport } from './types-report.js';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

let dir: string;
let logs: string[];
let errors: string[];
let io: CliIo;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lonca-drift-types-'));
  logs = [];
  errors = [];
  io = { cwd: REPO, log: (l) => logs.push(l), error: (l) => errors.push(l) };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const BRANDS: SdkTypeMapEntry = {
  marketplace: 'trendyol',
  sdkType: 'TrendyolBrandListResponse',
  source: 'sdks/trendyol/src/resources/brands.ts',
  spec: 'trendyol/product.json',
  operation: 'GET /integration/product/brands',
  pointer: '(root)',
};
const TRANSACTIONS: SdkTypeMapEntry = {
  marketplace: 'hepsiburada',
  sdkType: 'AccountingTransaction',
  source: 'sdks/hepsiburada/src/types/accounting.ts',
  spec: 'hepsiburada/mpfinance-external.json',
  operation: 'GET /transactions/merchantid/{merchantId}',
  pointer: 'items[]',
  ignore: ['raw'],
};

function writeJson(name: string, value: unknown): string {
  const file = join(dir, name);
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

function cli(...args: string[]): number {
  return runTypesCli(['--out-dir', join(dir, 'out'), ...args], io);
}

function readReport(): { json: TypesReport; md: string } {
  return {
    json: JSON.parse(readFileSync(join(dir, 'out', 'types-report.json'), 'utf8')) as TypesReport,
    md: readFileSync(join(dir, 'out', 'types-report.md'), 'utf8'),
  };
}

const entryOf = (report: TypesReport, sdkType: string): TypeEntryReport =>
  report.marketplaces.flatMap((m) => m.entries).find((e) => e.sdkType === sdkType)!;
const at = (e: TypeEntryReport, path: string, kind: string): Finding | undefined =>
  e.findings.find((f) => f.path === path && f.kind === kind);

describe('pnpm drift:types (real SDK sources, specs and wire baseline)', () => {
  it('reports real SDK type findings with wire evidence, warn-only by default', () => {
    const map = writeJson('map.json', { entries: [BRANDS, TRANSACTIONS] });
    expect(cli('--map', map)).toBe(0);
    expect(errors).toEqual([]);
    const { json, md } = readReport();

    const brands = entryOf(json, 'TrendyolBrandListResponse');
    expect(brands.wireBaseline).toBe(true);
    // brands.list keeps an optional `totalPages`, which neither the spec nor the prod wire
    // carries; the committed overlay accepts it (the SDK falls back to a full-page heuristic).
    expect(at(brands, 'totalPages', 'accepted')).toMatchObject({
      severity: 'info',
      accepts: 'sdk-unknown-field',
      wire: [],
    });
    // `luxe` is undocumented but on the prod wire: info, not warning.
    expect(at(brands, 'brands[].luxe', 'sdk-unknown-field')).toMatchObject({
      severity: 'info',
      wire: ['boolean'],
    });
    expect(at(brands, 'brands[].id', 'sdk-type-mismatch')).toBeUndefined();

    const tx = entryOf(json, 'AccountingTransaction');
    expect(at(tx, 'items[].amount', 'sdk-type-mismatch')).toMatchObject({
      severity: 'warning',
      sdk: ['number'],
      documented: ['object'],
      wire: ['object'],
    });
    expect(tx.findings.some((f) => f.path === 'items[].raw')).toBe(false);

    expect(md).toContain(
      '### `AccountingTransaction` → `GET /transactions/merchantid/{merchantId}` · `items[]`',
    );
    expect(logs[0]).toMatch(/^hepsiburada: 1 map entry, \d+ SDK type\(s\) covered — \d+ warning/);
    expect(logs.at(-1)).toBe('✓ report written (--fail-on never: warn-only)');
  });

  it('fails on warnings with --fail-on warning, and filters with --only', () => {
    const map = writeJson('map.json', { entries: [BRANDS, TRANSACTIONS] });
    // Without the overlay, brands' optional totalPages / totalElements stay warnings.
    expect(cli('--map', map, '--fail-on', 'warning', '--only', 'trendyol', '--no-known')).toBe(1);
    expect(
      at(
        entryOf(readReport().json, 'TrendyolBrandListResponse'),
        'totalPages',
        'sdk-unknown-field',
      ),
    ).toMatchObject({ severity: 'warning', wire: [] });
    expect(readReport().json.marketplaces.map((m) => m.marketplace)).toEqual(['trendyol']);
    expect(logs.at(-1)).toBe('✖ SDK-type warnings — see types-report.md');
  });

  it('passes --fail-on warning when the mapped types have no warnings', () => {
    const map = writeJson('map.json', {
      entries: [
        {
          marketplace: 'trendyol',
          sdkType: 'ClaimIssueReason',
          source: 'sdks/trendyol/src/types/claim.ts',
          spec: 'trendyol/marketplace.json',
          operation: 'GET /integration/order/claim-issue-reasons',
          pointer: '[]',
        },
      ],
    });
    expect(cli('--map', map, '--fail-on', 'warning', '--no-known')).toBe(0);
    expect(logs.at(-1)).toBe('✓ no SDK-type warnings');
    expect(readReport().json.known).toBeUndefined();
  });

  it('applies an explicit overlay to sdk-* findings', () => {
    const map = writeJson('map.json', { entries: [BRANDS] });
    const known = writeJson('known.json', {
      entries: [
        {
          marketplace: 'trendyol',
          operation: 'GET /integration/product/brands',
          path: '*',
          kind: 'sdk-unknown-field',
          reason: 'test',
          since: '2026-10-10',
        },
      ],
    });
    expect(cli('--map', map, '--known', known, '--fail-on', 'warning')).toBe(0);
    const { json } = readReport();
    expect(json.known).toMatchObject({ entries: 1, stale: [] });
    expect(json.known!.accepted).toBeGreaterThan(0);
  });

  it('resolves every entry of the committed map', () => {
    expect(cli()).toBe(0);
    expect(errors).toEqual([]);
    const { json } = readReport();
    expect(json.marketplaces.map((m) => m.marketplace)).toEqual(['hepsiburada', 'n11', 'trendyol']);
    // n11 maps its four REST read envelopes; the others map many more types.
    for (const m of json.marketplaces)
      expect(m.entries.length).toBeGreaterThanOrEqual(m.marketplace === 'n11' ? 4 : 11);
  }, 30_000);
});

describe('pnpm drift:types — usage and input errors', () => {
  it('prints help', () => {
    expect(runTypesCli(['--help'], io)).toBe(0);
    expect(logs[0]).toMatch(/^Usage: pnpm drift:types/);
  });

  it('accepts a leading `--` (pnpm 11 forwards it from `pnpm drift:types -- --flag`)', () => {
    expect(runTypesCli(['--', '--help'], io)).toBe(0);
  });

  it('rejects bad flags', () => {
    expect(cli('--bogus')).toBe(2);
    expect(errors[0]).toMatch(/Unknown option/);
    expect(cli('--fail-on', 'breaking')).toBe(2);
    expect(errors.at(-1)).toBe('✖ --fail-on must be one of warning, never (got breaking)');
    expect(cli('--known', 'x.json', '--no-known')).toBe(2);
    expect(errors.at(-1)).toBe('✖ --known and --no-known are mutually exclusive');
  });

  it('rejects missing or invalid inputs', () => {
    expect(cli('--specs-dir', join(dir, 'none'))).toBe(2);
    expect(errors.at(-1)).toMatch(/missing input/);

    expect(cli('--map', writeJson('bad-map.json', { entries: [{}] }))).toBe(2);
    expect(errors.at(-1)).toMatch(/invalid SDK type map/);

    const map = writeJson('map.json', { entries: [BRANDS] });
    expect(cli('--map', map, '--known', writeJson('bad-known.json', '{'))).toBe(2);
    expect(errors.at(-1)).toMatch(/not valid JSON/);

    expect(cli('--map', map, '--only', 'nowhere')).toBe(2);
    expect(errors.at(-1)).toBe('✖ --only matched no map entry. Marketplaces in the map: trendyol');
  });

  it('rejects unreadable snapshots', () => {
    const snaps = mkdtempSync(join(dir, 'snaps-'));
    writeFileSync(join(snaps, 'trendyol.json'), '{ not json');
    const map = writeJson('map.json', { entries: [BRANDS] });
    expect(cli('--map', map, '--snapshots-dir', snaps)).toBe(2);
    expect(errors.at(-1)).toMatch(/could not read probe snapshots/);
  });

  it('runs without a wire baseline when the snapshots directory does not exist', () => {
    const map = writeJson('map.json', { entries: [BRANDS] });
    expect(cli('--map', map, '--snapshots-dir', join(dir, 'none'))).toBe(0);
    expect(readReport().json.marketplaces[0]!.entries[0]!.wireBaseline).toBe(false);
  });

  it('lists map entries that do not resolve and writes nothing', () => {
    const map = writeJson('map.json', {
      entries: [
        { ...BRANDS, sdkType: 'NoSuchType' },
        { ...BRANDS, pointer: 'nowhere[]' },
        { ...BRANDS, source: 'sdks/trendyol/src/none.ts' },
      ],
    });
    expect(cli('--map', map)).toBe(2);
    expect(errors).toEqual([
      '✖ the type map does not resolve against the inputs:',
      '  - sdks/trendyol/src/none.ts: file not found',
      '  - sdks/trendyol/src/resources/brands.ts: no interface or type alias named NoSuchType',
      '  - entries[0] (NoSuchType → GET /integration/product/brands (root)): SDK type not extracted',
      '  - entries[1] (TrendyolBrandListResponse → GET /integration/product/brands nowhere[]): pointer "nowhere[]" leads nowhere in the documented response',
      '  - entries[2] (TrendyolBrandListResponse → GET /integration/product/brands (root)): SDK type not extracted',
    ]);
  });
});
