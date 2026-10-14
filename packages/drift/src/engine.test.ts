import { describe, expect, it } from 'vitest';
import { compareResponse, DEFAULT_SEVERITY, displayPath, type Finding } from './engine.js';
import type { OpenApiDocument, SchemaObject } from './openapi.js';
import type { Shape } from './shape.js';

const S = (types: Shape['types'], extra: Partial<Shape> = {}): Shape => ({ types, ...extra });
const obj = (keys: Record<string, Shape>, extra: Partial<Shape> = {}): Shape => ({
  types: ['object'],
  keys,
  ...extra,
});
const arr = (items?: Shape): Shape => (items ? { types: ['array'], items } : { types: ['array'] });

const DOC: OpenApiDocument = {
  openapi: '3.0.3',
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          tag: { type: 'string', nullable: true },
        },
      },
      Named: { type: 'object', properties: { label: { type: 'string' } } },
      Loop: { allOf: [{ $ref: '#/components/schemas/Loop' }] },
      'a/b': { type: 'string' },
    },
  },
};

function run(schema: SchemaObject, shape: Shape, document: OpenApiDocument = DOC): Finding[] {
  return compareResponse({ schema, shape, document });
}

function kinds(findings: Finding[]): string[] {
  return findings.map((f) => `${f.kind}@${displayPath(f.path)}`);
}

describe('compareResponse — basics', () => {
  it('reports nothing when the shape matches the schema exactly', () => {
    const findings = run(
      { $ref: '#/components/schemas/Pet' },
      obj({ id: S(['number']), name: S(['string']), tag: S(['null', 'string']) }),
    );
    expect(findings).toEqual([]);
  });

  it('treats integer as the JSON number type', () => {
    expect(run({ type: 'integer' }, S(['number']))).toEqual([]);
  });

  it('flags an observed type the schema does not allow as a breaking type-mismatch', () => {
    const [f] = run(
      { type: 'object', properties: { id: { type: 'string' } } },
      obj({ id: S(['number']) }),
    );
    expect(f).toMatchObject({
      kind: 'type-mismatch',
      severity: 'breaking',
      path: 'id',
      observed: ['number'],
      documented: ['string'],
    });
  });

  it('flags null on a non-nullable property as undocumented-null, and accepts nullable / type arrays', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'string', nullable: true },
        c: { type: ['string', 'null'] },
        d: { type: 'object' },
      },
    };
    const findings = run(
      schema,
      obj({ a: S(['null']), b: S(['null']), c: S(['null', 'string']), d: S(['null', 'object']) }),
    );
    expect(kinds(findings)).toEqual(['undocumented-null@a', 'undocumented-null@d']);
    expect(findings[0]).toMatchObject({
      kind: 'undocumented-null',
      severity: 'warning',
      observed: ['null'],
      documented: ['string'],
      message: 'observed null where string is documented (not nullable)',
    });
  });

  it('keeps a type-mismatch when a non-null disallowed type is observed next to null', () => {
    const [f] = run(
      { type: 'object', properties: { a: { type: 'string' } } },
      obj({ a: S(['null', 'object']) }),
    );
    expect(f).toMatchObject({
      kind: 'type-mismatch',
      severity: 'breaking',
      observed: ['null', 'object'],
      documented: ['string'],
    });
  });

  it('accepts any type where the schema declares none', () => {
    expect(
      run(
        { type: 'object', properties: { x: { description: 'anything' } } },
        obj({ x: S(['boolean']) }),
      ),
    ).toEqual([]);
  });

  it('reports an undocumented field as additive with its observed shape', () => {
    const [f] = run(
      { type: 'object', properties: { a: { type: 'string' } } },
      obj({ a: S(['string']), extra: arr(S(['number'])) }),
    );
    expect(f).toMatchObject({ kind: 'undocumented-field', severity: 'additive', path: 'extra' });
    expect(f!.message).toContain('array<number>');
  });

  it('reports a required key that was never observed as breaking missing-required', () => {
    const findings = run({ $ref: '#/components/schemas/Pet' }, obj({ id: S(['number']) }));
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'missing-required', severity: 'breaking', path: 'name' }),
    );
  });

  it('collapses optional documented properties that were not observed into one info finding', () => {
    const findings = run(
      {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } },
      },
      obj({ a: S(['string']) }),
    );
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'not-observed',
        severity: 'info',
        path: '',
        fields: ['b', 'c'],
      }),
    ]);
    expect(findings[0]!.message).toBe('2 optional documented properties not observed');
  });

  it('uses the singular for one not-observed property', () => {
    const [f] = run(
      { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
      obj({ a: S(['string']) }),
    );
    expect(f!.message).toBe('1 optional documented property not observed');
  });

  it('does not descend into an object whose type already mismatched', () => {
    const findings = run({ type: 'string' }, obj({ a: S(['string']) }));
    expect(kinds(findings)).toEqual(['type-mismatch@(root)']);
  });

  it('sorts findings by path then kind', () => {
    const findings = run(
      {
        type: 'object',
        required: ['b'],
        properties: { a: { type: 'string' }, b: { type: 'string' } },
      },
      obj({ a: S(['number']), z: S(['string']) }),
    );
    expect(kinds(findings)).toEqual([
      'type-mismatch@a',
      'missing-required@b',
      'undocumented-field@z',
    ]);
  });
});

describe('compareResponse — $ref', () => {
  it('resolves local refs, including escaped pointer tokens', () => {
    expect(run({ $ref: '#/components/schemas/a~1b' }, S(['string']))).toEqual([]);
  });

  it('reports an unresolvable ref as uncomparable and treats the node as unconstrained', () => {
    const findings = run(
      { type: 'object', properties: { a: { $ref: '#/components/schemas/Nope' } } },
      obj({ a: S(['number']) }),
    );
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'uncomparable',
        path: 'a',
        message: expect.stringContaining('#/components/schemas/Nope'),
      }),
    ]);
  });

  it('does not follow external refs', () => {
    const [f] = run({ $ref: 'other.json#/X' }, S(['string']));
    expect(f).toMatchObject({ kind: 'uncomparable' });
  });

  it('stops on a reference cycle instead of recursing forever', () => {
    expect(run({ $ref: '#/components/schemas/Loop' }, S(['string']))).toEqual([]);
  });

  it('keeps x-lonca annotations placed next to a $ref', () => {
    const findings = run(
      {
        type: 'object',
        properties: {
          n: { $ref: '#/components/schemas/a~1b', 'x-lonca-observed-types': ['number'] },
        },
      },
      obj({ n: S(['number']) }),
    );
    expect(kinds(findings)).toEqual(['known@n']);
  });
});

describe('compareResponse — allOf / oneOf / anyOf', () => {
  it('merges allOf parts: properties and required are unioned', () => {
    const schema: SchemaObject = {
      allOf: [
        { $ref: '#/components/schemas/Named' },
        { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
      ],
    };
    expect(run(schema, obj({ id: S(['number']), label: S(['string']) }))).toEqual([]);
    expect(kinds(run(schema, obj({ label: S(['string']) })))).toEqual(['missing-required@id']);
    expect(
      kinds(run(schema, obj({ id: S(['number']), label: S(['string']), x: S(['string']) }))),
    ).toEqual(['undocumented-field@x']);
  });

  it('intersects allOf types but allows null when any part is nullable', () => {
    const schema: SchemaObject = {
      allOf: [{ type: 'string' }, { type: 'string', nullable: true }],
    };
    expect(run(schema, S(['null', 'string']))).toEqual([]);
    expect(kinds(run({ allOf: [{ type: 'string' }, { type: 'integer' }] }, S(['string'])))).toEqual(
      ['type-mismatch@(root)'],
    );
  });

  it('accepts a key or type allowed by any oneOf / anyOf alternative', () => {
    const schema: SchemaObject = {
      oneOf: [
        {
          type: 'object',
          required: ['a', 'common'],
          properties: { a: { type: 'string' }, common: { type: 'string' } },
        },
        {
          type: 'object',
          required: ['b', 'common'],
          properties: { b: { type: 'number' }, common: { type: 'string' } },
        },
      ],
    };
    // a key is required only when every alternative requires it
    expect(run(schema, obj({ a: S(['string']), common: S(['string']) }))).toEqual([
      expect.objectContaining({ kind: 'not-observed', fields: ['b'] }),
    ]);
    expect(kinds(run(schema, obj({ a: S(['string']) })))).toEqual([
      'not-observed@(root)',
      'missing-required@common',
    ]);
    expect(
      kinds(run({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, S(['number', 'string']))),
    ).toEqual([]);
    expect(
      kinds(run({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, S(['boolean']))),
    ).toEqual(['type-mismatch@(root)']);
  });

  it('treats a union with an untyped alternative as unconstrained', () => {
    expect(
      run({ oneOf: [{ type: 'string' }, { description: 'anything' }] }, S(['boolean'])),
    ).toEqual([]);
  });

  it('combines base properties with a oneOf on the same node', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: { kind: { type: 'string' } },
      oneOf: [{ properties: { a: { type: 'string' } } }, { properties: { b: { type: 'string' } } }],
    };
    expect(run(schema, obj({ kind: S(['string']), a: S(['string']), b: S(['string']) }))).toEqual(
      [],
    );
  });

  it('unions property schemas documented by several alternatives', () => {
    const schema: SchemaObject = {
      oneOf: [
        { type: 'object', properties: { v: { type: 'string' } } },
        { type: 'object', properties: { v: { type: 'integer' } } },
      ],
    };
    expect(run(schema, obj({ v: S(['number', 'string']) }))).toEqual([]);
  });
});

describe('compareResponse — additionalProperties', () => {
  it('allows any extra key with additionalProperties: true', () => {
    expect(
      run(
        { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: true },
        obj({ a: S(['string']), b: S(['number']) }),
      ),
    ).toEqual([]);
  });

  it('compares extra keys against an additionalProperties schema', () => {
    const schema: SchemaObject = { type: 'object', additionalProperties: { type: 'integer' } };
    expect(run(schema, obj({ x: S(['number']), y: S(['number']) }))).toEqual([]);
    expect(kinds(run(schema, obj({ x: S(['string']) })))).toEqual(['type-mismatch@x']);
  });

  it('keeps additionalProperties: true when merged with schema-valued parts', () => {
    const schema: SchemaObject = {
      allOf: [
        { type: 'object', additionalProperties: { type: 'string' } },
        { type: 'object', additionalProperties: true },
        { type: 'object', additionalProperties: { type: 'integer' } },
      ],
    };
    expect(run(schema, obj({ x: S(['boolean']) }))).toEqual([]);
  });

  it('treats additionalProperties: false like absent (properties are the documented set)', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: { a: { type: 'string' } },
      additionalProperties: false,
    };
    expect(kinds(run(schema, obj({ a: S(['string']), b: S(['string']) })))).toEqual([
      'undocumented-field@b',
    ]);
  });

  it('reports an object schema with no properties as uncomparable, not as undocumented keys', () => {
    expect(run({ type: 'object' }, obj({ a: S(['string']), b: S(['string']) }))).toEqual([
      expect.objectContaining({
        kind: 'uncomparable',
        path: '',
        message: expect.stringContaining('2 observed key(s)'),
      }),
    ]);
    expect(run({ type: 'object' }, obj({}))).toEqual([]);
  });
});

describe('compareResponse — arrays', () => {
  const list: SchemaObject = { type: 'array', items: { $ref: '#/components/schemas/Pet' } };

  it('compares array elements against items with a [] path', () => {
    const findings = run(
      list,
      arr(obj({ id: S(['string']), name: S(['string']), tag: S(['string']) })),
    );
    expect(kinds(findings)).toEqual(['type-mismatch@[].id']);
  });

  it('compares element shapes carried from the baseline like observed ones', () => {
    const schema: SchemaObject = {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' } } },
    };
    const carried: Shape = { ...arr(obj({ id: S(['number']) })), itemsFromBaseline: true };
    expect(kinds(run(schema, carried))).toEqual(['type-mismatch@[].id']);
  });

  it('reports empty arrays (no element shape) as uncomparable', () => {
    expect(run(list, arr())).toEqual([
      expect.objectContaining({
        kind: 'uncomparable',
        path: '[]',
        message: expect.stringContaining('only empty arrays'),
      }),
    ]);
  });

  it('reports an array schema without items as uncomparable when elements were observed', () => {
    expect(kinds(run({ type: 'array' }, arr(S(['string']))))).toEqual(['uncomparable@[]']);
    expect(run({ type: 'array' }, arr())).toEqual([]);
  });

  it('builds nested paths through objects and arrays', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        content: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lines: {
                type: 'array',
                items: { type: 'object', properties: { sku: { type: 'string' } } },
              },
            },
          },
        },
      },
    };
    const findings = run(
      schema,
      obj({ content: arr(obj({ lines: arr(obj({ sku: S(['number']) })) })) }),
    );
    expect(kinds(findings)).toEqual(['type-mismatch@content[].lines[].sku']);
  });

  it('checks both branches when a value was seen as object and array', () => {
    const schema: SchemaObject = {
      description: 'untyped',
      properties: { a: { type: 'string' } },
      items: { type: 'string' },
    };
    const shape: Shape = {
      types: ['array', 'object'],
      keys: { a: S(['string']) },
      items: S(['number']),
    };
    expect(kinds(run(schema, shape))).toEqual(['type-mismatch@[]']);
  });
});

describe('compareResponse — x-lonca annotations (known)', () => {
  it('explains an observed type contradiction recorded in x-lonca-observed-types', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: { shipmentNumber: { type: 'string', 'x-lonca-observed-types': ['number'] } },
    };
    const [f] = run(schema, obj({ shipmentNumber: S(['number']) }));
    expect(f).toMatchObject({
      kind: 'known',
      severity: 'info',
      path: 'shipmentNumber',
      observed: ['number'],
      documented: ['string'],
    });
  });

  it('still reports the part of a contradiction the annotation does not explain', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: { n: { type: 'string', 'x-lonca-observed-types': ['number'] } },
    };
    expect(kinds(run(schema, obj({ n: S(['boolean', 'number']) })))).toEqual([
      'known@n',
      'type-mismatch@n',
    ]);
  });

  it('reports null as known when x-lonca-observed-types allows it', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: { taxNumber: { type: 'string', 'x-lonca-observed-types': ['null'] } },
    };
    expect(kinds(run(schema, obj({ taxNumber: S(['null', 'string']) })))).toEqual([
      'known@taxNumber',
    ]);
  });

  it('reports the unexplained null next to an explained type as undocumented-null', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: { n: { type: 'string', 'x-lonca-observed-types': ['number'] } },
    };
    expect(kinds(run(schema, obj({ n: S(['null', 'number']) })))).toEqual([
      'known@n',
      'undocumented-null@n',
    ]);
  });

  it('ignores unknown names in x-lonca-observed-types', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: { n: { type: 'string', 'x-lonca-observed-types': ['bogus', 'number'] } },
    };
    expect(kinds(run(schema, obj({ n: S(['number']) })))).toEqual(['known@n']);
  });

  it('reports a property marked x-lonca-observed as known and keeps comparing below it', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        orderDate: { type: 'number', 'x-lonca-observed': true },
        histories: {
          type: 'array',
          'x-lonca-observed': true,
          items: { type: 'object', properties: { status: { type: 'string' } } },
        },
      },
    };
    const findings = run(
      schema,
      obj({
        orderDate: S(['number']),
        histories: arr(obj({ status: S(['string']), extra: S(['string']) })),
      }),
    );
    expect(kinds(findings)).toEqual([
      'known@histories',
      'undocumented-field@histories[].extra',
      'known@orderDate',
    ]);
  });
});

describe('compareResponse — snapshot caps', () => {
  const schema: SchemaObject = {
    type: 'object',
    required: ['a', 'deep'],
    properties: {
      a: { type: 'string' },
      b: { type: 'string' },
      deep: { $ref: '#/components/schemas/Pet' },
      list: { type: 'array', items: { type: 'string' } },
    },
  };

  it('does not report missing / not-observed fields below a depth cap', () => {
    const findings = run(
      schema,
      obj({
        a: S(['string']),
        deep: S(['object'], { depthCapped: true }),
        list: S(['array'], { depthCapped: true }),
      }),
    );
    expect(kinds(findings)).toEqual([
      'not-observed@(root)',
      'uncomparable@deep',
      'uncomparable@list[]',
    ]);
  });

  it('does not report a depth-capped node whose schema documents no structure', () => {
    expect(
      run(
        { type: 'object', properties: { x: { type: 'object' } } },
        obj({ x: S(['object'], { depthCapped: true }) }),
      ),
    ).toEqual([]);
    expect(
      run(
        { type: 'object', properties: { x: { type: 'array' } } },
        obj({ x: S(['array'], { depthCapped: true }) }),
      ),
    ).toEqual([]);
  });

  it('skips missing-required and not-observed when keys were dropped by the key cap', () => {
    const findings = run(schema, obj({ b: S(['string']), zz: S(['string']) }, { droppedKeys: 3 }));
    expect(kinds(findings)).toEqual(['uncomparable@(root)', 'undocumented-field@zz']);
    expect(findings[0]!.message).toContain('3 key(s)');
  });
});

describe('severity table', () => {
  it('maps every finding kind to its default severity', () => {
    expect(DEFAULT_SEVERITY).toEqual({
      'missing-required': 'breaking',
      'type-mismatch': 'breaking',
      'undocumented-field': 'additive',
      'undocumented-null': 'warning',
      'unmatched-operation': 'warning',
      known: 'info',
      accepted: 'info',
      'not-observed': 'info',
      uncomparable: 'info',
      'sdk-type-mismatch': 'warning',
      'sdk-unknown-field': 'warning',
      'sdk-missing-field': 'info',
      'request-content-type': 'breaking',
      'request-body-missing': 'breaking',
      'request-body-unexpected': 'warning',
      'request-param-missing': 'breaking',
      'request-param-undocumented': 'warning',
    });
  });
});
