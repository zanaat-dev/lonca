/**
 * Request-side drift: does what an SDK *sends* match the documented request?
 *
 * The response checks ({@link compareResponse}) only see what the marketplace
 * answers, so a write method that sends the wrong body can pass every probe
 * and still never work. On 2026-10-14 three Hepsiburada writes turned out to
 * have sent JSON where the spec documents `multipart/form-data`; each was
 * refused on SIT. This module catches that class of bug offline:
 *
 * 1. {@link createRequestRecorder} is a `fetch` that records each request and
 *    answers with a canned response, so SDK methods run without a network.
 * 2. {@link checkRequest} matches a recorded request to its spec operation and
 *    compares the media type, the JSON body (as a {@link Shape}, through the
 *    same schema engine as the response checks), multipart parts, and the
 *    required query and header parameters.
 *
 * Only names and JSON types are compared, never values.
 */
import { compareResponse, finding, type Finding } from './engine.js';
import {
  getOperation,
  resolveRef,
  type MediaTypeObject,
  type OpenApiDocument,
  type SchemaObject,
  type SpecFile,
} from './openapi.js';
import { isUnmatched, type OperationIndex, type WireOperation } from './operations.js';
import { summarize } from './shape.js';

/** How a request body was encoded. */
export type RequestBodyKind = 'none' | 'json' | 'multipart' | 'form' | 'text' | 'binary';

/** One part of a multipart body. */
export interface CapturedPart {
  name: string;
  /** `file` for a `Blob` / `File` part, `text` otherwise. */
  kind: 'file' | 'text';
}

/** One request as an SDK sent it. */
export interface CapturedRequest {
  method: string;
  url: string;
  /** Header names, lower-cased. */
  headers: string[];
  bodyKind: RequestBodyKind;
  /** Parsed body for `json`. */
  json?: unknown;
  /** Parts for `multipart`; field names for `form`. */
  parts?: CapturedPart[];
}

/** Turn `fetch` arguments into a {@link CapturedRequest}. */
export function captureRequest(
  input: string | URL | Request,
  init: RequestInit = {},
): CapturedRequest {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const headers = new Headers(
    init.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  const captured: CapturedRequest = {
    method,
    url,
    headers: [...headers.keys()].map((k) => k.toLowerCase()).sort(),
    bodyKind: 'none',
  };
  const body = init.body;
  if (body === undefined || body === null) return captured;
  if (body instanceof FormData) {
    captured.bodyKind = 'multipart';
    captured.parts = [...body.entries()].map(([name, value]) => ({
      name,
      kind: typeof value === 'string' ? 'text' : 'file',
    }));
  } else if (body instanceof URLSearchParams) {
    captured.bodyKind = 'form';
    captured.parts = [...new Set(body.keys())].map((name) => ({ name, kind: 'text' }));
  } else if (typeof body === 'string') {
    const type = headers.get('content-type') ?? '';
    if (/json/i.test(type) || (!type && /^\s*[[{]/.test(body))) {
      try {
        captured.json = JSON.parse(body);
        captured.bodyKind = 'json';
      } catch {
        captured.bodyKind = 'text';
      }
    } else {
      captured.bodyKind = 'text';
    }
  } else {
    captured.bodyKind = 'binary';
  }
  return captured;
}

export interface RequestRecorder {
  /** Drop-in `fetch`: records the request, then answers with `respond(request)`. */
  fetch: typeof fetch;
  /** The requests recorded since the previous `take()`. */
  take(): CapturedRequest[];
}

/**
 * Record every request instead of sending it. The default answer is
 * `200 {}`; pass `respond` for SDK methods that need a particular body.
 */
export function createRequestRecorder(
  respond: (request: CapturedRequest) => unknown = () => ({}),
): RequestRecorder {
  let batch: CapturedRequest[] = [];
  return {
    fetch: (input, init) => {
      const request = captureRequest(input as string | URL | Request, init);
      batch.push(request);
      return Promise.resolve(
        new Response(JSON.stringify(respond(request) ?? {}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
    take() {
      const out = batch;
      batch = [];
      return out;
    },
  };
}

interface ParameterObject {
  name: string;
  in: string;
  required?: boolean;
  $ref?: string;
}

interface RequestBodyObject {
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
  $ref?: string;
}

/** The outcome of checking one request. */
export interface RequestCheck {
  operation: WireOperation;
  findings: Finding[];
}

/**
 * Severity of the response-engine findings when they describe a request: the
 * SDK leaving out a required field or sending the wrong type is what breaks a
 * write; a field the spec does not list is worth a look; documented optional
 * fields the sample did not send are not a finding at all.
 */
const REQUEST_SEVERITY: Partial<Record<Finding['kind'], Finding['severity'] | 'drop'>> = {
  'undocumented-field': 'warning',
  'undocumented-null': 'info',
  'not-observed': 'drop',
};

/** Match `request` to its documented operation and compare it with the spec. */
export function checkRequest(
  request: CapturedRequest,
  index: OperationIndex,
  specs: readonly SpecFile[],
): RequestCheck {
  const operation = index.match(request.method, request.url);
  if (isUnmatched(operation)) {
    return {
      operation,
      findings: [finding('unmatched-operation', '', `no spec operation matches ${operation.key}`)],
    };
  }
  const spec = specs.find((s) => s.id === operation.spec)!;
  const op = getOperation(spec.document, operation.specPath, operation.method)!;
  const findings = [
    ...checkParameters(request, spec.document, op.parameters, operation.path),
    ...checkBody(request, spec.document, op.requestBody),
  ];
  return { operation, findings };
}

function checkParameters(
  request: CapturedRequest,
  document: OpenApiDocument,
  raw: unknown,
  templatePath: string,
): Finding[] {
  const out: Finding[] = [];
  const params = (Array.isArray(raw) ? raw : [])
    .map((p: ParameterObject) => (p.$ref ? resolveRef<ParameterObject>(document, p.$ref) : p))
    .filter((p): p is ParameterObject => Boolean(p?.name && p.in));
  const query = new Set(new URL(request.url).searchParams.keys());
  const headers = new Set(request.headers);
  for (const p of params) {
    if (!p.required) continue;
    if (p.in === 'query' && !query.has(p.name)) {
      out.push(
        finding(
          'request-param-missing',
          `?${p.name}`,
          `required query parameter ${p.name} is not sent`,
        ),
      );
    }
    // Hosts and proxies add some headers themselves (User-Agent, Content-Type);
    // only an explicitly required header the SDK must set is checked.
    if (
      p.in === 'header' &&
      !headers.has(p.name.toLowerCase()) &&
      !AUTOMATIC_HEADERS.has(p.name.toLowerCase())
    ) {
      out.push(
        finding(
          'request-param-missing',
          `header:${p.name}`,
          `required header ${p.name} is not sent`,
        ),
      );
    }
  }
  const documented = new Set(params.filter((p) => p.in === 'query').map((p) => p.name));
  for (const name of [...query].sort()) {
    if (!documented.has(name)) {
      out.push(
        finding(
          'request-param-undocumented',
          `?${name}`,
          `query parameter ${name} is not documented for ${templatePath}`,
        ),
      );
    }
  }
  return out;
}

/** Headers `fetch` or the runtime set on every request; a spec listing them as required is not a gap. */
const AUTOMATIC_HEADERS = new Set(['content-type', 'content-length', 'host', 'accept-encoding']);

function checkBody(request: CapturedRequest, document: OpenApiDocument, raw: unknown): Finding[] {
  let body = raw as RequestBodyObject | undefined;
  if (body?.$ref) body = resolveRef<RequestBodyObject>(document, body.$ref);
  const content = body?.content ?? {};
  const mediaTypes = Object.keys(content);
  if (mediaTypes.length === 0) {
    return request.bodyKind === 'none'
      ? []
      : [
          finding(
            'request-body-unexpected',
            '',
            `sends a ${request.bodyKind} body; the operation documents none`,
          ),
        ];
  }
  if (request.bodyKind === 'none') {
    return body?.required
      ? [
          finding(
            'request-body-missing',
            '',
            `sends no body; the operation requires ${mediaTypes.join(' or ')}`,
          ),
        ]
      : [];
  }
  const media =
    mediaTypes.find((type) => mediaKind(type) === request.bodyKind) ??
    mediaTypes.find((type) => mediaKind(type) === 'any');
  if (!media) {
    return [
      finding(
        'request-content-type',
        '',
        `sends ${request.bodyKind}; the operation documents ${mediaTypes.join(', ')}`,
      ),
    ];
  }
  const schema = content[media]?.schema;
  if (!schema) return [];
  if (request.bodyKind === 'json') {
    return compareResponse({ schema, shape: summarize(request.json), document }).flatMap((f) => {
      const severity = REQUEST_SEVERITY[f.kind];
      if (severity === 'drop') return [];
      return [severity ? { ...f, severity } : f];
    });
  }
  if (request.bodyKind === 'multipart' || request.bodyKind === 'form') {
    return checkParts(request.parts ?? [], schema, document);
  }
  return [];
}

function checkParts(
  parts: CapturedPart[],
  raw: SchemaObject,
  document: OpenApiDocument,
): Finding[] {
  const schema = raw.$ref ? (resolveRef<SchemaObject>(document, raw.$ref) ?? {}) : raw;
  const properties = schema.properties ?? {};
  const sent = new Set(parts.map((p) => p.name));
  const out: Finding[] = [];
  for (const name of schema.required ?? []) {
    if (!sent.has(name)) {
      out.push(finding('missing-required', name, `required part ${name} is not sent`));
    }
  }
  for (const part of parts) {
    const property = properties[part.name];
    if (!property) {
      if (Object.keys(properties).length > 0) {
        out.push({
          ...finding('undocumented-field', part.name, `part ${part.name} is not documented`),
          severity: 'warning',
        });
      }
      continue;
    }
    const binary = isBinary(property, document);
    if (binary && part.kind === 'text') {
      out.push(
        finding(
          'type-mismatch',
          part.name,
          `part ${part.name} is documented as a file but sent as text`,
        ),
      );
    }
  }
  return dedupe(out);
}

function isBinary(schema: SchemaObject, document: OpenApiDocument): boolean {
  const s = schema.$ref ? (resolveRef<SchemaObject>(document, schema.$ref) ?? {}) : schema;
  if (s.format === 'binary') return true;
  return s.type === 'array' && Boolean(s.items) && isBinary(s.items!, document);
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.kind} ${f.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Which {@link RequestBodyKind} a documented media type stands for. */
export function mediaKind(mediaType: string): RequestBodyKind | 'any' {
  const type = mediaType.toLowerCase();
  if (type.includes('json')) return 'json';
  if (type.startsWith('multipart/')) return 'multipart';
  if (type === 'application/x-www-form-urlencoded') return 'form';
  if (type.startsWith('text/')) return 'text';
  if (type === '*/*') return 'any';
  return 'binary';
}
