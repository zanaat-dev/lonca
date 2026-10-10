import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadSdkTypeMap,
  parsePath,
  parseSdkTypeMap,
  SDK_TYPE_MAP_FILE,
  SdkTypeMapError,
  type SdkTypeMapEntry,
} from './types-map.js';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const entry = (over: Partial<SdkTypeMapEntry> = {}): SdkTypeMapEntry => ({
  marketplace: 'shop',
  sdkType: 'WireItem',
  source: 'sdks/shop/src/resources/items.ts',
  spec: 'shop/items.json',
  operation: 'GET /items/{id}',
  pointer: 'content[]',
  ...over,
});

function problems(value: unknown): string {
  try {
    parseSdkTypeMap(value, 'map.json');
  } catch (err) {
    expect(err).toBeInstanceOf(SdkTypeMapError);
    return (err as Error).message;
  }
  throw new Error('expected parseSdkTypeMap to throw');
}

describe('parsePath', () => {
  it('splits pointers into name / array steps', () => {
    expect(parsePath('(root)')).toEqual([]);
    expect(parsePath('[]')).toEqual([{ arrays: 1 }]);
    expect(parsePath('content[].lines[]')).toEqual([
      { name: 'content', arrays: 1 },
      { name: 'lines', arrays: 1 },
    ]);
    expect(parsePath('[].raw')).toEqual([{ arrays: 1 }, { name: 'raw', arrays: 0 }]);
    expect(parsePath('data.items[][]')).toEqual([
      { name: 'data', arrays: 0 },
      { name: 'items', arrays: 2 },
    ]);
    expect(parsePath('3pByTrendyol')).toEqual([{ name: '3pByTrendyol', arrays: 0 }]);
  });

  it('rejects malformed paths', () => {
    for (const bad of ['', 'a..b', 'a.[]', 'a[', 'a[x]', 'a b', '.a', '[]x']) {
      expect(parsePath(bad), bad).toBeUndefined();
    }
  });
});

describe('parseSdkTypeMap', () => {
  it('returns the entries of a valid map, keeping only known keys', () => {
    const full = entry({
      pointer: '(root)',
      ignore: ['raw', 'lines[].raw'],
      coerced: ['id'],
      note: 'why',
    });
    expect(parseSdkTypeMap({ $comment: 'x', entries: [entry(), full] }, 'm')).toEqual([
      entry(),
      full,
    ]);
  });

  it('rejects a document without an entries array', () => {
    expect(problems([])).toBe('map.json: expected an object with an "entries" array');
    expect(problems({ entries: {} })).toContain('"entries" array');
  });

  it('lists every problem with its location', () => {
    const message = problems({
      extra: 1,
      entries: [
        'nope',
        { ...entry(), bogus: true },
        { ...entry(), sdkType: '' },
        entry({ sdkType: 'not-an-id' }),
        entry({ source: '/abs/x.ts' }),
        entry({ source: 'sdks/../x.ts' }),
        entry({ source: 'sdks/x.js' }),
        entry({ spec: 'other/items.json' }),
        entry({ operation: 'FETCH /items' }),
        entry({ pointer: 'a..b' }),
        { ...entry(), ignore: [] },
        { ...entry(), coerced: 'id' },
        { ...entry(), ignore: ['(root)', 3, 'raw', 'raw'] },
        { ...entry(), note: ' ' },
        entry(),
        entry(),
      ],
    });
    expect(message.split('\n')).toEqual([
      'map.json: invalid SDK type map',
      '  - unknown top-level key "extra"',
      '  - entries[0]: expected an object',
      '  - entries[1]: unknown key "bogus"',
      '  - entries[2].sdkType: required, must be a non-empty string',
      '  - entries[3].sdkType: "not-an-id" is not an identifier',
      '  - entries[4].source: "/abs/x.ts" must be a relative .ts path inside the repo',
      '  - entries[5].source: "sdks/../x.ts" must be a relative .ts path inside the repo',
      '  - entries[6].source: "sdks/x.js" must be a relative .ts path inside the repo',
      '  - entries[7].spec: "other/items.json" must be "shop/<file>.json"',
      '  - entries[8].operation: "FETCH /items" must look like "GET /path/{param}"',
      '  - entries[9].pointer: "a..b" is not "(root)" or a path like "content[].lines[]"',
      '  - entries[10].ignore: must be a non-empty array of property paths',
      '  - entries[11].coerced: must be a non-empty array of property paths',
      '  - entries[12].ignore[0]: not a property path like "raw" or "lines[].raw"',
      '  - entries[12].ignore[1]: not a property path like "raw" or "lines[].raw"',
      '  - entries[12].ignore: duplicate paths',
      '  - entries[13].note: must be a non-empty string',
      '  - entries[15]: duplicate of entries[14] (same type, operation and pointer)',
    ]);
  });
});

describe('loadSdkTypeMap', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'drift-types-map-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads and validates a file', () => {
    const file = join(dir, 'map.json');
    writeFileSync(file, JSON.stringify({ entries: [entry()] }));
    expect(loadSdkTypeMap(file)).toEqual([entry()]);
  });

  it('fails on a missing file or invalid JSON', () => {
    expect(() => loadSdkTypeMap(join(dir, 'none.json'))).toThrow(/file not found/);
    const file = join(dir, 'bad.json');
    writeFileSync(file, '{ entries: ');
    expect(() => loadSdkTypeMap(file)).toThrow(/not valid JSON/);
  });

  it('accepts the committed map', () => {
    const entries = loadSdkTypeMap(join(REPO, SDK_TYPE_MAP_FILE));
    expect(entries.length).toBeGreaterThan(20);
    expect(new Set(entries.map((e) => e.marketplace))).toEqual(
      new Set(['hepsiburada', 'n11', 'trendyol']),
    );
  });
});
