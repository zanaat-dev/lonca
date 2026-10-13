import type { Logger } from '@lonca/core';
import { CategoriesResource } from './resources/categories.js';
import { ClaimsResource } from './resources/claims.js';
import { OrdersResource } from './resources/orders.js';
import { ProductsResource } from './resources/products.js';
import { QuestionsResource } from './resources/questions.js';
import { ShippingResource } from './resources/shipping.js';
import { n11Capabilities, type N11Capabilities } from './capabilities.js';
import { N11Transport, type N11Environment } from './transport.js';

export interface CreateN11ClientOptions {
  /** n11 API key, created in the n11 Seller Office (so.n11.com). */
  appKey: string;
  /** n11 API secret. */
  appSecret: string;
  /**
   * Which n11 environment to target. Only `'prod'` is documented — n11 publishes
   * no sandbox. Required anyway, for parity with the other Lonca SDKs.
   */
  env: N11Environment;
  /**
   * Integrator name, sent by product write services in the `integrator` field:
   * your company name, with no registration at n11. n11 logs by it, so keep it
   * identical in every request, down to letter case and `I`/`ı`/`İ`/`i`.
   */
  integratorName: string;
  /** Optional structured logger (`@lonca/core` `Logger`). Defaults to no-op. */
  logger?: Logger;
  /** Request timeout in ms. Default: 30_000. */
  timeoutMs?: number;
  /** Custom `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export interface N11Client {
  categories: CategoriesResource;
  /** Return and cancel claims (SOAP, read-only). */
  claims: ClaimsResource;
  orders: OrdersResource;
  products: ProductsResource;
  /** Product questions (SOAP, read-only). */
  questions: QuestionsResource;
  /** Cargo companies (SOAP). */
  shipping: ShippingResource;
  /** Static feature-capability flags for feature detection. */
  capabilities: N11Capabilities;
}

/**
 * Create an n11 client.
 *
 * **Research skeleton** — private and unpublished. The read resources
 * (`categories`, `orders.list`, `products.list`) are verified against prod;
 * the SOAP reads (`questions`, `claims`, `shipping`) are not yet;
 * see `sdks/n11/RESEARCH.md`.
 *
 * @example
 * ```ts
 * const client = createN11Client({
 *   appKey: process.env.N11_APP_KEY!,
 *   appSecret: process.env.N11_APP_SECRET!,
 *   env: 'prod',
 *   integratorName: 'MyCompany',
 * });
 * const page = await client.products.list({ limit: 100 });
 * ```
 */
export function createN11Client(opts: CreateN11ClientOptions): N11Client {
  const transport = new N11Transport({
    appKey: opts.appKey,
    appSecret: opts.appSecret,
    env: opts.env,
    integratorName: opts.integratorName,
    logger: opts.logger,
    timeoutMs: opts.timeoutMs,
    fetch: opts.fetch,
  });
  return {
    categories: new CategoriesResource(transport),
    claims: new ClaimsResource(transport),
    orders: new OrdersResource(transport),
    products: new ProductsResource(transport),
    questions: new QuestionsResource(transport),
    shipping: new ShippingResource(transport),
    capabilities: n11Capabilities,
  };
}
