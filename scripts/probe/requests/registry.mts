/**
 * Request-check catalogs: for each marketplace, sample calls of the SDK's
 * methods. `run.mts` executes them over `@lonca/drift`'s request recorder (no
 * network), then checks every recorded request against `specs/`.
 *
 * A sample should look like real use: the fields a seller would actually send,
 * typed as the SDK documents them. The check compares names and JSON types
 * only, so values can be anything plausible.
 */
import type { CapturedRequest } from '@lonca/drift';

export interface RequestCall<TClient> {
  /**
   * `<resource>.<method>`, optionally followed by `: <variant>` when one
   * method has several samples. The part before `:` must name a real SDK
   * method; the report lists methods without a sample.
   */
  name: string;
  call: (client: TClient) => Promise<unknown>;
  /** Body the recorder answers with (default `{}`), for methods that read the response. */
  respond?: (request: CapturedRequest) => unknown;
  /**
   * Why the requests are not compared with the spec (e.g. an endpoint no spec
   * file covers). The call still runs, so a sample that throws is reported.
   */
  skip?: string;
}

export interface RequestSet<TClient> {
  marketplace: string;
  /** Build a client with placeholder credentials over the recorder's `fetch`. */
  createClient: (fetch: typeof globalThis.fetch) => TClient;
  calls: readonly RequestCall<TClient>[];
  /**
   * Methods that need no sample: pure helpers that make no request, or
   * methods covered elsewhere. Each with the reason.
   */
  noRequest?: Readonly<Record<string, string>>;
}

/** `resource.method` of a call name. */
export function methodOf(name: string): string {
  return name.split(':')[0]!.trim();
}

/** Every `resource.method` the client exposes (own resources, prototype methods). */
export function listMethods(client: object): string[] {
  const out: string[] = [];
  for (const [resource, value] of Object.entries(client)) {
    if (!value || typeof value !== 'object') continue;
    let proto = Object.getPrototypeOf(value) as object | null;
    const names = new Set<string>();
    while (proto && proto !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor' || name.startsWith('_')) continue;
        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        if (typeof descriptor?.value === 'function') names.add(name);
      }
      proto = Object.getPrototypeOf(proto) as object | null;
    }
    for (const name of names) out.push(`${resource}.${name}`);
  }
  return out.sort();
}
