<p align="left">
  <img src="https://raw.githubusercontent.com/zanaat-dev/.github/main/brand/logomark.svg" alt="Lonca" height="32">
</p>

# @lonca/hepsiburada

[![npm version](https://img.shields.io/npm/v/@lonca/hepsiburada.svg)](https://www.npmjs.com/package/@lonca/hepsiburada)

Type-safe TypeScript SDK for the [Hepsiburada Marketplace API](https://developers.hepsiburada.com). Covers every operation documented on the developer portal — **95 methods across 12 resources**, live-verified against SIT.

> [!IMPORTANT]
> **Unofficial.** This is an independent, community-maintained SDK. It is not affiliated with, endorsed by, or supported by Hepsiburada. "Hepsiburada" and related names are trademarks of their respective owners.

See [Stability & versioning](https://lonca.zanaat.dev/stability/) for the semver policy and what counts as the public API.

## Coverage

| Resource         | Methods | Host                                   | Source                         |
| ---------------- | ------: | -------------------------------------- | ------------------------------ |
| `listings`       |      18 | `listing-external[-sit]`               | OpenAPI spec                   |
| `shipping`       |       4 | `shipping-external[-sit]`              | OpenAPI spec                   |
| `claims`         |       6 | `oms-external[-sit]` + `claim-stub`    | OpenAPI spec                   |
| `testOrders`     |       1 | `oms-stub-external[-sit]` _(SIT only)_ | OpenAPI spec                   |
| `orders`         |      28 | `oms-external[-sit]`                   | Dev-portal `/operations` API ★ |
| `categories`     |       3 | `mpop[-sit]` (`/product/api/*`)        | Dev-portal `/operations` API ★ |
| `catalog`        |      11 | `mpop[-sit]` (`/product/api/*`)        | Dev-portal `/operations` API ★ |
| `productUpdates` |       3 | `mpop[-sit]` (`/ticket-api/*`)         | Dev-portal `/operations` API ★ |
| `suppliers`      |       5 | `supplier-api-external[-sit]`          | Dev-portal `/operations` API ★ |
| `accounting`     |       1 | `mpfinance-external[-sit]`             | Dev-portal `/operations` API ★ |
| `questions`      |       6 | `api-asktoseller-merchant[-sit]`       | Dev-portal `/operations` API ★ |
| `promotions`     |       9 | `diskonto-external[-sit]`              | Dev-portal `/operations` API ★ |

★ Hepsiburada publishes machine-readable OpenAPI for 5 of its 20 dev-portal products. The other 7 API-bearing products are typed from a hidden `/api/v1/public/docs/{co}/{slug}/{ver}/operations[/{opId}]` endpoint that returns the same OpenAPI shape (method / path / parameters / requestBody / responses).

**Status**: 13 of Hepsiburada's 20 dev-portal products covered. The remaining 7 are documentation pages (`baslangic`, `entegrasyonda-sikca-sorulan-sorular`, `api-authentication`) or empty placeholders (`e-faturam` is SOAP/XML on a separate host, `ticket-yonetimi` is portal-only, `bildirim-merkezi` / `oms-fulfilment-entegrasyonu` have zero published operations).

## Install

```bash
pnpm add @lonca/hepsiburada @lonca/core
```

`@lonca/core` is a peer dependency (provides retry, rate limiter, error classes).

## Quick start

```ts
import { createHepsiburadaClient } from '@lonca/hepsiburada';

const client = createHepsiburadaClient({
  merchantId: '00000000-0000-0000-0000-000000000000',
  username: process.env.HB_API_USER!,
  password: process.env.HB_API_PASS!,
  env: 'sit', // or 'prod'
  integratorName: 'MyCompany', // server-side integrator name
});

const page = await client.listings.list({ offset: 0, limit: 100 });
for (const l of page.items) {
  console.log(l.hepsiburadaSku, l.merchantSku, l.availableStock, l.price);
}
```

## Authentication & environments

Hepsiburada uses HTTP Basic Auth + a required `User-Agent`. Get `merchantId`, `username`, and `password` from [Merchant Portal](https://merchant.hepsiburada.com) → Settings → Integrations.

| Env    | Hostname suffix                   |
| ------ | --------------------------------- |
| `prod` | `*.hepsiburada.com`               |
| `sit`  | `*-sit.hepsiburada.com` (sandbox) |

The SDK auto-resolves the matching host per resource — see the Coverage table for the per-resource host.

**`User-Agent`** is the bare integrator name you pass at construction time (e.g. `MyCompany`). Hepsiburada rejects requests without a meaningful User-Agent.

## End-to-end flows

### 1) Bulk price update (async upload + polling)

Every upload endpoint is asynchronous — Hepsiburada returns `{ id }` synchronously, you poll the matching `get*Upload(id)` to read the outcome.

```ts
const { id } = await client.listings.uploadPrice([
  { hepsiburadaSku: 'HB-1', price: 199.9 },
  { hepsiburadaSku: 'HB-2', price: 249.0 },
]);

let result;
do {
  await new Promise((r) => setTimeout(r, 2000));
  result = await client.listings.getPriceUpload(id);
} while (result.status === 'PROCESSING');

// Floor / ceiling rejections (price-specific)
for (const v of result.priceValidations ?? []) {
  console.warn(`${v.hepsiburadaSku}: ${v.type} ${v.minPrice}–${v.maxPrice}`);
}

// Per-row errors (shared across all upload kinds)
for (const e of result.errors) {
  console.error(`Row ${e.elementNo}: ${e.errors?.join(', ')}`);
}
```

The same shape applies to `uploadInventory`, `uploadStock`, `uploadShippingInfo`, `uploadAdditionalInfo`.

### 2) Order fulfillment lifecycle

```ts
// 1. Discover orders awaiting packaging
const open = await client.orders.list({ limit: 100 });

// 2. Find line items that can be packaged together
for (const order of open.items) {
  const orderDetail = await client.orders.getByOrderNumber(order.orderNumber!);
  const lineId = (orderDetail.raw as { lineItems?: { id: string }[] }).lineItems?.[0]?.id;
  if (!lineId) continue;

  const peers = await client.orders.getPackageableLineItems(lineId);

  // 3. Package the items — the receipt carries the new package number + barcode
  const receipt = await client.orders.createPackages({
    lineItems: [lineId, ...peers.map((p) => (p as { id: string }).id)],
    cargoCompany: 'ARAS',
  });
  console.log(`packaged as ${receipt.packageNumber} (barcode ${receipt.barcode})`);
}

// 4. As the cargo firm scans / delivers, transition status
await client.orders.markPackageInTransit('HBP-123', { trackingNumber: 'TR-456' });
await client.orders.markPackageDelivered('HBP-123');
// or, on a failed delivery:
await client.orders.markPackageUndelivered('HBP-123', { reason: 'address-not-found' });

// 5. Attach an invoice link before delivery
await client.orders.sendInvoiceLink('HBP-123', {
  invoiceLink: 'https://my-erp.example/inv/HBP-123.pdf',
  serialNumber: 'INV-2026-00123',
});

// 6. Status-bucketed lists for reconciliation
const missingInvoice = await client.orders.listMissingInvoicePackages({ limit: 100 });
console.log(`${missingInvoice.totalCount} shipped packages still missing invoice`);
```

### 3) Catalog product upload + status polling

```ts
// 1. Submit one or more new products
const { trackingId } = await client.catalog.uploadProductViaFile([
  {
    categoryId: 18021982,
    merchant: process.env.HB_MERCHANT_ID,
    attributes: {
      merchantSku: 'SKU-001',
      Barcode: '8690000000001',
      // ...all category-specific attributes
    },
  },
]);

// 2. Poll for completion (status returns DONE / FAILED / IN_PROGRESS)
let status;
do {
  await new Promise((r) => setTimeout(r, 5000));
  status = await client.catalog.getProductStatus(trackingId);
} while (status.status === 'IN_PROGRESS');

if (status.status === 'FAILED') {
  for (const row of status.rows ?? []) console.error(row);
}

// 3. Read your catalog rows — an OffsetPage (`.items`, `.totalCount`, `.pageCount`)
const page = await client.catalog.listProducts({ page: 0, size: 100 });
console.log(`${page.totalCount} rows over ${page.pageCount} pages`);
for (const p of page.items) {
  console.log(p.merchantSku, p.status, `quality=${p.productQuality}`);
}

// …or walk every page with paginateOffset (re-exported from '@lonca/hepsiburada';
//    pass `limit` — Hepsiburada pages by number)
for await (const p of paginateOffset((q) => client.catalog.listProducts(q), { limit: 100 })) {
  console.log(p.merchantSku);
}

// 4. Or filter to a specific lifecycle status (Hepsiburada's UPPER_SNAKE vocabulary —
//    'WAITING', 'MATCHED', 'MISSING_INFO', … — anything else is answered with HTTP 500)
const waiting = await client.catalog.listProductsByStatus({ status: 'WAITING' });
```

### 4) Returns / claims handling

```ts
// 1. Pull claims awaiting your action (strict enum — see ClaimStatus type)
const awaiting = await client.claims.listByStatus('AwaitingAction', { limit: 100 });

// 2. Drive the action
for (const claim of awaiting) {
  // Inspect claim.raw for category, reason code, items
  const decision = decideAccept(claim); // your business logic
  if (decision === 'accept') {
    await client.claims.accept(claim.claimNumber!, { reasonCode: 'APPROVED' });
  } else if (decision === 'reject') {
    await client.claims.reject(claim.claimNumber!, { reasonCode: 'NOT_ELIGIBLE' });
  } else {
    await client.claims.preApprovalConfirm(claim.claimNumber!, { confirmed: true });
  }
}
```

### 5) Webhook handlers (orders + claims)

Hepsiburada's webhook model is **endpoint-per-event** — you register one base URL and Hepsiburada `PUT`s to `<baseUrl>/<eventName>` for each event. Eight order events + four claim events = **12 webhook events** total.

```ts
import express from 'express';
import {
  parseHepsiburadaWebhookEvent,
  ORDER_WEBHOOK_EVENTS,
  CLAIM_WEBHOOK_EVENTS,
  type OrderWebhookEvent,
} from '@lonca/hepsiburada';

const app = express();
app.use(express.json());

// One PUT route per event. Hepsiburada expects 2xx ack within ~5s; the
// receiver must be idempotent (HB may retry).
for (const event of ORDER_WEBHOOK_EVENTS) {
  app.put(`/hb/${event}`, (req, res) => {
    const { body } = parseHepsiburadaWebhookEvent(event, req.body);
    handleOrderEvent(event, body); // your business logic
    res.status(204).end();
  });
}

for (const event of CLAIM_WEBHOOK_EVENTS) {
  app.put(`/hb/${event}`, (req, res) => {
    const { body } = parseHepsiburadaWebhookEvent(event, req.body);
    handleClaimEvent(event, body);
    res.status(204).end();
  });
}

function handleOrderEvent(event: OrderWebhookEvent, body: Record<string, unknown>) {
  switch (event) {
    case 'createOrder':
      /* new paid order */ break;
    case 'createPackages':
      /* HB packaged your line items */ break;
    case 'orderCancel':
      /* buyer cancelled */ break;
    case 'unpack':
      /* package unpacked */ break;
    case 'intransit':
      /* handed to cargo */ break;
    case 'deliver':
      /* delivered */ break;
    case 'undeliver':
      /* delivery failed */ break;
    case 'changeShippingAddressOrder':
      /* address updated */ break;
  }
}
```

The parser validates the JSON, throws `ValidationError` on bad input, and returns `{ event, body, raw }` — `body` is `Record<string, unknown>` (Hepsiburada documents fields in HTML tables; consult the developer portal for the documented set per event; use `raw` for forward-compat access to undocumented fields).

## Per-resource reference

### `listings` — stock / price / buybox / single-SKU mutations (18 methods)

```ts
// Read
await client.listings.list({
  offset: 0,
  limit: 100,
  hbSkuList: 'HB-1,HB-2',
  salableListings: true,
});
await client.listings.getBuyboxOrder('HB-1,HB-2'); // skuList REQUIRED (live API rejects empty)
await client.listings.getCommissions('HB-1'); // skuList REQUIRED

// Single-SKU mutations
await client.listings.activate('HB-1');
await client.listings.deactivate('HB-1');
await client.listings.updateSingle('HB-1', 'M-1', {
  newAvailableStock: 5,
  newPrice: { currency: 'TRY', amount: 199.9 },
  newDispatchTime: 2,
});
await client.listings.deleteSingle('HB-1', 'M-1');
await client.listings.bulkUnlock({ hbSkuList: ['HB-1', 'HB-2'] });

// Async bulk uploads — all 5 follow the {id} → poll pattern shown above
await client.listings.uploadInventory([{ hepsiburadaSku: 'HB-1', availableStock: 5 }]);
await client.listings.uploadStock([{ hepsiburadaSku: 'HB-1', availableStock: 5 }]);
await client.listings.uploadPrice([{ hepsiburadaSku: 'HB-1', price: 199.9 }]);
await client.listings.uploadShippingInfo([{ hepsiburadaSku: 'HB-1', dispatchTime: 2 }]);
await client.listings.uploadAdditionalInfo([
  { hepsiburadaSku: 'HB-1', customizationTextLength: 12 },
]);
// Each upload returns { id } — poll get<Kind>Upload(id) until status !== 'PROCESSING'
```

### `shipping` — cargo firms + shipping profiles (4 methods)

```ts
const firms = await client.shipping.getCargoFirms();
const profiles = await client.shipping.listProfiles();
// Both resolve to MutationResult ({ raw }) — the portal publishes no response schema
await client.shipping.createProfile({ profileName: 'Express', cargoFirms: 'ARAS,MNG' });
await client.shipping.updateProfile({ profileName: 'Express', cargoFirms: 'ARAS' });
```

### `orders` — full OMS surface (28 methods)

```ts
// Order lists
await client.orders.list({ beginDate: '2026-01-01', limit: 100 });
await client.orders.listCancelled({ limit: 100 });
await client.orders.listPaymentAwaiting({ limit: 100 });
await client.orders.getByOrderNumber('HBO-12345');

// Package lists (status-bucketed)
await client.orders.listPackages({ limit: 100 }); // raw array, no envelope
await client.orders.listShippedPackages({ limit: 100 });
await client.orders.listDeliveredPackages({ limit: 100 });
await client.orders.listUndeliveredPackages({ limit: 100 });
await client.orders.listUnpackedPackages({ limit: 100 });
await client.orders.listMissingInvoicePackages({ limit: 100 });
await client.orders.getPackage('HBP-1');
await client.orders.getPackageLabel('HBP-1'); // PDF / barcode

// Packaging mutations — createPackages resolves to a PackageReceipt
// ({ packageNumber, barcode, raw }); every other action below resolves to
// MutationResult ({ raw }) because the API answers with a bare string or 204.
const { packageNumber, barcode } = await client.orders.createPackages({
  lineItems: ['L1', 'L2'],
  cargoCompany: 'ARAS',
});
await client.orders.splitPackage('HBP-1', { lineItems: ['L1'] });
await client.orders.unpackPackage('HBP-1');

// Status transitions
await client.orders.markPackageInTransit('HBP-1', { trackingNumber: 'TR-1' });
await client.orders.markPackageDelivered('HBP-1');
await client.orders.markPackageUndelivered('HBP-1', { reason: '...' });

// Line-item actions
await client.orders.cancelLineItem('L1', { reason: 'out-of-stock' });
await client.orders.updateLineItemCargoCompany('L1', { cargoCompany: 'MNG' });
await client.orders.updateLineItemLaborCost('L1', { unitLaborCost: 12.5 });

// Package field updates
await client.orders.updatePackageCargoCompany('HBP-1', { cargoCompany: 'YURTICI' });
await client.orders.sendInvoiceLink('HBP-1', { invoiceLink: '...', serialNumber: '...' });
await client.orders.updateParcelInfo('HBP-1', { totalDesi: 8, totalParcel: 1 });
await client.orders.updatePackageWarehouse('HBP-1', { shippingAddressLabel: 'WH-2' });

// Cargo-company-change discovery
await client.orders.getChangeableCargoCompaniesForLineItem('L1');
await client.orders.getChangeableCargoCompaniesForPackage('HBP-1');
await client.orders.getPackageableLineItems('L1');
```

### `claims` — returns + accept/reject/preApproval (6 methods)

```ts
import type { ClaimStatus } from '@lonca/hepsiburada';

// status param is a strict union:
//   'NewRequest' | 'Accepted' | 'AwaitingAction' | 'InDispute'
//   | 'Rejected' | 'Refunded' | 'Cancelled' | 'AwaitingPreApproval'
await client.claims.list({ beginDate: '2026-01-01 00:00', limit: 50 });
await client.claims.listByStatus('AwaitingAction', { limit: 50 });

await client.claims.accept('CLM-1', { reasonCode: 'APPROVED' });
await client.claims.reject('CLM-1', { reasonCode: 'NOT_ELIGIBLE' });
await client.claims.preApprovalConfirm('CLM-1', { confirmed: true });

// Create a new claim (routes to a different host: claim-stub)
await client.claims.create({
  orderNumber: 'O-1',
  lines: [/* ... */],
});
```

Dates use `yyyy-MM-dd HH:mm` format.

### `categories` — Hepsiburada catalog tree (3 methods)

```ts
// ~27,000 categories — paginate; filter to leaves for listable ones.
// Returns an OffsetPage-compatible page (items / totalCount / pageCount / limit / offset);
// the old Spring fields (data, totalElements, …) are still there but deprecated.
const page = await client.categories.list({ page: 0, size: 100, leaf: true });
console.log(`${page.items.length}/${page.totalCount} leaf categories`);

// …or drive it with paginateOffset (offset/limit alias; offset must be a multiple of limit)
for await (const category of paginateOffset((p) => client.categories.list({ ...p, leaf: true }), {
  limit: 500,
})) {
  if (category.available) break;
}

// Attribute definitions — leaf categories only
const attrs = await client.categories.getAttributes(page.items[0].categoryId);

// Enum values for an attribute (for dropdowns like Color, Size)
const values = await client.categories.getAttributeValues(page.items[0].categoryId, attrs[0].id!);
```

### `catalog` — merchant product CRUD (11 methods)

```ts
// Read
await client.catalog.listProducts({ page: 0, size: 100 }); // OffsetPage<CatalogProduct>
await client.catalog.listProducts({ merchantSku: 'SKU-1' }); // or narrow by barcode / merchantSku / hbSku
await client.catalog.listProductsByStatus({ status: 'MATCHED' }); // status is required; OffsetPage too
await client.catalog.getProductStatus('trk-id'); // status of a previous upload
await client.catalog.getTrackingIdHistory();

// Create / update via async upload (returns trackingId, poll status)
await client.catalog.uploadProductViaFile([{/* per-category attributes */}]);
await client.catalog.uploadFastListing(/* ... */);
await client.catalog.checkProductStatus([{ merchant: 'M-1', merchantSkuList: ['sku-1'] }]);

// Pre-match approval (Hepsiburada matched your SKU to an existing catalog entry)
await client.catalog.approvePreMatch([{ merchant: 'M-1', merchantSkuList: ['sku-1'] }]);
await client.catalog.rejectPreMatch([{ merchant: 'M-1', merchantSkuList: ['sku-2'] }]);

// Async delete with status polling
const { trackingId } = await client.catalog.deleteByMerchantSkuList({
  merchantSkuList: ['M-1', 'M-2'],
});
await client.catalog.getDeleteProcess(trackingId);
```

### `productUpdates` — async update flow (3 methods)

```ts
const { trackingId } = await client.productUpdates.importUpdates([
  { hbSku: 'HB-1', fields: { price: 249.0 } },
]);
await client.productUpdates.getUpdateStatus(trackingId);
await client.productUpdates.getUpdateHistory('HB-1');
```

### `suppliers` — supplier offers + inventory (5 methods)

```ts
// Searches resolve to SupplierSearchResult<T> — { totalCount, items, message?, errorCode?, raw },
// unwrapped from the supplier API's { data, message, errorCode } envelope.
const open = await client.suppliers.searchOpenPurchaseOrders({ pageNumber: 0, pageSize: 50 });
open.items[0]?.purchaseOrderNumber; // OpenPurchaseOrder rows
const stock = await client.suppliers.searchSupplierListings({ pageNumber: 0, pageSize: 50 });
stock.items[0]?.status; // SupplierListing rows ('Active' | 'Inactive' | 'Suspended')
const offers = await client.suppliers.searchListingUpdateRequests({ pageNumber: 0, pageSize: 50 });
offers.items[0]?.requestId; // ListingUpdateRequestSummary rows

const offer = await client.suppliers.getListingUpdateRequest('REQ-1');
offer.requestItems[0]?.priceApprovalStatus; // per-field approval on each ListingUpdateRequestItem

const { id } = await client.suppliers.createListingUpdateRequest({/* ... */}); // ListingUpdateRequestReceipt
```

### `accounting` — record-level transactions (1 method)

```ts
await client.accounting.listTransactions({
  beginDate: '2026-01-01',
  endDate: '2026-02-01',
  offset: 0,
  limit: 100,
});
```

### `questions` — "Ask the Seller" Q&A (6 methods)

```ts
await client.questions.list({ status: 'Open', limit: 50 });
await client.questions.get('Q-1');
await client.questions.getCountByStatus();
// The three actions resolve to MutationResult ({ raw }) — the API acknowledges with a bare string
await client.questions.answer('Q-1', { answer: 'Stokumuzda var, 2 günde teslim ediyoruz.' });
await client.questions.reject('Q-1', { reasonCode: 'inappropriate' });
await client.questions.create({
  /* SIT-only — seeds a test question; raw holds the returned number[] */
});
```

### `promotions` — self-service basket campaigns (9 methods)

```ts
await client.promotions.listCategories();
await client.promotions.getBudgets();
await client.promotions.getLimits();
await client.promotions.listDiscounts();
await client.promotions.getDiscount('C-1');

// Three discount types — each resolves to a DiscountReceipt ({ success, campaignId, raw })
const { campaignId } = await client.promotions.createTlDiscount({
  discountAmount: 50,
  conditionAmount: 200 /* ... */,
});
await client.promotions.createPercentDiscount({
  discountPercentage: 10,
  conditionAmount: 200 /* ... */,
});
await client.promotions.createXyDiscount({
  conditionProductCount: 3,
  mustPayProductCount: 2 /* ... */,
});

await client.promotions.cancelDiscount({ campaignId }); // MutationResult — the API only answers { success }
```

### `testOrders` — sandbox-only test order creation (1 method)

```ts
// SIT only — guard your code so it never runs against prod
if (env === 'sit') {
  const { raw } = await client.testOrders.create({
    customer: {/* ... */},
    lines: [/* ... */],
  }); // MutationResult — the stub publishes no response schema
}
```

## Built-in robustness

- **Idempotency-aware retry with exponential backoff** — reads (`GET`) retry on 429 (honoring `Retry-After`), 5xx, and network/timeout errors. Writes (`POST`/`PUT`/`PATCH`/`DELETE`) retry **only** on 429, which the server rejects before processing; ambiguous 5xx/network/timeout failures on a write are not replayed, so a transient error can't duplicate a package action or stock/price push. A `Retry-After: 0` no longer collapses backoff to an immediate retry.
- **Per-resource rate limiting** (token bucket) — see defaults below; override per resource via constructor
- **Per-request correlation ID** — every call gets a UUID surfaced in log messages and an `x-correlationid` request header for downstream tracing
- **Structured errors** via `@lonca/core` (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
- **Client-side validation** — empty / >1000-item bulk uploads, required `skuList` on buybox/commissions, strict `ClaimStatus` union, every action's `claimNumber` / `packageNumber` / `trackingId` checked before the request leaves the process
- **Multi-host routing** — each resource tags its target host (`listing`, `oms`, `shipping`, `claim-stub`, `oms-stub`, `mpop`, `mpfinance`, `supplier-api`, `asktoseller`, `diskonto`); auto-resolved per env
- **`AbortSignal` support** throughout

### Rate-limiter defaults

| Resource         | Default capacity | Interval |
| ---------------- | :--------------: | :------: |
| `listings`       |       600        |   60 s   |
| `categories`     |       600        |   60 s   |
| `orders`         |       120        |   60 s   |
| `claims`         |       120        |   60 s   |
| `catalog`        |       120        |   60 s   |
| `productUpdates` |       120        |   60 s   |
| `questions`      |       120        |   60 s   |
| `shipping`       |        60        |   60 s   |
| `suppliers`      |        60        |   60 s   |
| `accounting`     |        60        |   60 s   |
| `promotions`     |        60        |   60 s   |
| `testOrders`     |        30        |   60 s   |

Override per resource by passing a `TokenBucketRateLimiter` from `@lonca/core`:

```ts
import { TokenBucketRateLimiter } from '@lonca/core';
import { OrdersResource } from '@lonca/hepsiburada';

const orders = new OrdersResource(
  client.orders.transport, // not exposed; build manually if you need this
  new TokenBucketRateLimiter({ capacity: 300, intervalMs: 60_000 }),
);
```

## Wire-shape notes

Hepsiburada doesn't ship a single uniform envelope across its surfaces — the key holding the rows differs per endpoint. The SDK unwraps each one for you and returns a consistent typed shape; the table below is what the wire actually sends (verified live):

- **`{ totalCount, limit, offset, pageCount, items[] }`** — OMS list endpoints (`orders.list*`, `orders.listShippedPackages`, …). SDK returns an `OffsetPage` (`.items`, `.pageCount`).
- **`{ totalElements, totalPages, number, …, data[] }`** — Spring-style envelope used by the catalog surface. `catalog.listProducts` / `catalog.listProductsByStatus` map it onto an `OffsetPage` (`totalElements` → `.totalCount`, `totalPages` → `.pageCount`, `data` → `.items`); `categories.list` maps it the same way onto a `CatalogPage` — an `OffsetPage` that, for one more minor, still carries the deprecated Spring fields (`data`, `totalElements`, …). An empty result arrives as HTTP 200 `success: false` (`code` 4008 / 4014) with `data: []` — surfaced as an empty page, not an error.
- **`{ success, code, message, data }`** — non-paged catalog responses. For `categories.getAttributes`, `data` is an object with three buckets (`baseAttributes`, `attributes`, `variantAttributes`) — the SDK flattens them into one `CategoryAttribute[]`, each tagged with a `group`. A non-leaf category returns `success: false, code: 1003` → surfaced as `ValidationError`.
- **Endpoint-specific key** — `shipping.getCargoFirms` returns `{ cargoFirms[] }`, `shipping.listProfiles` returns `{ profiles[] }`. SDK unwraps the named key.
- **Raw `T[]` (bare array)** — `orders.listPackages` (unfiltered `/packages`), `orders.getPackageableLineItems`.
- **`{ data, message, errorCode }`** — the supplier API. `suppliers.search*` unwrap `data.rows` → `.items` (with `data.totalCount` → `.totalCount`), `getListingUpdateRequest` / `createListingUpdateRequest` unwrap `data` into the typed result; `message` / `errorCode` stay alongside.
- **Mutations** — no method returns a bare `unknown`. Actions whose response the portal documents are typed (`orders.createPackages` → `PackageReceipt`, `promotions.create*Discount` → `DiscountReceipt`, `suppliers.createListingUpdateRequest` → `ListingUpdateRequestReceipt`); everything else — bare-string `200`s, `204`s, `{ success }`-only bodies, and surfaces with no published schema (`shipping`, `testOrders`, `claims`) — resolves to `MutationResult` from `@lonca/core`, the API body untouched on `.raw`.

Every row carries an untouched `raw: Record<string, unknown>` for fields the SDK doesn't surface — undocumented fields stay available without an SDK release.

## Casing quirks

Live verification revealed `merchantId` path-segment casing tolerance differs per host:

| Host                              | merchantid (lowercase) | merchantId (camelCase) | SDK uses  |
| --------------------------------- | :--------------------: | :--------------------: | --------- |
| `listing-external[-sit]`          |         ✓ 200          |         ✗ 400          | lowercase |
| `oms-external[-sit]`              |         ✓ 200          |         ✓ 200          | camelCase |
| `mpop[-sit]` (catalog/categories) |   n/a (query param)    |           ✓            | camelCase |
| `shipping-external[-sit]`         |          n/a           |           ✓            | camelCase |
| `mpfinance-external[-sit]`        |         ✓ 200          |         ✓ 200          | lowercase |

The SDK picks the casing each host actually serves — you don't need to think about it.

## Verify your integration: live smoke script

The monorepo ships a read-only smoke script you can run against your sandbox or production credentials to confirm the SDK reaches every resource:

```bash
# Put your creds in .env (see examples/try-hepsiburada.mts for variable names)
pnpm try:hepsiburada
```

The script calls one read endpoint per resource and reports `✓` for `200 OK`, `🔒` for `401`/`403` (sandbox merchant lacks scope — production should work), and `✖` for unexpected errors. It never mutates state — no POST / PUT / DELETE.

## Stability

`1.x` — stable, verified read-only against the production API. Breaking changes ship only in major versions; see [Stability & versioning](https://lonca.zanaat.dev/stability/).

- **`0.6.0`** (Phase 2d) — webhook event parser + casing regression tests + smoke script
- **`0.5.0`** (Phase 2c) — ergonomics + strict types: `ClaimStatus` union, `skuList` required, per-host path casing
- **`0.4.0`** (Phase 2b) — full dev-portal coverage: +5 resources, +56 methods
- **`0.3.0`** (Phase 2a) — discovery-first: `orders`, `categories`, `catalog`
- **`0.2.0`** (Phase 1b) — `shipping`, `claims`, `testOrders`
- **`0.1.0`** (Phase 1a) — `listings`

## License

MIT
