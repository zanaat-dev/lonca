import {
  createRequester,
  type BaseRequestOptions,
  type Logger,
  type TokenBucketRateLimiter,
} from '@lonca/core';
import { mapHttpError } from './errors.js';
import { mapSoapFailure, mapSoapHttpError, type SoapResultInfo } from './soap/errors.js';
import { asObject, asText, parseXml, toXml, type XmlInput, type XmlObject } from './soap/xml.js';

/** Namespace of every n11 SOAP request element (`elementFormDefault="unqualified"`). */
const SOAP_NAMESPACE = 'http://www.n11.com/ws/schemas';

/**
 * n11 base URLs.
 *
 * Every REST page of the developer portal (developer.n11.com/documentation) uses
 * `https://api.n11.com`, under three path families: `/cdn/...` (categories),
 * `/ms/...` (products) and `/rest/...` (orders). The legacy SOAP services live
 * under `/ws/...` on the same host. The portal documents **no sandbox / test
 * environment**, so only `prod` exists for now (open question — see RESEARCH.md).
 */
const BASE_URLS = {
  prod: 'https://api.n11.com',
} as const;

export type N11Environment = keyof typeof BASE_URLS;

export interface TransportConfig {
  /** n11 API key, created in the n11 Seller Office (so.n11.com). Sent as the `appkey` header. */
  appKey: string;
  /** n11 API secret. Sent as the `appsecret` header. */
  appSecret: string;
  /** Which n11 environment to target. Only `'prod'` is documented. */
  env: N11Environment;
  /**
   * Integrator name, for the `integrator` field of product write tasks. It is
   * free text (the integrator's company name) with no registration; n11 logs by
   * it and expects the same value in every product request, including letter
   * case and `I`/`ı`/`İ`/`i` (n11 support, 2026-10-13). Kept on the transport so
   * write resources can read it; no header carries it.
   */
  integratorName: string;
  /** Optional structured logger (`@lonca/core` `Logger`). Defaults to no-op. */
  logger?: Logger;
  /** Request timeout in ms. Default: 30_000. */
  timeoutMs?: number;
  /** Override the underlying `fetch` (tests inject a mock). */
  fetch?: typeof fetch;
}

export interface RequestOptions extends BaseRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path beginning with `/` (e.g. `/ms/product-query`). */
  path: string;
  /**
   * Query parameters. `undefined` values are skipped; array values are joined
   * with commas, the encoding n11 expects for multi-value filters such as
   * `categoryIds` (confirmed by n11, 2026-10-13).
   */
  query?: Record<string, string | number | boolean | readonly (string | number)[] | undefined>;
}

/** Options for {@link N11Transport.soap}. */
export interface SoapCallOptions {
  /** Service path segment under `/ws/`, e.g. `productService`. */
  service: string;
  /** Operation name, e.g. `GetProductQuestionList` (the request element is `<Operation>Request`). */
  operation: string;
  /** Request fields after `auth`, in schema order. */
  fields?: { [name: string]: XmlInput };
  signal?: AbortSignal;
  rateLimiter?: TokenBucketRateLimiter;
}

interface SoapRequestOptions extends BaseRequestOptions {
  /** Service path segment under `/ws/`. */
  path: string;
}

/**
 * REST transport for n11's JSON services.
 *
 * Auth is two plain headers, `appkey` and `appsecret` — every REST page says
 * "Authorization: no auth; add appKey and appSecret to Headers". The SOAP
 * services (questions, returns, invoice links, catalog search) carry the same
 * key pair inside the envelope's `auth` element instead; they are not wired yet.
 */
export class N11Transport {
  private readonly baseUrl: string;
  private readonly requester: <T>(opts: RequestOptions) => Promise<T>;
  private readonly soapRequester: <T>(opts: SoapRequestOptions) => Promise<T>;

  constructor(private readonly config: TransportConfig) {
    this.baseUrl = BASE_URLS[config.env];
    this.requester = createRequester<RequestOptions>({
      fetch: config.fetch ?? fetch,
      logger: config.logger,
      timeoutMs: config.timeoutMs ?? 30_000,
      label: 'n11',
      logPrefix: 'n11',
      buildUrl: (opts) => this.buildUrl(opts.path, opts.query),
      buildHeaders: () => this.buildHeaders(),
      mapHttpError,
    });
    this.soapRequester = createRequester<SoapRequestOptions>({
      fetch: config.fetch ?? fetch,
      logger: config.logger,
      timeoutMs: config.timeoutMs ?? 30_000,
      label: 'n11',
      logPrefix: 'n11',
      buildUrl: (opts) => `${this.baseUrl}/ws/${opts.path}/`,
      buildHeaders: () => ({
        'Content-Type': 'text/xml; charset=utf-8',
        Accept: 'text/xml',
        SOAPAction: '""',
      }),
      mapHttpError: mapSoapHttpError,
      logFields: (opts) => ({ soapService: opts.path }),
    });
  }

  /** Integrator name for the `integrator` field of product write tasks. */
  get integratorName(): string {
    return this.config.integratorName;
  }

  request<T>(opts: RequestOptions): Promise<T> {
    return this.requester<T>(opts);
  }

  /**
   * Call one of n11's SOAP services (questions, returns, cancels, shipment
   * companies, …) and return the `<Operation>Response` element, parsed.
   *
   * The key pair travels in the envelope (`auth.appKey` / `auth.appSecret`),
   * not in headers. Every SOAP call the SDK makes today is a read, so it is
   * sent as idempotent (retried on 5xx / network failures). A `result.status`
   * of `failure` — n11 reports those with HTTP 200 — is thrown as a
   * `LoncaError` (see `mapSoapFailure`).
   */
  async soap(opts: SoapCallOptions): Promise<XmlObject> {
    const envelope =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="${SOAP_NAMESPACE}">` +
      `<soapenv:Header/><soapenv:Body><sch:${opts.operation}Request>` +
      toXml({
        auth: { appKey: this.config.appKey, appSecret: this.config.appSecret },
        ...opts.fields,
      }) +
      `</sch:${opts.operation}Request></soapenv:Body></soapenv:Envelope>`;
    const text = await this.soapRequester<unknown>({
      method: 'POST',
      path: opts.service,
      rawBody: envelope,
      idempotent: true,
      signal: opts.signal,
      rateLimiter: opts.rateLimiter,
    });
    const body = asObject(asObject(parseXml(typeof text === 'string' ? text : '').Envelope).Body);
    const response = asObject(body[`${opts.operation}Response`]);
    const result = asObject(response.result);
    if (asText(result.status)?.toLowerCase() === 'failure') {
      const info: SoapResultInfo = { status: 'failure' };
      for (const key of ['errorCode', 'errorMessage', 'errorCategory'] as const) {
        const value = asText(result[key]);
        if (value) info[key] = value;
      }
      throw mapSoapFailure(opts.operation, info);
    }
    return response;
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          if (value.length === 0) continue;
          url.searchParams.set(key, value.join(','));
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private buildHeaders(): Record<string, string> {
    // n11 documents no correlation-id or User-Agent convention, so none is
    // invented here; the SDK-generated correlation id still appears in the
    // `n11.request` / `n11.error` log lines.
    return {
      appkey: this.config.appKey,
      appsecret: this.config.appSecret,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}
