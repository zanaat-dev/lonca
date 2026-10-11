<p align="left">
  <img src="https://raw.githubusercontent.com/zanaat-dev/lonca/main/brand/logomark.svg" alt="Lonca" height="32">
</p>

# @lonca/trendyol

[![npm version](https://img.shields.io/npm/v/@lonca/trendyol.svg)](https://www.npmjs.com/package/@lonca/trendyol)

Type-safe TypeScript SDK for the [Trendyol Marketplace API](https://developers.trendyol.com).

> [!IMPORTANT]
> **Unofficial.** This is an independent, community-maintained SDK. It is not affiliated with, endorsed by, or supported by Trendyol. "Trendyol" and related names are trademarks of their respective owners.

See [Stability & versioning](https://lonca.zanaat.dev/stability/) for the semver policy and what counts as the public API.

> **Trendyol surface complete.** 16 resources spanning catalog, orders, claims, finance, webhooks, and Export Center, plus a `parseWebhookEvent` helper for inbound event handling. Every endpoint a non-AutoFT non-V1 seller can hit is covered. See the [npm badge](https://www.npmjs.com/package/@lonca/trendyol) above for the current release.

## Coverage

Each entry is a method on the client.

| Resource         | Methods                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brands`         | `list()`, `search(name)`                                                                                                                                                                                                                                                                                                           |
| `categories`     | `list()`, `getAttributes(id)`, `getAttributeValues(catId, attrId)`, `getByBarcodes(barcodes)` (AutoFT)                                                                                                                                                                                                                             |
| `suppliers`      | `getAddresses({forceRefresh?})` (1-hour cache; rate-limited 1 req/hour on Trendyol)                                                                                                                                                                                                                                                |
| `products` read  | `list({...})`, `listInventoryAndPrice({...})` (lightweight stock + price), `listUnapproved({...})`, `getBase(barcode)`, `getBuyboxInfo(barcodes)`, `getBatchStatus(id)`                                                                                                                                                            |
| `products` write | `create(items)`, `updateContent(items)`, `updateVariants(items)`, `updateUnapproved(items)`, `updateDeliveryInfo(items)`                                                                                                                                                                                                           |
| `products` life  | `delete(barcodes)`, `archive(barcodes)`, `unarchive(barcodes)`, `unlock(barcodes)`                                                                                                                                                                                                                                                 |
| `inventory`      | `update(items)` (stock + price, async batch)                                                                                                                                                                                                                                                                                       |
| `orders` read    | `list({...})`, `listStream({...})` (opaque cursor for >10K), `getCargoInvoiceItems(serial, {...})`                                                                                                                                                                                                                                 |
| `orders` write   | `updatePackageStatus(id, {...})`, `cancelPackageItem(id, {...})`, `extendDeliveryDate(id, 1\|2\|3)`, `processAlternativeDelivery(id, {...})`                                                                                                                                                                                       |
| `orders` split   | `splitPackage`, `splitPackageByQuantity`, `multiSplitPackage`, `splitMultiPackagesByQuantity` (4 variants)                                                                                                                                                                                                                         |
| `orders` cargo   | `changeCargoProvider(id, code)`, `manualDeliverByPackageId(id)`, `manualDeliverByTrackingNumber(trk)`, `markDeliveredByService(id)`                                                                                                                                                                                                |
| `orders` ops     | `updateBoxInfo(id, {...})`, `updateLaborCosts(id, items)`, `updateWarehouse(id, warehouseId)`                                                                                                                                                                                                                                      |
| `orders` returns | `manualReturnByPackageId(id)`, `manualReturnByTrackingNumber(trk)`, `getCompensationTickets({...})` (TEX)                                                                                                                                                                                                                          |
| `claims`         | `create({...})`, `createIssue(id, {...})` (multipart), `approveLineItems(id, {...})`, `list({...})`, `getIssueReasons()`, `getItemAudits(itemId)`                                                                                                                                                                                  |
| `webhooks`       | `create({...})`, `list()`, `update(id, {...})`, `delete(id)`, `activate(id)`, `deactivate(id)`                                                                                                                                                                                                                                     |
| `questions`      | `get(id)`, `list({...})`, `answer(id, text)`                                                                                                                                                                                                                                                                                       |
| `invoices`       | `uploadFile({shipmentPackageId, file, ...})` (multipart), `sendLink({...})`, `deleteLink({...})`                                                                                                                                                                                                                                   |
| `finance`        | `getSettlements({...})`, `getOtherFinancials({...})` — both return typed `FinancialTransaction[]`                                                                                                                                                                                                                                  |
| `labels`         | `createCommon(trackingNumber, {format: 'ZPL', ...})`, `getCommon(trackingNumber)`                                                                                                                                                                                                                                                  |
| `testOrders`     | `create({...})`, `updateStatus(id, status, { lines?, params? })`, `setClaimsWaitingInAction()` — **STAGE-only utility**                                                                                                                                                                                                            |
| `locations`      | `getCountries()`, `getTurkeyCities()`, `getTurkeyDistricts(cityId)`, `getTurkeyNeighborhoods(cityId, districtId)`, `getAzerbaijanCities()`, `getAzerbaijanDistricts(...)`, `getCitiesByCountry/getDistrictsByCity(...)`                                                                                                            |
| `exportCenter`   | `listProducts({...})`, `createProducts(items)`, `updatePrices(items)`, `updateStocks(items)`, `getBatchStatus(batchId)`, `listPackagesV2/V3({...})`, `getPackageItems({packageId, ...})`, `getCategoryAttributes(id)`, `getCareInstructions()`, `getCompositions()`, `getOrigins()` — **Trendyol Export Center / İhracat Merkezi** |
| `videos`         | `create({contentId, url, ...})`, `list({id?, sellerIntegrationStatus?, ...})` — product-page video upload + status                                                                                                                                                                                                                 |
| **top-level**    | `parseWebhookEvent(rawBody)`, `normalizeShipmentPackage(rawNode)` — for inbound webhook handlers                                                                                                                                                                                                                                   |

**Intentionally excluded:** `processAlternativeDeliveryDigital` (digital products only). Note: V1 endpoint sunset is N/A — Trendyol's V2 docs serve the same paths as V1, and the SDK already emits the V2 response shape (`nextPageToken` pagination, content-based variants).

## Install

```bash
pnpm add @lonca/trendyol @lonca/core
# or npm install / yarn add
```

`@lonca/core` is a peer dependency (error classes, the token-bucket limiter). The `paginate` / `paginateOffset` helpers and the `CursorPage` / `OffsetPage` types are re-exported from `@lonca/trendyol`, so you can import them straight from this package.

## Quick start

```ts
import { createTrendyolClient, paginate } from '@lonca/trendyol';

const client = createTrendyolClient({
  sellerId: 12345,
  apiKey: process.env.TRENDYOL_API_KEY!,
  apiSecret: process.env.TRENDYOL_API_SECRET!,
  env: 'stage', // or 'prod'
  integratorName: 'MyCompany', // required; use 'SelfIntegration' if the seller owns the integration code
});

for await (const product of paginate((p) => client.products.list(p))) {
  for (const variant of product.variants) {
    console.log(variant.barcode, product.title, variant.stock ?? '?');
  }
}
```

## End-to-end flows

### Create a product

The chain `brand → category → attributes (+ values) → addresses → create → poll → verify`:

```ts
const [brand] = await client.brands.search('TRENDYOLMİLLA');
const tree = await client.categories.list();
const category = findLeaf(tree, /Elbise/); // your own walker

const attrs = await client.categories.getAttributes(category.id);
const renk = attrs.find((a) => a.name === 'Renk')!;
const renkValues = await client.categories.getAttributeValues(category.id, renk.id);
const kirmizi = renkValues.items.find((v) => v.name === 'Kırmızı')!;

const addresses = await client.suppliers.getAddresses();
const shipment = addresses.find((a) => a.isShipmentAddress)!;
const returning = addresses.find((a) => a.isReturningAddress)!;

const { batchRequestId } = await client.products.create([
  {
    barcode: 'MY-SKU-001',
    title: 'Kırmızı Elbise',
    productMainId: 'MY-MAIN-001',
    brandId: Number(brand.id),
    categoryId: Number(category.id),
    quantity: 10,
    stockCode: 'MY-SC-001',
    dimensionalWeight: 1,
    description: '<p>...</p>',
    listPrice: 299.9,
    salePrice: 199.9,
    images: [{ url: 'https://cdn.example.com/dress.jpg' }],
    vatRate: 20,
    attributes: [{ attributeId: Number(renk.id), attributeValueIds: [Number(kirmizi.id)] }],
    shipmentAddressId: Number(shipment.id),
    returningAddressId: Number(returning.id),
  },
]);

// Poll the batch → detect approval.
let result;
do {
  await new Promise((r) => setTimeout(r, 2000));
  result = await client.products.getBatchStatus(batchRequestId);
} while (result.items[0]?.status === 'PROCESSING');

if (result.items[0]?.status === 'SUCCESS') {
  const base = await client.products.getBase('MY-SKU-001');
  console.log('Approved:', base.approved, 'contentId:', base.contentId);
}
```

### Handle inbound webhooks (Express)

Trendyol POSTs the same body shape as `getShipmentPackages` to your endpoint on status events. `parseWebhookEvent` returns typed `ShipmentPackage[]`:

```ts
import express from 'express';
import { parseWebhookEvent } from '@lonca/trendyol';

const app = express();

app.post('/trendyol/webhook', express.json(), (req, res) => {
  // Authenticate Trendyol against your endpoint here (Basic or x-api-key,
  // matching the auth method you configured on the subscription).

  const event = parseWebhookEvent(req.body);
  for (const pkg of event.packages) {
    // pkg: typed ShipmentPackage — same shape as orders.list()
    await myQueue.enqueue({
      packageId: pkg.id,
      orderNumber: pkg.orderNumber,
      status: pkg.status,
      createdBy: pkg.raw.createdBy, // 'order-creation' | 'cancel' | 'split' | 'transfer'
    });
  }
  res.sendStatus(200);
});

// Register the subscription once.
await client.webhooks.create({
  url: 'https://my-app.example.com/trendyol/webhook',
  authenticationType: 'API_KEY',
  apiKey: process.env.TRENDYOL_WEBHOOK_API_KEY!,
  subscribedStatuses: ['CREATED', 'SHIPPED', 'DELIVERED'],
});
```

> **Important:** Trendyol authenticates against _your_ endpoint with the auth method you choose. There's no HMAC signature — pick `API_KEY` over `BASIC_AUTHENTICATION` so you can rotate the secret without redeploying. Trendyol retries failed deliveries every 5 minutes and auto-deactivates the subscription after persistent failures (you'll get 2 emails). Call `webhooks.activate(id)` to bring it back online once your endpoint is healthy.

### Handle a return / claim

```ts
// 1. New customer-filed claims arrive via list().
const claims = await client.claims.list({ claimItemStatus: 'WaitingInAction' });

for (const claim of claims.items) {
  // 2a. Approve all the line items in the claim → triggers refund flow.
  await client.claims.approveLineItems(claim.id, {
    claimLineItemIdList: claim.raw.items.map((i: any) => i.id),
  });

  // 2b. OR reject the claim with a documented reason + supporting docs.
  const reasons = await client.claims.getIssueReasons();
  await client.claims.createIssue(claim.id, {
    claimIssueReasonId: reasons.find((r) => r.name.includes('kullanılmış'))!.id,
    claimItemIdList: claim.raw.items.map((i: any) => i.id),
    description: 'Ürün kullanılmış olarak iade edildi, retten kaynaklı reddediliyor.',
    files: [pdfBlob, photoBlob],
  });
}

// 3. After you've received the physical package back, mark it:
await client.orders.manualReturnByPackageId(packageId);
// or, if you only have the cargo tracking number:
await client.orders.manualReturnByTrackingNumber(trackingNumber);
```

### Reconcile settlements

```ts
const start = new Date('2026-05-01');
const end = new Date('2026-05-31');

for await (const tx of paginate((p) =>
  // `transactionType` is required (Trendyol 500s without it); `limit` is clamped to 500/1000.
  client.finance.getSettlements({ ...p, startDate: start, endDate: end, transactionType: 'Sale' }),
)) {
  // tx is a typed FinancialTransaction — no .raw drill required for documented fields
  if (tx.transactionType === 'Satış' && tx.orderNumber) {
    await db.recordSale({
      orderNumber: tx.orderNumber,
      revenue: tx.sellerRevenue ?? 0,
      commission: tx.commissionAmount ?? 0,
      transactionDate: tx.transactionDate,
    });
  }
}

// "Other financials" (cargo deductions, labor adjustments) share the same shape.
const cargoDeductions = await client.finance.getOtherFinancials({
  transactionType: 'DeductionInvoices',
});
```

## Per-resource cheat sheet

```ts
// brands
await client.brands.list({ limit: 1000 });
await client.brands.search('TRENDYOLMİLLA'); // substring + case-insensitive

// categories
const tree = await client.categories.list();
const attrs = await client.categories.getAttributes(catId);
const values = await client.categories.getAttributeValues(catId, attrId);
await client.categories.getByBarcodes(['BC1', 'BC2']); // requires AutoFT enrollment

// suppliers (cached 1h)
await client.suppliers.getAddresses();
await client.suppliers.getAddresses({ forceRefresh: true });

// products — read
await client.products.list({ barcode: 'BC1' });
await client.products.listInventoryAndPrice({ status: 'onSale', limit: 100 }); // stock + price only
await client.products.listUnapproved({ limit: 50 });
await client.products.getBase('BC1');
await client.products.getBuyboxInfo(['BC1', 'BC2']); // max 10 per call
await client.products.getBatchStatus(batchRequestId);

// products — write (all return { batchRequestId }; max 1000 items)
await client.products.create([
  /* CreateProductV2Input */
]);
await client.products.updateContent([{ contentId: 123, title: '...' }]);
await client.products.updateVariants([{ barcode: 'BC1', stockCode: 'NEW' }]);
await client.products.updateUnapproved([{ barcode: 'BC1', title: '...' /* fuller payload */ }]);
await client.products.updateDeliveryInfo([
  { barcode: 'BC1', deliveryOptions: { deliveryDuration: 3 } },
]);

// products — lifecycle
await client.products.delete(['BC1']); // separately rate-limited (100/min)
await client.products.archive(['BC1']); // PUT archived=true
await client.products.unarchive(['BC1']); // PUT archived=false
await client.products.unlock(['BC1']); // restore after Trendyol price-lock

// inventory — async batch
await client.inventory.update([
  { barcode: 'BC1', quantity: 50, salePrice: 199.9, listPrice: 299.9 },
]);

// orders — read
for await (const pkg of paginate((p) => client.orders.list(p))) { ... }
for await (const pkg of paginate((p) => client.orders.listStream({ ...p, packageItemStatuses: 'Created,Picking' }))) { ... }
await client.orders.getCargoInvoiceItems('INV-2026-001');

// orders — status / cargo
await client.orders.updatePackageStatus(pkgId, { status: 'Picking' });
await client.orders.updatePackageStatus(pkgId, { status: 'Invoiced' });
await client.orders.cancelPackageItem(pkgId, { lines: [{ lineId: 1, quantity: 1 }], reasonId: 577 });
await client.orders.extendDeliveryDate(pkgId, 2);
await client.orders.processAlternativeDelivery(pkgId, {
  isPhoneNumber: false,
  trackingInfo: 'https://my-cargo/track/abc',
  params: { provider: 'EXAMPLE_CARGO' },
});

// orders — splits (4 variants — see JSDoc)
await client.orders.splitPackage(pkgId, [lineId1, lineId2]);
await client.orders.splitPackageByQuantity(pkgId, [{ orderLineId: 100, quantities: [2, 2, 1] }]);
await client.orders.multiSplitPackage(pkgId, [{ orderLineIds: [3, 5] }, { orderLineIds: [7, 8] }]);
await client.orders.splitMultiPackagesByQuantity(pkgId, [
  { packageDetails: [{ orderLineId: 12345, quantities: 2 }] },
]);

// orders — cargo + manual delivery
await client.orders.changeCargoProvider(pkgId, 'ARASMP'); // open enum (see TrendyolCargoProvider)
await client.orders.manualDeliverByPackageId(pkgId);
await client.orders.manualDeliverByTrackingNumber(trackingNumber);
await client.orders.markDeliveredByService(pkgId);

// orders — operational metadata
await client.orders.updateBoxInfo(pkgId, { deci: 2.5, boxQuantity: 1 });
await client.orders.updateLaborCosts(pkgId, [{ orderLineId: 100, laborCostPerItem: 32.12 }]);
await client.orders.updateWarehouse(pkgId, warehouseId);

// orders — returns + compensation
await client.orders.manualReturnByPackageId(pkgId);
await client.orders.manualReturnByTrackingNumber(trackingNumber);
const tickets = await client.orders.getCompensationTickets({ startDate: lastMonth }); // TEX-only

// claims
await client.claims.create({
  orderNumber: 'ORD-1',
  claimItems: [{ barcode: 'BC1', quantity: 1, reasonId: 401 }],
});
await client.claims.createIssue(claimId, {
  claimIssueReasonId: 5,
  claimItemIdList: ['item-1', 'item-2'],
  description: '...',
  files: [pdfBlob],
});
await client.claims.approveLineItems(claimId, { claimLineItemIdList: ['line-1'] });
const claims = await client.claims.list({ claimItemStatus: 'WaitingInAction' });
const reasons = await client.claims.getIssueReasons();
const audits = await client.claims.getItemAudits(claimItemId);

// webhooks
const { id } = await client.webhooks.create({
  // CreateWebhookResult — `id` is the documented `{ id }`; `raw` is the untouched body
  url: 'https://my-app/hook',
  authenticationType: 'API_KEY',
  apiKey: 'rotatable-secret',
  subscribedStatuses: ['CREATED', 'SHIPPED'],
});
const subs = await client.webhooks.list();
await client.webhooks.update(id, { ...updated }); // MutationResult ({ raw }) — Trendyol answers 200 OK
await client.webhooks.delete(id);
await client.webhooks.activate(id);
await client.webhooks.deactivate(id);

// questions
const q = await client.questions.get(questionId);
const pending = await client.questions.list({ status: 'WAITING_FOR_ANSWER' });
const { answerId } = await client.questions.answer(questionId, 'Cevap metni (10–2000 chars).'); // AnswerQuestionResult

// invoices
await client.invoices.uploadFile({ shipmentPackageId: 100, file: pdfBlob });
await client.invoices.sendLink({ shipmentPackageId: 100, invoiceLink: 'https://x/i.pdf' });
await client.invoices.deleteLink({ serviceSourceId: 1, channelId: 2, customerId: 3 });

// finance — typed FinancialTransaction[]
await client.finance.getSettlements({ startDate, endDate, transactionType: 'Sale' }); // transactionType required
await client.finance.getOtherFinancials({ transactionType: 'DeductionInvoices' });

// labels
await client.labels.createCommon(trackingNumber, { format: 'ZPL', boxQuantity: 2 }); // MutationResult (200 OK, no body)
const label = await client.labels.getCommon(trackingNumber);
console.log(label.labels[0]?.label); // ZPL string

// test orders (STAGE-only)
const { orderNumber } = await client.testOrders.create({
  /* CreateTestOrderInput */
}); // CreateTestOrderResult — documented `{ orderNumber }`
await client.testOrders.updateStatus(pkgId, 'Shipped'); // MutationResult
await client.testOrders.updateStatus(pkgId, 'Delivered', {
  lines: [{ lineId, quantity: 1 }], // optional — the doc shows { lines, params, status }
  params: {},
});
await client.testOrders.setClaimsWaitingInAction({ shipmentPackageId }); // MutationResult; body optional

// videos
const { videoId } = await client.videos.create({ title, videoUrl, productContentIds }); // CreateVideoResult — documented `{ videoId }`

// locations (no sellerId — utility lookup)
const countries = await client.locations.getCountries();
const cities = await client.locations.getTurkeyCities();
const districts = await client.locations.getTurkeyDistricts(city.id); // pass ids, not codes
const neighborhoods = await client.locations.getTurkeyNeighborhoods(city.id, district.id); // Neighborhood: id, name, postCode
```

## Mutation results

No method returns a bare `unknown`. Every write / action call resolves to one of:

- a **documented typed shape** when Trendyol publishes a response body — `BatchAcceptedResponse` (`{ batchRequestId }`) for the async product writes, `CreateWebhookResult` (`{ id }`), `AnswerQuestionResult` (`{ answerId }`), `CreateVideoResult` (`{ videoId }`), `CreateTestOrderResult` (`{ orderNumber }`);
- a **`MutationResult`** (`{ raw: unknown }`, from `@lonca/core`) when the endpoint is documented as a bare `200 OK` or the body is undocumented — `webhooks.update/delete/activate/deactivate`, `labels.createCommon`, `testOrders.updateStatus/setClaimsWaitingInAction`, the claim/invoice mutations.

The typed results also extend `MutationResult`, so `.raw` is always the untouched body and the documented fields are optional (Trendyol occasionally answers `200 OK` with an empty body).

## Async batch + polling

Every write endpoint (`products.create`, `updateContent`, `updateVariants`, `updateUnapproved`, `updateDeliveryInfo`, `delete`, `archive`, `unarchive`, `unlock`, `inventory.update`) is **asynchronous**: Trendyol accepts the batch and returns a `{ batchRequestId }`. Poll the result with:

```ts
const status = await client.products.getBatchStatus(batchRequestId);
// status.status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
// status.items[].status: per-item outcome
```

**Important:** Trendyol's overall batch `status` can lag at `PROCESSING` even after each `items[].status` has settled. Trust the per-item status, or re-read the affected products via `list({ barcode })` / `getBase(barcode)` to verify the change landed. Batch results are retained for **4 hours** on Trendyol's side.

## Authentication

Trendyol uses HTTP Basic Auth. Get your `sellerId`, `apiKey`, and `apiSecret` from the [Trendyol Partner Panel → Account Info → Integration Information](https://partner.trendyol.com/account/info?tab=integrationInformation) (master-user only).

**Production vs Stage have different credentials.** Stage also requires IP whitelisting — register your CI/server IP with Trendyol support (0850 258 58 00). The SDK auto-sends the 5 mandatory headers (`Authorization`, `x-clientip`, `x-correlationid`, `x-agentname`, `User-Agent`).

## Environments

| Env     | Base URL                          | Notes                                         |
| ------- | --------------------------------- | --------------------------------------------- |
| `prod`  | `https://apigw.trendyol.com`      | No IP whitelist                               |
| `stage` | `https://stageapigw.trendyol.com` | IP whitelist required — call Trendyol support |

## Built-in robustness

- **Idempotency-aware retry with exponential backoff** — reads (`GET`) retry on 429 (honoring `Retry-After`), 5xx, and network/timeout errors. Writes (`POST`/`PUT`/`DELETE`) retry **only** on 429, which the server rejects before processing; ambiguous 5xx/network/timeout failures on a write are not replayed, so a transient error can't duplicate an order action or stock/price push. A `Retry-After: 0` no longer collapses backoff to an immediate retry.
- **Per-endpoint rate limiting** (token bucket) sized to Trendyol's documented limits — see defaults below; override per resource
- **Per-request correlation ID** — every call gets a UUID surfaced in log messages and the `x-correlationid` header for Trendyol-side log tracing
- **Structured errors** via `@lonca/core` (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
- **Edge-block detection**: a `401`/`403` answered with a non-JSON (HTML/text) body — e.g. Cloudflare's stage IP-allowlist block page — maps to `AuthError` ("check IP allowlisting / credentials / User-Agent"); the raw HTML is never attached to the error, only a `{ bodyKind, bodyLength }` hint on `error.data`
- **Client-side validation** before the network: empty batches, oversized batches (>1000 items), >10 buybox barcodes, ≤500-char claim descriptions, 10–2000-char Q&A answers — all throw `ValidationError`
- **Multipart upload support** — `claims.createIssue` and `invoices.uploadFile` build `FormData` internally and the transport handles `Content-Type` correctly
- **`AbortSignal` support** throughout

### Rate-limiter defaults

| Bucket       | Default capacity | Interval | Used by                                       |
| ------------ | :--------------: | :------: | --------------------------------------------- |
| `filter`     |       2000       |   60 s   | products filter / list                        |
| `batch read` |       1000       |   60 s   | products batch read, orders list, finance     |
| `buybox`     |       1000       |   60 s   | buybox lookups                                |
| `writes`     |       1000       |   60 s   | most write endpoints (create / update)        |
| `delete`     |       100        |   60 s   | DELETE endpoints                              |
| `categories` |        50        |   60 s   | categories list (cached by callers)           |
| `webhooks`   |        50        |   60 s   | webhook config CRUD                           |
| `suppliers`  |        1         |   1 h    | suppliers list (Trendyol caps this at 1/hour) |

Override per resource by passing a `TokenBucketRateLimiter` from `@lonca/core` when constructing the resource directly.

## Stability

`1.x` — stable. The Trendyol surface is feature-complete and verified read-only against the production API. Breaking changes ship only in major versions; see [Stability & versioning](https://lonca.zanaat.dev/stability/).

## License

MIT
