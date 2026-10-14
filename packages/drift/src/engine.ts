/**
 * Drift engine: compare an observed wire {@link Shape} with the documented
 * response schema of one operation and produce {@link Finding}s.
 *
 * Pure functions, no I/O. Schema semantics, deliberately lenient so that a
 * finding means "the wire and the definition really disagree":
 *
 * - `$ref` — local JSON pointers only; an unresolvable or external reference
 *   makes that node unconstrained (and is reported as `uncomparable`).
 * - `allOf` — merged: union of properties and of `required`, intersection of
 *   the declared types (`null` allowed when any part allows it).
 * - `oneOf` / `anyOf` — union of the alternatives: a key or type is fine when
 *   any alternative allows it; a key is required only when every alternative
 *   requires it.
 * - `nullable: true` and `type: [..., "null"]` both allow `null`; `integer`
 *   is the JSON type `number`. A node without `type` accepts any type.
 * - When the only disallowed observed type is `null`, the finding is
 *   `undocumented-null` (warning: the spec most likely omits `nullable`);
 *   any other disallowed type keeps it a breaking `type-mismatch`.
 * - `additionalProperties: true` or a schema allows keys not listed in
 *   `properties` (a schema is compared against the extra keys); `false` or
 *   absent means `properties` is the documented key set.
 * - An object node that declares no properties at all (and no
 *   `additionalProperties`) documents nothing to compare: `uncomparable`.
 * - Below a `depthCapped` marker nothing is compared; with `droppedKeys`, the
 *   missing / not-observed checks for that object are skipped.
 */
import { resolveRef, type OpenApiDocument, type SchemaObject } from './openapi.js';
import { describe, type JsonType, type Shape } from './shape.js';

export type FindingKind =
  | 'undocumented-field'
  | 'missing-required'
  | 'type-mismatch'
  | 'undocumented-null'
  | 'known'
  | 'accepted'
  | 'not-observed'
  | 'unmatched-operation'
  | 'uncomparable'
  // SDK TypeScript types vs spec (`pnpm drift:types`, src/types-*.ts)
  | 'sdk-type-mismatch'
  | 'sdk-unknown-field'
  | 'sdk-missing-field'
  // What an SDK sends vs the documented request (`pnpm drift:requests`, src/requests.ts)
  | 'request-content-type'
  | 'request-body-missing'
  | 'request-body-unexpected'
  | 'request-param-missing'
  | 'request-param-undocumented';

export type Severity = 'breaking' | 'additive' | 'warning' | 'info';

/** Severity order, most severe first. */
export const SEVERITIES: readonly Severity[] = ['breaking', 'additive', 'warning', 'info'];

export const DEFAULT_SEVERITY: Record<FindingKind, Severity> = {
  'missing-required': 'breaking',
  'type-mismatch': 'breaking',
  'undocumented-field': 'additive',
  'undocumented-null': 'warning',
  'unmatched-operation': 'warning',
  known: 'info',
  accepted: 'info',
  'not-observed': 'info',
  uncomparable: 'info',
  // A partial overlap (`number | string` where `integer` is documented) is downgraded to info,
  // and an SDK field the wire baseline has is info too — see `compareSdkType`.
  'sdk-type-mismatch': 'warning',
  'sdk-unknown-field': 'warning',
  'sdk-missing-field': 'info',
  'request-content-type': 'breaking',
  'request-body-missing': 'breaking',
  'request-body-unexpected': 'warning',
  'request-param-missing': 'breaking',
  'request-param-undocumented': 'warning',
};

export interface Finding {
  kind: FindingKind;
  severity: Severity;
  /** Location in the response body, e.g. `content[].shipmentNumber`; `''` is the body itself. */
  path: string;
  message: string;
  /** JSON types seen on the wire at `path` (type findings). */
  observed?: JsonType[];
  /** JSON types the schema allows at `path` (type findings). */
  documented?: JsonType[];
  /** `not-observed`: the documented optional property names that were never seen under `path`. */
  fields?: string[];
  /** `accepted`: the original finding kind a known-discrepancy overlay entry accepted. */
  accepts?: FindingKind;
  /** `accepted`: why the discrepancy is accepted (the overlay entry's `reason`). */
  reason?: string;
  /** `accepted`: when the overlay entry was added (`YYYY-MM-DD`). */
  since?: string;
  /** `sdk-*`: the SDK property behind the finding, e.g. `TrendyolShipmentPackageNode.lines[].lineId`. */
  sdkPath?: string;
  /** `sdk-type-mismatch`: the JSON types the SDK declares at `path` (`any` = unconstrained). */
  sdk?: string[];
  /** `sdk-*`: JSON types the prod wire baseline observed at `path`; `[]` = not in the baseline. */
  wire?: JsonType[];
}

/** Display form of a finding path: `(root)` for the body itself. */
export function displayPath(path: string): string {
  return path === '' ? '(root)' : path;
}

export function finding(
  kind: FindingKind,
  path: string,
  message: string,
  extra: Partial<Omit<Finding, 'kind' | 'severity' | 'path' | 'message'>> = {},
): Finding {
  return { kind, severity: DEFAULT_SEVERITY[kind], path, message, ...extra };
}

// ─── Schema normalisation ──────────────────────────────────────────────────

/** A schema node flattened over `$ref` / `allOf` / `oneOf` / `anyOf`. */
export interface NormalizedSchema {
  /** Allowed JSON types; `undefined` = unconstrained. */
  types: Set<JsonType> | undefined;
  /** Property name → every schema that documents it (unioned when descending). */
  props: Map<string, SchemaObject[]>;
  required: Set<string>;
  /** `true` = any extra key, array = schemas for extra keys, `undefined` = no extra keys documented. */
  additional: true | SchemaObject[] | undefined;
  items: SchemaObject[];
  /** `x-lonca-observed-types` on this node. */
  observedTypes: Set<JsonType>;
  /** `x-lonca-observed: true` on this node. */
  observed: boolean;
  /** `$ref`s that could not be resolved locally. */
  unresolved: string[];
}

type Norm = NormalizedSchema;

interface Ctx {
  document: OpenApiDocument;
  out: Finding[];
}

function emptyNorm(): Norm {
  return {
    types: undefined,
    props: new Map(),
    required: new Set(),
    additional: undefined,
    items: [],
    observedTypes: new Set(),
    observed: false,
    unresolved: [],
  };
}

function toJsonType(t: unknown): JsonType | undefined {
  switch (t) {
    case 'integer':
    case 'number':
      return 'number';
    case 'string':
    case 'boolean':
    case 'null':
    case 'array':
    case 'object':
      return t;
    default:
      return undefined;
  }
}

function normalizeOne(
  schema: SchemaObject | undefined,
  ctx: Pick<Ctx, 'document'>,
  seen: ReadonlySet<string>,
): Norm {
  if (!schema || typeof schema !== 'object') return emptyNorm();
  if (typeof schema.$ref === 'string') {
    const ref = schema.$ref;
    if (seen.has(ref)) return emptyNorm(); // cycle through allOf/oneOf — stop, unconstrained
    const target = resolveRef<SchemaObject>(ctx.document, ref);
    if (!target) return { ...emptyNorm(), unresolved: [ref] };
    const resolved = normalizeOne(target, ctx, new Set([...seen, ref]));
    // OpenAPI 3.0 ignores `$ref` siblings, except Lonca's own annotations.
    return intersect([resolved, annotationsOf(schema)]);
  }

  const own = annotationsOf(schema);
  if (schema.type !== undefined) {
    const declared = Array.isArray(schema.type) ? schema.type : [schema.type];
    own.types = new Set(declared.map(toJsonType).filter((t): t is JsonType => t !== undefined));
    if (schema.nullable === true) own.types.add('null');
  }
  for (const [name, prop] of Object.entries(schema.properties ?? {})) own.props.set(name, [prop]);
  for (const name of schema.required ?? []) own.required.add(name);
  if (schema.additionalProperties === true) own.additional = true;
  else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    own.additional = [schema.additionalProperties];
  }
  if (schema.items && typeof schema.items === 'object') own.items = [schema.items];

  const parts = [own];
  for (const part of schema.allOf ?? []) parts.push(normalizeOne(part, ctx, seen));
  const alternatives = [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])];
  if (alternatives.length) parts.push(union(alternatives.map((a) => normalizeOne(a, ctx, seen))));
  return intersect(parts);
}

function annotationsOf(schema: SchemaObject): Norm {
  const n = emptyNorm();
  n.observed = schema['x-lonca-observed'] === true;
  for (const t of schema['x-lonca-observed-types'] ?? []) {
    const j = toJsonType(t);
    if (j) n.observedTypes.add(j);
  }
  return n;
}

/** `allOf`-style merge. */
function intersect(parts: Norm[]): Norm {
  const out = emptyNorm();
  const constrained = parts.filter((p) => p.types !== undefined);
  if (constrained.length) {
    const [first, ...rest] = constrained.map((p) => p.types!);
    const types = new Set([...first!].filter((t) => rest.every((s) => s.has(t))));
    if (constrained.some((p) => p.types!.has('null'))) types.add('null');
    out.types = types;
  }
  mergeShared(out, parts);
  for (const p of parts) for (const r of p.required) out.required.add(r);
  return out;
}

/** `oneOf` / `anyOf`-style union. */
function union(alternatives: Norm[]): Norm {
  const out = emptyNorm();
  if (alternatives.every((a) => a.types !== undefined)) {
    out.types = new Set(alternatives.flatMap((a) => [...a.types!]));
  }
  mergeShared(out, alternatives);
  const [first, ...rest] = alternatives;
  for (const r of first?.required ?? [])
    if (rest.every((a) => a.required.has(r))) out.required.add(r);
  return out;
}

/** Properties, extra keys, items and annotations combine the same way under both merges. */
function mergeShared(out: Norm, parts: Norm[]): void {
  for (const p of parts) {
    for (const [name, schemas] of p.props)
      out.props.set(name, [...(out.props.get(name) ?? []), ...schemas]);
    if (p.additional === true) out.additional = true;
    else if (p.additional && out.additional !== true) {
      out.additional = [...(out.additional ?? []), ...p.additional];
    }
    out.items.push(...p.items);
    for (const t of p.observedTypes) out.observedTypes.add(t);
    out.observed ||= p.observed;
    out.unresolved.push(...p.unresolved);
  }
}

function normalizeUnion(schemas: SchemaObject[], ctx: Pick<Ctx, 'document'>): Norm {
  const norms = schemas.map((s) => normalizeOne(s, ctx, new Set()));
  return norms.length === 1 ? norms[0]! : union(norms);
}

/**
 * Flatten one schema position — every schema documenting it, unioned like
 * `oneOf` — over `$ref` / `allOf` / `oneOf` / `anyOf` with the same rules the
 * wire comparison uses. Shared with the SDK-type comparison (`types-compare.ts`).
 */
export function normalizeSchema(
  schemas: SchemaObject | readonly SchemaObject[],
  document: OpenApiDocument,
): NormalizedSchema {
  return normalizeUnion(Array.isArray(schemas) ? [...schemas] : [schemas as SchemaObject], {
    document,
  });
}

// ─── Comparison ────────────────────────────────────────────────────────────

export interface CompareInput {
  /** The documented response schema (e.g. `responses.200.content['application/json'].schema`). */
  schema: SchemaObject;
  /** The observed wire shape of the parsed body. */
  shape: Shape;
  /** The document the schema belongs to, for `$ref` resolution. */
  document: OpenApiDocument;
}

/** Compare one observed body shape with its documented schema. Findings are sorted by path, then kind. */
export function compareResponse({ schema, shape, document }: CompareInput): Finding[] {
  const ctx: Ctx = { document, out: [] };
  compare(normalizeOne(schema, ctx, new Set()), shape, '', ctx);
  return ctx.out.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function compare(norm: Norm, shape: Shape, path: string, ctx: Ctx): void {
  for (const ref of norm.unresolved) {
    ctx.out.push(
      finding('uncomparable', path, `schema reference ${ref} cannot be resolved locally`),
    );
  }

  const allowed = norm.types;
  if (allowed) {
    const bad = shape.types.filter((t) => !allowed.has(t));
    const explained = bad.filter((t) => norm.observedTypes.has(t));
    const unexplained = bad.filter((t) => !norm.observedTypes.has(t));
    const documented = [...allowed].sort();
    if (explained.length) {
      ctx.out.push(
        finding(
          'known',
          path,
          `observed ${explained.join('|')} where ${documented.join('|') || 'nothing'} is documented — already recorded as x-lonca-observed-types`,
          { observed: explained, documented },
        ),
      );
    }
    if (unexplained.length) {
      // `null` alone where a non-nullable type is documented almost always means the upstream
      // spec forgot `nullable` — a warning, not a contract break. Any other disallowed type
      // (alone or next to `null`) still contradicts the definition.
      const onlyNull = unexplained.every((t) => t === 'null');
      ctx.out.push(
        finding(
          onlyNull ? 'undocumented-null' : 'type-mismatch',
          path,
          `observed ${unexplained.join('|')} where ${documented.join('|') || 'nothing'} is documented${onlyNull ? ' (not nullable)' : ''}`,
          { observed: unexplained, documented },
        ),
      );
    }
  }

  if (shape.types.includes('object') && (!allowed || allowed.has('object'))) {
    compareObject(norm, shape, path, ctx);
  }
  if (shape.types.includes('array') && (!allowed || allowed.has('array'))) {
    compareArray(norm, shape, path, ctx);
  }
}

function compareObject(norm: Norm, shape: Shape, path: string, ctx: Ctx): void {
  const documentsKeys = norm.props.size > 0 || norm.required.size > 0;
  if (shape.depthCapped) {
    if (documentsKeys) {
      ctx.out.push(
        finding(
          'uncomparable',
          path,
          'snapshot depth cap reached; nested fields were not described',
        ),
      );
    }
    return;
  }
  const keys = shape.keys ?? {};
  const observedNames = Object.keys(keys);
  if (norm.props.size === 0 && norm.additional === undefined) {
    if (observedNames.length) {
      ctx.out.push(
        finding(
          'uncomparable',
          path,
          `schema declares no properties for this object (${observedNames.length} observed key(s) not compared)`,
        ),
      );
    }
    return;
  }

  for (const name of observedNames) {
    const child = keys[name]!;
    const childPath = join(path, name);
    const documented = norm.props.get(name);
    if (documented) {
      const childNorm = normalizeUnion(documented, ctx);
      if (childNorm.observed) {
        ctx.out.push(
          finding(
            'known',
            childPath,
            'not in the upstream definition; already recorded as x-lonca-observed',
          ),
        );
      }
      compare(childNorm, child, childPath, ctx);
    } else if (norm.additional === true) {
      // explicitly free-form keys
    } else if (norm.additional) {
      compare(normalizeUnion(norm.additional, ctx), child, childPath, ctx);
    } else {
      ctx.out.push(
        finding('undocumented-field', childPath, `observed ${describe(child)}, not in the schema`, {
          observed: child.types,
        }),
      );
    }
  }

  if (shape.droppedKeys) {
    ctx.out.push(
      finding(
        'uncomparable',
        path,
        `snapshot key cap reached (${shape.droppedKeys} key(s) not described); missing / not-observed checks skipped`,
      ),
    );
    return;
  }
  for (const name of [...norm.required].sort()) {
    if (!(name in keys)) {
      ctx.out.push(
        finding('missing-required', join(path, name), 'documented as required but never observed'),
      );
    }
  }
  const notSeen = [...norm.props.keys()]
    .filter((k) => !(k in keys) && !norm.required.has(k))
    .sort();
  if (notSeen.length) {
    ctx.out.push(
      finding(
        'not-observed',
        path,
        `${notSeen.length} optional documented propert${notSeen.length === 1 ? 'y' : 'ies'} not observed`,
        { fields: notSeen },
      ),
    );
  }
}

function compareArray(norm: Norm, shape: Shape, path: string, ctx: Ctx): void {
  const itemPath = `${path}[]`;
  if (shape.depthCapped) {
    if (norm.items.length) {
      ctx.out.push(
        finding(
          'uncomparable',
          itemPath,
          'snapshot depth cap reached; array elements were not described',
        ),
      );
    }
    return;
  }
  if (!shape.items) {
    if (norm.items.length) {
      ctx.out.push(
        finding('uncomparable', itemPath, 'only empty arrays observed; element shape unknown'),
      );
    }
    return;
  }
  if (!norm.items.length) {
    ctx.out.push(
      finding(
        'uncomparable',
        itemPath,
        `schema documents no element type (observed ${describe(shape.items)})`,
      ),
    );
    return;
  }
  compare(normalizeUnion(norm.items, ctx), shape.items, itemPath, ctx);
}
