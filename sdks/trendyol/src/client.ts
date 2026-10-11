import type { Logger } from '@lonca/core';
import { BrandsResource } from './resources/brands.js';
import { CategoriesResource } from './resources/categories.js';
import { ClaimsResource } from './resources/claims.js';
import { ExportCenterResource } from './resources/export-center.js';
import { FinanceResource } from './resources/finance.js';
import { InventoryResource } from './resources/inventory.js';
import { InvoicesResource } from './resources/invoices.js';
import { LabelsResource } from './resources/labels.js';
import { LocationsResource } from './resources/locations.js';
import { OrdersResource } from './resources/orders.js';
import { ProductsResource } from './resources/products.js';
import { QuestionsResource } from './resources/questions.js';
import { SuppliersResource } from './resources/suppliers.js';
import { TestOrdersResource } from './resources/test-orders.js';
import { VideosResource } from './resources/videos.js';
import { WebhooksResource } from './resources/webhooks.js';
import { trendyolCapabilities, type TrendyolCapabilities } from './capabilities.js';
import { TrendyolTransport, type TrendyolEnvironment } from './transport.js';

export interface CreateClientOptions {
  /** Trendyol seller (supplier) ID — visible in Partner Panel → Account Info. */
  sellerId: number;
  /** Trendyol API key. */
  apiKey: string;
  /** Trendyol API secret. */
  apiSecret: string;
  /** Which Trendyol environment to target. */
  env: TrendyolEnvironment;
  /**
   * Integrator company name to send in `User-Agent` / `x-agentname`. Required —
   * Trendyol uses this to attribute API traffic. Use `'SelfIntegration'` if
   * the seller owns the integration code, otherwise your company / product name.
   * Trendyol caps this at 30 alphanumeric characters.
   */
  integratorName: string;
  /**
   * IPv4 address to send in `x-clientip`.
   * Defaults to `'127.0.0.1'` — Trendyol does not validate this against the
   * request origin, the header just has to be present and IPv4-shaped.
   */
  clientIp?: string;
  /** Optional structured logger (`@lonca/core` `Logger`). Defaults to no-op. */
  logger?: Logger;
  /** Request timeout in ms. Default: 30_000. */
  timeoutMs?: number;
  /**
   * Custom `fetch` implementation (e.g. to add a proxy agent, record or mock
   * traffic). Defaults to the global `fetch`.
   */
  fetch?: typeof fetch;
}

export interface TrendyolClient {
  brands: BrandsResource;
  categories: CategoriesResource;
  suppliers: SuppliersResource;
  products: ProductsResource;
  inventory: InventoryResource;
  orders: OrdersResource;
  claims: ClaimsResource;
  webhooks: WebhooksResource;
  questions: QuestionsResource;
  invoices: InvoicesResource;
  finance: FinanceResource;
  labels: LabelsResource;
  testOrders: TestOrdersResource;
  locations: LocationsResource;
  exportCenter: ExportCenterResource;
  videos: VideosResource;
  /** Static feature-capability flags for feature detection. */
  capabilities: TrendyolCapabilities;
}

/**
 * Create a Trendyol Marketplace SDK client.
 *
 * @example
 * ```ts
 * import { createTrendyolClient } from '@lonca/trendyol';
 *
 * const client = createTrendyolClient({
 *   sellerId: 12345,
 *   apiKey: process.env.TRENDYOL_API_KEY!,
 *   apiSecret: process.env.TRENDYOL_API_SECRET!,
 *   env: 'stage',
 *   integratorName: 'SelfIntegration',
 * });
 *
 * const page = await client.brands.list({ limit: 100 });
 * ```
 */
export function createTrendyolClient(opts: CreateClientOptions): TrendyolClient {
  const transport = new TrendyolTransport({
    sellerId: opts.sellerId,
    apiKey: opts.apiKey,
    apiSecret: opts.apiSecret,
    env: opts.env,
    integratorName: opts.integratorName,
    clientIp: opts.clientIp,
    logger: opts.logger,
    timeoutMs: opts.timeoutMs,
    fetch: opts.fetch,
  });

  return buildClient(transport);
}

/**
 * Wire the full resource graph over a transport. Shared by
 * {@link createTrendyolClient} and the `@lonca/trendyol/testing` fake client so
 * both stay structurally identical. Not re-exported from the package entry.
 *
 * @internal
 */
export function buildClient(transport: TrendyolTransport): TrendyolClient {
  const products = new ProductsResource(transport);

  return {
    brands: new BrandsResource(transport),
    categories: new CategoriesResource(transport),
    suppliers: new SuppliersResource(transport),
    products,
    inventory: new InventoryResource(transport, (id) => products.getBatchStatus(id)),
    orders: new OrdersResource(transport),
    claims: new ClaimsResource(transport),
    webhooks: new WebhooksResource(transport),
    questions: new QuestionsResource(transport),
    invoices: new InvoicesResource(transport),
    finance: new FinanceResource(transport),
    labels: new LabelsResource(transport),
    testOrders: new TestOrdersResource(transport),
    locations: new LocationsResource(transport),
    exportCenter: new ExportCenterResource(transport),
    videos: new VideosResource(transport),
    capabilities: trendyolCapabilities,
  };
}
