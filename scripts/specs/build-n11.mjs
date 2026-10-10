#!/usr/bin/env node
/**
 * Builds `specs/n11/*.json` (+ `manifest.json`) from
 *
 *   1. the hand-compiled definitions in `scripts/specs/n11/source.mjs`
 *      (n11 publishes no machine-readable REST definition), and
 *   2. the committed contract-probe baseline `probe-snapshots/n11.json`.
 *
 * Usage:
 *   node scripts/specs/build-n11.mjs [--out specs/n11]
 *        [--probe probe-snapshots/n11.json | --no-probe] [--check]
 *
 * The build reads no network and no capture file: the documents are taken from
 * `source.mjs` as written. It only
 *   - adds `info.x-lonca-source` (portal section, compile date, generator),
 *   - adds response properties seen in production (probe snapshot `wire` shapes)
 *     but missing from the compiled schema, marked `x-lonca-observed: true`,
 *   - marks documented properties with `x-lonca-observed-types` when the observed
 *     JSON types are not accepted by the documented type, or when the docs give
 *     no type at all and production sent a non-null value,
 *   - sorts paths, methods, tags and component names, and validates `$ref`s,
 *     path parameters, responses and `x-lonca-doc-url`.
 *
 * `--check` regenerates in memory and exits non-zero when any tracked file differs.
 *
 * Plain Node >= 22, no dependencies.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { COMPILED_AT, DOCUMENTS, PROBE_OBSERVATIONS } from './n11/source.mjs';

const GENERATOR = 'scripts/specs/build-n11.mjs';
const SOURCE = 'scripts/specs/n11/source.mjs';
const PORTAL = 'https://developer.n11.com/documentation/';
const METHOD_ORDER = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { out: 'specs/n11', probe: 'probe-snapshots/n11.json', check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--probe') args.probe = argv[++i];
    else if (a === '--no-probe') args.probe = undefined;
    else if (a === '--check') args.check = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'usage: node scripts/specs/build-n11.mjs [--out DIR] [--probe FILE | --no-probe] [--check]',
      );
      process.exit(0);
    } else throw new Error(`unexpected argument: ${a}`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clone = (v) => structuredClone(v);
const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function sortKeys(obj) {
  return Object.fromEntries(
    Object.keys(obj)
      .sort(byCodepoint)
      .map((k) => [k, obj[k]]),
  );
}

function collectRefs(value, into = new Set()) {
  if (Array.isArray(value)) for (const v of value) collectRefs(v, into);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '$ref' && typeof v === 'string') into.add(v);
      else collectRefs(v, into);
    }
  }
  return into;
}

function operations(doc) {
  const out = [];
  for (const [path, item] of Object.entries(doc.paths))
    for (const m of METHOD_ORDER) if (item[m]) out.push({ path, method: m, op: item[m] });
  return out;
}

function resolveRef(doc, schema) {
  let s = schema;
  for (let guard = 0; s && s.$ref && guard < 20; guard++) {
    const m = s.$ref.match(/^#\/components\/(\w+)\/(.+)$/);
    s = m ? doc.components?.[m[1]]?.[m[2]] : undefined;
  }
  return s;
}

/** `/cdn/category/{categoryId}/attribute` and `/cdn/category/{}/attribute` -> same key. */
const pathKey = (path) => path.replace(/\{[^}]*\}/g, '{}').toLowerCase();

// ---------------------------------------------------------------------------
// Observations from the contract-probe wire baseline
// ---------------------------------------------------------------------------

/** JSON-shape types (probe) -> whether an OpenAPI `type` accepts them. */
function typeAccepts(specType, jsonType) {
  if (jsonType === 'number') return specType === 'number' || specType === 'integer';
  return specType === jsonType;
}

/** Probe shape -> OpenAPI schema for a property the docs do not describe. */
function schemaFromShape(shape) {
  const nonNull = shape.types.filter((t) => t !== 'null');
  const nullable = shape.types.includes('null');
  let schema;
  if (nonNull.length === 0) {
    schema = { description: 'Yalnızca null değeriyle gözlemlendi; tipi bilinmiyor.' };
  } else if (nonNull.length > 1) {
    schema = { description: `Gözlemlenen JSON tipleri: ${nonNull.join(', ')}.` };
  } else if (nonNull[0] === 'object') {
    schema = { type: 'object' };
    if (shape.keys && Object.keys(shape.keys).length) {
      schema.properties = {};
      for (const [k, v] of Object.entries(shape.keys)) schema.properties[k] = schemaFromShape(v);
    }
  } else if (nonNull[0] === 'array') {
    schema = { type: 'array', items: shape.items ? schemaFromShape(shape.items) : {} };
  } else {
    schema = { type: nonNull[0] };
  }
  // OpenAPI 3.0 only allows `nullable` next to a `type`.
  if (nullable && schema.type) schema.nullable = true;
  return schema;
}

/**
 * Walk a probe shape and a spec schema side by side. Missing properties are
 * added (marked `x-lonca-observed`); documented properties whose observed JSON
 * types the documented type does not accept, or that the docs leave untyped
 * while production sent a non-null value, get `x-lonca-observed-types`.
 */
function applyShape(doc, shape, schema, where, stats, visiting = new Set()) {
  const target = resolveRef(doc, schema);
  if (!target || !shape || visiting.has(target)) return;
  visiting.add(target);
  try {
    if (shape.keys && (target.type === 'object' || target.properties)) {
      target.properties ??= {};
      for (const [key, sub] of Object.entries(shape.keys)) {
        const prop = target.properties[key];
        if (prop === undefined) {
          target.properties[key] = { ...schemaFromShape(sub), 'x-lonca-observed': true };
          stats.properties.push(`${where}.${key}`);
          continue;
        }
        const resolved = resolveRef(doc, prop);
        if (!prop.$ref && resolved?.type) {
          const bad = sub.types.filter((t) =>
            t === 'null' ? !resolved.nullable : !typeAccepts(resolved.type, t),
          );
          if (bad.length) {
            prop['x-lonca-observed-types'] = sub.types;
            stats.typeMismatches.push(`${where}.${key}`);
          }
        } else if (!prop.$ref && resolved && !resolved.properties && !resolved.items) {
          if (sub.types.some((t) => t !== 'null')) {
            prop['x-lonca-observed-types'] = sub.types;
            stats.untypedObserved.push(`${where}.${key}`);
          }
        }
        applyShape(doc, sub, prop, `${where}.${key}`, stats, visiting);
      }
    }
    if (shape.items && (target.type === 'array' || target.items)) {
      if (!target.items) target.items = {};
      applyShape(doc, shape.items, target.items, `${where}[]`, stats, visiting);
    }
  } finally {
    visiting.delete(target);
  }
}

const emptyStats = () => ({ properties: [], typeMismatches: [], untypedObserved: [] });

function applyObservations(docs, snapshot) {
  const statsByFile = new Map();
  for (const entry of PROBE_OBSERVATIONS) {
    const probe = snapshot.probes?.[entry.probe];
    if (!probe || probe.status !== 'ok') {
      console.warn(`skip observation ${entry.probe}: no successful probe in the snapshot`);
      continue;
    }
    const doc = docs.get(entry.file);
    if (!doc) throw new Error(`observation ${entry.probe}: unknown file ${entry.file}`);
    const [method, path] = entry.operation.split(' ');
    const op = doc.paths[path]?.[method];
    if (!op) throw new Error(`observation ${entry.probe}: ${entry.operation} not in ${entry.file}`);
    // The JSON exchange of this probe; its recorded path (spec template or
    // `{}`-redacted) must be the operation's path.
    const exchange = (probe.wire ?? []).find(
      (x) => x.body === 'json' && x.shape && x.operation?.method === method.toUpperCase(),
    );
    if (!exchange) {
      console.warn(`skip observation ${entry.probe}: no JSON wire exchange in the snapshot`);
      continue;
    }
    if (pathKey(exchange.operation.path) !== pathKey(path))
      throw new Error(
        `observation ${entry.probe}: wire path ${exchange.operation.path} is not ${path}`,
      );
    const schema = op.responses?.['200']?.content?.['application/json']?.schema;
    if (!schema) throw new Error(`observation ${entry.probe}: ${entry.operation} has no 200 JSON`);
    const stats = statsByFile.get(entry.file) ?? emptyStats();
    applyShape(doc, exchange.shape, schema, entry.operation, stats);
    statsByFile.set(entry.file, stats);
  }
  return statsByFile;
}

// ---------------------------------------------------------------------------
// Normalise + validate
// ---------------------------------------------------------------------------

function finalize(file, doc) {
  const ordered = {};
  for (const p of Object.keys(doc.paths).sort(byCodepoint)) {
    ordered[p] = {};
    for (const m of METHOD_ORDER) if (doc.paths[p][m]) ordered[p][m] = doc.paths[p][m];
  }
  doc.paths = ordered;
  if (doc.tags) doc.tags = [...doc.tags].sort((a, b) => byCodepoint(a.name, b.name));
  if (doc.components) {
    for (const kind of Object.keys(doc.components))
      doc.components[kind] = sortKeys(doc.components[kind]);
    doc.components = sortKeys(doc.components);
  }

  // Every local $ref must resolve; external refs are not allowed.
  const dangling = [...collectRefs(doc)].filter((ref) => {
    const m = ref.match(/^#\/components\/(\w+)\/(.+)$/);
    return !m || doc.components?.[m[1]]?.[m[2]] === undefined;
  });
  if (dangling.length) throw new Error(`${file}: unresolved $ref(s): ${dangling.join(', ')}`);

  // Every schema must be referenced (a leftover is usually a typo in source.mjs).
  const refs = collectRefs(doc);
  for (const name of Object.keys(doc.components?.schemas ?? {}))
    if (!refs.has(`#/components/schemas/${name}`))
      throw new Error(`${file}: components.schemas.${name} is never referenced`);

  const operationIds = new Set();
  for (const { path, method, op } of operations(doc)) {
    const declared = new Set(
      (op.parameters ?? [])
        .map((p) => resolveRef(doc, p))
        .filter((p) => p?.in === 'path')
        .map((p) => p.name),
    );
    for (const [, name] of path.matchAll(/\{([^}]+)\}/g))
      if (!declared.has(name))
        throw new Error(`${file}: ${method} ${path} does not declare path parameter {${name}}`);
    if (!op.responses || !Object.keys(op.responses).length)
      throw new Error(`${file}: ${method} ${path} has no responses`);
    if (!/^https:\/\/developer\.n11\.com\/documentation\//.test(op['x-lonca-doc-url'] ?? ''))
      throw new Error(`${file}: ${method} ${path} has no x-lonca-doc-url`);
    if (!op.operationId || operationIds.has(op.operationId))
      throw new Error(`${file}: ${method} ${path} has a missing or duplicate operationId`);
    operationIds.add(op.operationId);
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out);

  // 1. One document per portal section.
  const docs = new Map(); // file -> doc
  const meta = new Map(); // file -> manifest fields
  for (const entry of DOCUMENTS) {
    if (docs.has(entry.file)) throw new Error(`${entry.file}: produced twice`);
    const doc = clone(entry.document);
    doc.info['x-lonca-source'] = {
      kind: 'hand-compiled',
      portal: PORTAL,
      section: entry.section,
      sectionUrl: entry.sectionUrl,
      compiledAt: COMPILED_AT,
      compiledFrom: SOURCE,
      generator: GENERATOR,
    };
    docs.set(entry.file, doc);
    meta.set(entry.file, { section: entry.section, sectionUrl: entry.sectionUrl });
  }

  // 2. Lonca additions from the production wire baseline.
  let observation = new Map();
  let snapshotEnv;
  if (args.probe) {
    const snapshot = JSON.parse(readFileSync(resolve(args.probe), 'utf8'));
    snapshotEnv = snapshot.env;
    observation = applyObservations(docs, snapshot);
    for (const [file, stats] of observation) {
      if (!Object.values(stats).some((list) => list.length)) continue;
      docs.get(file).info['x-lonca-observed-source'] = {
        snapshot: args.probe.replace(/\\/g, '/'),
        env: snapshotEnv,
        note:
          'Properties marked x-lonca-observed were seen in production responses but are not on ' +
          'the documentation page. x-lonca-observed-types lists the JSON types seen where they ' +
          'disagree with the documented type, or where the page gives no type at all.',
      };
    }
  }

  // 3. Serialise.
  const outputs = new Map();
  const manifest = {
    marketplace: 'n11',
    portal: PORTAL,
    compiledAt: COMPILED_AT,
    generator: GENERATOR,
    source: SOURCE,
    probeSnapshot: args.probe ? { file: args.probe.replace(/\\/g, '/'), env: snapshotEnv } : null,
    files: [],
  };
  for (const file of [...docs.keys()].sort(byCodepoint)) {
    const doc = finalize(file, docs.get(file));
    outputs.set(file, JSON.stringify(doc, null, 2) + '\n');
    const stats = observation.get(file) ?? emptyStats();
    manifest.files.push({
      file,
      ...meta.get(file),
      title: doc.info.title,
      servers: (doc.servers ?? []).map((s) => s.url),
      paths: Object.keys(doc.paths).length,
      operations: operations(doc).length,
      schemas: Object.keys(doc.components?.schemas ?? {}).length,
      observed: {
        properties: stats.properties.length,
        typeMismatches: stats.typeMismatches.length,
        untypedObserved: stats.untypedObserved.length,
      },
    });
  }
  outputs.set('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

  if (args.check) {
    let drift = 0;
    for (const [file, text] of outputs) {
      const target = join(outDir, file);
      const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (current !== text) {
        drift++;
        console.error(`DRIFT ${file}${current === null ? ' (missing)' : ''}`);
      }
    }
    if (drift) {
      console.error(
        `${drift} file(s) differ from scripts/specs/n11/source.mjs + the probe snapshot; ` +
          'run `pnpm specs:n11:build`',
      );
      process.exit(1);
    }
    console.log(`ok: ${outputs.size} files match the source`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  for (const [file, text] of outputs) writeFileSync(join(outDir, file), text);
  for (const f of manifest.files) {
    console.log(
      `${f.file.padEnd(14)} ${String(f.operations).padStart(3)} ops  ${String(f.paths).padStart(3)} paths  ` +
        `${String(f.schemas).padStart(3)} schemas  observed ${f.observed.properties}, ` +
        `${f.observed.typeMismatches} type mismatches, ${f.observed.untypedObserved} untyped`,
    );
    const stats = observation.get(f.file);
    if (stats)
      for (const [kind, list] of Object.entries(stats))
        for (const where of list) console.log(`  ${kind}: ${where}`);
  }
  console.log(`wrote ${outputs.size} files to ${outDir} (compiledAt=${COMPILED_AT})`);
}

main();
