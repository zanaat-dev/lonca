---
title: Hepsiburada in 30 minutes
description: Zero to a working Hepsiburada integration — listings and catalog reads, orders, stock/price uploads, and webhooks — in one sitting.
---

You have a Hepsiburada merchant account and half an hour. This walkthrough takes you from `pnpm add` to a running integration: reading your listings and catalog, pulling last week's orders, pushing a stock/price update, and receiving events over webhooks. Every snippet is copy-pasteable and uses the real exported API.

:::caution[Unofficial]
`@lonca/hepsiburada` is an independent, community-maintained SDK. It is not affiliated with, endorsed by, or supported by Hepsiburada. "Hepsiburada" and related names are trademarks of their respective owners.
:::

## 0–5 min: Install and authenticate

```bash
pnpm add @lonca/hepsiburada @lonca/core
```

`@lonca/core` holds the error classes you will catch later. The pagination helpers are re-exported from `@lonca/hepsiburada`, so you need the direct dependency only for the errors.

Grab your credentials from the [Hepsiburada Merchant Portal](https://merchant.hepsiburada.com) → **Settings → Integrations**: the merchant ID (UUID-shaped), the API username, and the API password. Put them in `.env` and build a client:

```ts
import { createHepsiburadaClient } from '@lonca/hepsiburada';

const client = createHepsiburadaClient({
  merchantId: process.env.HB_MERCHANT_ID!,
  username: process.env.HB_API_USER!,
  password: process.env.HB_API_PASS!,
  env: 'sit', // 'sit' (sandbox) or 'prod' — there is no default
  integratorName: process.env.HB_INTEGRATOR_NAME!, // sent as the User-Agent
});
```

All five options are required. Auth is HTTP Basic with the username/password pair; the SDK builds the headers and picks the right host for each resource (`*-sit.hepsiburada.com` on SIT, `*.hepsiburada.com` on prod).

:::caution[The User-Agent decides whether prod works]
`integratorName` is sent as the bare `User-Agent`. On prod it must be the **integrator name registered in your Merchant Portal**: an unrecognized value gets `401` / `403` on every call. SIT is more lenient, so a wrong name can pass in the sandbox and fail on the first prod deploy. Do not add the merchant ID to it.
:::

SIT is a sandbox with its own, sparse data. Empty pages there are normal; `client.testOrders.create()` seeds a test order on SIT only.

See the [Authentication guide](/authentication/) for the full credential story across all marketplaces.

## 5–12 min: Read your listings and catalog

Hepsiburada splits your products in two:

- **Listings** (`client.listings`) are your offers: price, stock, dispatch time, keyed by `hepsiburadaSku` and `merchantSku`.
- **Catalog** (`client.catalog`) is the product content and its matching state: title, brand, attributes, and whether Hepsiburada matched your SKU to a product.

First call — one page of listings. `offset` and `limit` are required:

```ts
const listingPage = await client.listings.list({ offset: 0, limit: 100 });
console.log(`${listingPage.totalCount} listings`);
for (const listing of listingPage.items) {
  console.log(listing.hepsiburadaSku, listing.merchantSku, listing.availableStock, listing.price);
}
```

Every list endpoint returns an `OffsetPage<T>`: `items`, `totalCount`, `limit`, `offset`, `pageCount`. Walk all pages with `paginateOffset()`, re-exported from `@lonca/hepsiburada`:

```ts
import { paginateOffset } from '@lonca/hepsiburada';

for await (const listing of paginateOffset(
  (p) => client.listings.list({ offset: p.offset ?? 0, limit: p.limit ?? 100 }),
  { limit: 100 },
)) {
  if (!listing.isSalable) {
    console.log('not salable:', listing.merchantSku, listing.deactivationReasons);
  }
}
```

For the catalog, `catalog.listProductsByStatus` filters by lifecycle status. `status` is **required**, in Hepsiburada's UPPER_SNAKE vocabulary (`'WAITING'`, `'MATCHED'`, `'MISSING_INFO'`, `'REJECTED'`, …):

```ts
const missingInfo = await client.catalog.listProductsByStatus({
  status: 'MISSING_INFO',
  limit: 100,
});
for (const product of missingInfo.items) {
  console.warn(product.merchantSku, product.title, product.rejectReasonsMessages);
}
```

The SDK throws `ValidationError` before sending when `status` is missing. It does not check the spelling: Hepsiburada answers HTTP `500` to an unknown or differently cased value such as `'Matched'`, and that reaches you as a `ServerError`. A status with no rows comes back as an empty page, not an error.

To read the whole catalog regardless of status, use `catalog.listProducts`. It takes `page` / `size`, or `offset` / `limit` so it plugs into `paginateOffset`:

```ts
for await (const product of paginateOffset((q) => client.catalog.listProducts(q), { limit: 100 })) {
  console.log(product.merchantSku, product.hbSku, product.status, product.brand);
}
```

:::note[Two row shapes]
`listProducts` and `listProductsByStatus` return different fields. `brand`, `images` and the attribute lists come from `listProducts` only; `rejectReasonsMessages`, `taskDetails` and `matchedHbProductInfo` from `listProductsByStatus` only. Each field's JSDoc in the [API reference](/api/readme/) says which endpoint fills it.
:::

## 12–20 min: Orders from the last 7 days

`orders.list` returns orders whose payment is complete. Filter by `beginDate` (`yyyy-MM-dd` or an ISO 8601 timestamp):

```ts
const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const recent = await client.orders.list({ beginDate: since, limit: 100 });
for (const line of recent.items) {
  console.log(
    line.orderNumber,
    line.id,
    line.merchantSku,
    `x${line.quantity}`,
    line.totalPrice?.amount,
  );
}
```

Each row is an **order line**, not an order: an order with two lines appears twice with the same `orderNumber`. `line.id` is the line item id that line-level actions take, and `totalPrice` is the line total. Group the lines yourself when you need whole orders:

```ts
import { type Order } from '@lonca/hepsiburada';

const byOrder = new Map<string, Order[]>();
for await (const line of paginateOffset((p) => client.orders.list({ ...p, beginDate: since }), {
  limit: 100,
})) {
  const key = line.orderNumber ?? 'unknown';
  byOrder.set(key, [...(byOrder.get(key) ?? []), line]);
}
console.log(`${byOrder.size} orders since ${since}`);
```

Every row also carries `raw`, the untouched wire object, for fields the typed shape does not surface.

### Status handling

`line.status` is Hepsiburada's raw string (`'Open'`, `'Unpacked'`, …). Fold it into the marketplace-agnostic vocabulary with `normalizeStatus`:

```ts
import { normalizeStatus, statusMap } from '@lonca/hepsiburada';

function routeLine(line: Order) {
  const { normalized, raw, mapped } = normalizeStatus(line.status ?? '');
  if (!mapped) {
    // Not in the SDK's known set: normalized === 'unknown', raw is untouched.
    console.warn('unrecognized Hepsiburada status:', raw);
    return;
  }
  if (normalized === 'cancelled') {
    // release reserved stock
  }
}

console.log(statusMap.Open); // 'created'
```

The known set is deliberately small (`Open`, `Shipped`, `Delivered`, `Cancelled`, `Returned`) because Hepsiburada types `status` as a free string. Anything else comes back with `mapped: false` and the raw string preserved, so a new status shows up in your logs instead of falling into a default.

## 20–26 min: Update stock and price

Stock and price are separate bulk uploads on the listings surface, each capped at 1,000 items per call. Key each row by `hepsiburadaSku` or `merchantSku`.

First, leave out listings Hepsiburada fulfils itself. For those (`isFulfilledByHB: true`) Hepsiburada's warehouse owns the stock figure; pushing your own overwrites it and can oversell:

```ts
const fulfilledByHb = new Set(
  listingPage.items.filter((l) => l.isFulfilledByHB).map((l) => l.hepsiburadaSku),
);

const stockRows = [
  { hepsiburadaSku: 'HBV00000000001', availableStock: 42 },
  { hepsiburadaSku: 'HBV00000000002', availableStock: 0 },
].filter((row) => !fulfilledByHb.has(row.hepsiburadaSku));

const { id: stockUploadId } = await client.listings.uploadStock(stockRows);
const { id: priceUploadId } = await client.listings.uploadPrice([
  { hepsiburadaSku: 'HBV00000000001', price: 199.9 },
]);
```

Each upload returns `{ id }` straight away. That means **accepted, not applied**: Hepsiburada processes the batch in the background. Poll the matching `get*Upload(id)` until the status leaves `'PROCESSING'`:

```ts
let stockResult = await client.listings.getStockUpload(stockUploadId);
while (stockResult.status === 'PROCESSING') {
  await new Promise((r) => setTimeout(r, 5000));
  stockResult = await client.listings.getStockUpload(stockUploadId);
}
for (const e of stockResult.errors) {
  console.error(`row ${e.elementNo} (${e.hepsiburadaSku}): ${e.errors?.join(', ')}`);
}

const priceResult = await client.listings.getPriceUpload(priceUploadId);
for (const v of priceResult.priceValidations ?? []) {
  console.warn(`${v.hepsiburadaSku}: ${v.type} ${v.minPrice}–${v.maxPrice}`);
}
```

Per-row failures only show up in the upload result, so always read it. Price uploads add `priceValidations[]` for rows that broke a floor or ceiling rule. The SDK has no built-in polling helper for Hepsiburada uploads; the loop above is all it takes. In production, add a timeout.

Other ways to write:

- `listings.uploadInventory` pushes stock, price and shipping fields in one upload.
- `listings.updateSingle(hepsiburadaSku, merchantSku, { newAvailableStock, newPrice })` changes one listing directly.
- `uploadShippingInfo` and `uploadAdditionalInfo` follow the same `{ id }` → poll pattern.

## 26–30 min: Webhooks

Hepsiburada's webhooks are **endpoint-per-event**: you give Hepsiburada one base URL, and it sends a `PUT` to `<baseUrl>/<eventName>` for each event. There are 12 events: 8 for orders (`ORDER_WEBHOOK_EVENTS`) and 4 for claims (`CLAIM_WEBHOOK_EVENTS`). The SDK has no method to register the URL; it gives you the event names and a parser.

Route each `PUT` to a handler and parse the body with `parseWebhookEvent`:

```ts
import {
  HEPSIBURADA_WEBHOOK_EVENTS,
  parseWebhookEvent,
  type HepsiburadaWebhookEvent,
} from '@lonca/hepsiburada';

function isHepsiburadaEvent(name: string): name is HepsiburadaWebhookEvent {
  return (HEPSIBURADA_WEBHOOK_EVENTS as readonly string[]).includes(name);
}

// Call this from your HTTP framework for every PUT <baseUrl>/<eventName>.
function handleHepsiburadaWebhook(eventName: string, rawBody: string | Record<string, unknown>) {
  if (!isHepsiburadaEvent(eventName)) return 404;
  const { event, body } = parseWebhookEvent(eventName, rawBody); // throws ValidationError on junk
  switch (event) {
    case 'createOrder': // a new paid order
      break;
    case 'orderCancel': // the buyer cancelled before shipment
      break;
    case 'awaitingAction': // a claim needs your accept / reject
      break;
  }
  console.log(event, Object.keys(body));
  return 204;
}
```

`body` is a `Record<string, unknown>`: Hepsiburada documents each event's fields in HTML tables on its developer portal, so the SDK does not type them. Answer with a 2xx within about 5 seconds and do the work off the request path. Hepsiburada may retry, so make processing idempotent: key it on the identifiers in the body and make a redelivery a no-op.

## Production checklist

**Errors are typed.** Everything the SDK throws is a `LoncaError` subclass from `@lonca/core`:

```ts
import { AuthError, RateLimitError, ValidationError, isLoncaError } from '@lonca/core';

try {
  await client.orders.list({ limit: 100 });
} catch (err) {
  if (err instanceof AuthError) {
    // 401: wrong username / password. 403: credentials, permissions, or the
    // User-Agent (integratorName) — check it matches the Merchant Portal.
  } else if (err instanceof RateLimitError) {
    // 429 — err.retryAfterMs is set when Hepsiburada sent Retry-After.
  } else if (err instanceof ValidationError) {
    // A client-side check failed before sending, or Hepsiburada answered 400 / 422.
    console.error(err.message, err.issues);
  } else if (isLoncaError(err)) {
    console.error(err.code, err.status, err.issues); // normalized error details
  } else {
    throw err;
  }
}
```

Hepsiburada's error bodies differ by service. The SDK maps them onto `err.issues` (`field` / `code` / `message` only) and keeps the untouched body on `err.data` for debugging.

**Rate limits and retries are built in.** Each resource has its own client-side token bucket (for example 600 requests/min for `listings`, 120 for `orders` and `catalog`); the [package README](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/README.md#rate-limiter-defaults) lists the defaults. Reads retry on 429, 5xx and network errors, up to 3 attempts with backoff, honoring `Retry-After`. Writes retry only on 429, so an upload or package action that may already have gone through is never sent twice. If you catch a `RateLimitError`, the built-in retries are already spent.

**Write results keep the raw body.** `orders.createPackages` resolves to a `PackageReceipt` (`packageNumber`, `barcode`); actions whose response Hepsiburada does not document resolve to `MutationResult`. Both carry `.raw`, the untouched response body.

**Test without the network.** `createFakeHepsiburadaClient` (from the `./testing` subpath) is the real client graph over a fake `fetch`, so tests exercise the SDK's actual request building and response mapping. Unseeded endpoints return empty pages; script the ones your test touches with `handler`:

```ts
import { createFakeHepsiburadaClient } from '@lonca/hepsiburada/testing';

const fake = createFakeHepsiburadaClient({
  handler: (req) =>
    req.path.includes('/listings/merchantid/')
      ? { listings: [{ listingId: 'L1', availableStock: 3 }], totalCount: 1, limit: 50, offset: 0 }
      : undefined,
});
const fakePage = await fake.listings.list({ offset: 0, limit: 50 });
console.log(fakePage.items[0]?.availableStock); // 3
```

The fake client needs no credentials and never touches the network, so it runs in CI as-is.

**Know what's stable.** `@lonca/hepsiburada` is 1.x: breaking changes ship only in major versions. The [Stability & versioning page](/stability/) has the details; coming from 0.x, read [Migrating to 1.0](/migrating-to-1-0/).

## See also

- [Hepsiburada guide](/guides/hepsiburada/) — packaging, claims, and the per-host casing table
- [`sdks/hepsiburada/README.md`](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/README.md) — every resource and method, with wire-shape notes
- [Webhook events guide](/guides/webhook-events/) — both marketplaces' webhook models side by side
- [Authentication](/authentication/) — credentials, environments, `.env` layout
- [API reference](/api/readme/) — every exported function, class, and type
