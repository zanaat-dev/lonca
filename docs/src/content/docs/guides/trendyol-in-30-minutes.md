---
title: Trendyol in 30 minutes
description: Zero to a working Trendyol integration — catalog reads, orders, stock/price writes, and webhooks — in one sitting.
---

You have a Trendyol seller account and half an hour. This walkthrough takes you from `pnpm add` to a running integration: reading your catalog, pulling last week's orders, pushing a stock/price update, and receiving order events over a webhook. Every snippet is copy-pasteable and uses the real exported API.

:::caution[Unofficial]
`@lonca/trendyol` is an independent, community-maintained SDK. It is not affiliated with, endorsed by, or supported by Trendyol. "Trendyol" and related names are trademarks of their respective owners.
:::

## 0–5 min: Install and authenticate

```bash
pnpm add @lonca/trendyol
```

Grab your credentials from the [Trendyol Partner Panel](https://partner.trendyol.com) → **Account Info → Integration Information**: the numeric seller (supplier) ID, the API key, and the API secret. Only the **master user** account can view them.

Put them in `.env` and build a client:

```ts
import { createTrendyolClient } from '@lonca/trendyol';

const client = createTrendyolClient({
  sellerId: Number(process.env.TY_SELLER_ID),
  apiKey: process.env.TY_API_KEY!,
  apiSecret: process.env.TY_API_SECRET!,
  env: 'prod', // 'prod' (no IP allowlist) or 'stage' (IP allowlist required)
  integratorName: 'SelfIntegration',
});
```

`integratorName` is **required** — Trendyol uses it to attribute API traffic, and sends it in the `User-Agent` / `x-agentname` headers the SDK builds for you. Use `'SelfIntegration'` if the seller owns the integration code, otherwise your company or product name (max 30 alphanumeric characters). Auth itself is HTTP Basic with the key/secret pair; the SDK handles the headers.

See the [Authentication guide](/authentication/) for the full credential story across both marketplaces.

## 5–10 min: Read your catalog

First call — list a page of approved products:

```ts
const firstPage = await client.products.list({ limit: 50 });
for (const product of firstPage.items) {
  console.log(product.title, product.brand?.name);
}
```

Every list endpoint returns `CursorPage<T>` — `items` plus an optional `nextCursor`. Don't hand-roll the loop; `paginate()` (re-exported from `@lonca/trendyol`, so you don't need a direct `@lonca/core` dependency) drives it as an async iterator:

```ts
import { paginate } from '@lonca/trendyol';

for await (const product of paginate((p) => client.products.list(p))) {
  for (const variant of product.variants) {
    console.log(variant.barcode, product.title);
  }
}
```

`paginateOffset()` is also re-exported for the `OffsetPage` shape (`totalCount` / `pageCount` envelopes) some endpoints use — the return type tells you which model you're holding.

:::note[The 10k cap]
Trendyol's page-based endpoints can only reach the first **10,000** records. `products.list()` switches to an opaque `nextPageToken` cursor under the hood, so it pages past 10k transparently. Page-based `orders.list()` cannot: the SDK guards the cap for you — `paginate()` stops emitting a cursor at the boundary instead of throwing mid-iteration, and a direct request past it throws `ValidationError`, steering you to `orders.listStream()` for full scans.
:::

## 10–18 min: Orders from the last 7 days

Orders arrive as **shipment packages** — the unit Trendyol actually ships. Filter by date (`Date` objects in, ms-epoch on the wire):

```ts
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

const recent = await client.orders.list({ startDate: sevenDaysAgo, limit: 100 });
for (const pkg of recent.items) {
  console.log(pkg.orderNumber, pkg.status, pkg.packageTotalPrice, pkg.currencyCode);
  for (const line of pkg.lines) {
    console.log('  ', line.barcode, line.productName, `x${line.quantity}`);
  }
}
```

Each package carries `lines[]` (barcode, name, quantity, unit price, discounts), customer and address blocks, cargo tracking, and the untouched `raw` payload.

### Status handling

`pkg.status` is Trendyol's raw vocabulary (`'Created'`, `'Picking'`, `'UnSupplied'`, …). Fold it into the marketplace-agnostic vocabulary with `normalizeStatus`:

```ts
import { normalizeStatus, statusMap, type ShipmentPackage } from '@lonca/trendyol';

function routePackage(pkg: ShipmentPackage) {
  const { normalized, raw, mapped } = normalizeStatus(pkg.status);
  if (!mapped) {
    // A status the SDK doesn't know yet: normalized === 'unknown' and
    // `raw` carries Trendyol's original string untouched — never coerced.
    console.warn('unrecognized Trendyol status:', raw);
    return;
  }
  switch (normalized) {
    case 'created': // accept the order, start picking
      break;
    case 'cancelled': // release reserved stock
      break;
  }
}

console.log(statusMap.Created); // 'created' — the full raw → normalized table
```

`statusMap` is the exhaustive table behind the normalizer; unknown raw values pass through as `{ normalized: 'unknown', mapped: false }` with the raw string preserved, so a new Trendyol status shows up in your logs instead of silently vanishing into a default.

## 18–25 min: Update stock and price

The write path is asynchronous on Trendyol's side. `inventory.update()` accepts up to 1,000 items per call — `barcode` is required, plus any of `quantity`, `salePrice`, `listPrice` (list ≥ sale):

```ts
const { batchRequestId } = await client.inventory.update([
  { barcode: '8680000000001', quantity: 42, salePrice: 199.9, listPrice: 249.9 },
  { barcode: '8680000000002', quantity: 0 },
]);
```

That `200` means **accepted, not applied**: Trendyol queues the batch and hands you a `batchRequestId`. (Product writes like `products.createProducts` work the same way and type this as `BatchAcceptedResponse` — same `{ batchRequestId }`, same polling loop.) Poll until the batch settles:

```ts
import { pollBatchStatus } from '@lonca/trendyol';

const settled = await pollBatchStatus((id) => client.products.getBatchStatus(id), batchRequestId, {
  pollIntervalMs: 2000,
  timeoutMs: 120_000,
});
console.log(settled.status, settled.failedItemCount); // 'COMPLETED' | 'FAILED'
```

Or let the SDK do both steps — chunk, submit, and poll every batch to a terminal state:

```ts
const results = await client.inventory.updateAndWait([{ barcode: '8680000000001', quantity: 40 }]);
for (const batch of results) {
  for (const item of batch.items) {
    if (item.status === 'FAILED') console.error(item.failureReasons);
  }
}
```

Why poll at all? Per-item failures (bad barcode, list price below sale price) only surface in the batch result — and Trendyol retains batch results for just **4 hours**, so check while you can. `pollBatchStatus` is standalone so you can also resume polling a `batchRequestId` persisted by an earlier process.

## 25–30 min: Webhooks

Stop polling for order changes — have Trendyol POST them to you. Register a subscription (max 15 per seller):

```ts
const created = await client.webhooks.create({
  url: 'https://api.example.com/trendyol/webhook',
  authenticationType: 'API_KEY', // or 'BASIC_AUTHENTICATION' with username/password
  apiKey: process.env.TY_WEBHOOK_KEY!,
});
console.log(created.id); // CreateWebhookResult — keep it for update/delete/activate
```

Trendyol now calls your endpoint on every subscribed status transition, authenticating with the method you configured. Parse the body with `parseWebhookEvent` — the wire shape is the same envelope as the orders list, so you get normalized `ShipmentPackage` objects back:

```ts
import { parseWebhookEvent } from '@lonca/trendyol';

const seen = new Set<string>();

function handleTrendyolWebhook(rawBody: unknown) {
  const { packages } = parseWebhookEvent(rawBody); // throws ValidationError on junk
  for (const pkg of packages) {
    const key = `${pkg.id}:${pkg.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routePackage(pkg);
  }
}
```

**Idempotency matters**: Trendyol delivers the full package payload every time (not a delta) and retries every 5 minutes on a non-2xx response — so key your processing on `(package id, status)` and make redelivery a no-op (a real deployment persists the keys instead of the in-memory `Set` above). Respond 2xx fast and do the work off the request path; after persistent failures Trendyol auto-deactivates the subscription (you get two emails) — bring it back with `client.webhooks.activate(id)`.

## Production checklist

**Errors are typed.** Everything the SDK throws is a `LoncaError` subclass from `@lonca/core`:

```ts
import { AuthError, RateLimitError, isLoncaError } from '@lonca/core';

try {
  await client.orders.list();
} catch (err) {
  if (err instanceof AuthError) {
    // 401 bad credentials — or a 401/403 with a *non-JSON* body, which means an
    // edge proxy (e.g. the stage IP allowlist) blocked you before the API.
  } else if (err instanceof RateLimitError) {
    // 429 — err.retryAfterMs is set when Trendyol sent Retry-After.
  } else if (isLoncaError(err)) {
    console.error(err.code, err.status, err.issues); // normalized error details
  } else {
    throw err;
  }
}
```

**Retries are built in.** The transport retries retryable failures (429, 5xx, network) up to 3 attempts with exponential backoff and jitter, honoring `Retry-After`. Non-idempotent writes only retry rate-limit errors — ambiguous outcomes are never re-sent. You rarely need your own retry loop; if you catch a `RateLimitError`, the built-in retries are already spent.

**`raw` is the escape hatch.** Mutations Trendyol documents as a bare `200 OK` return `MutationResult` — and every typed result extends it — so `.raw` always carries the untouched response body when you need something the typed shape doesn't surface:

```ts
const res = await client.webhooks.deactivate(created.id!);
console.log(res.raw); // whatever the gateway sent — usually undefined for 200 OK
```

**Test without the network.** `createFakeTrendyolClient` (from the `./testing` subpath) is the real client graph wired over a fake `fetch`, so tests exercise the SDK's actual request building and response normalization:

```ts
import { createFakeTrendyolClient } from '@lonca/trendyol/testing';

const fake = createFakeTrendyolClient({ batchRequestId: 'b-1', batchStatus: 'COMPLETED' });
const [result] = await fake.inventory.updateAndWait([{ barcode: 'X', quantity: 1 }], {
  pollIntervalMs: 1,
});
console.log(result?.status); // 'COMPLETED'
```

:::tip[Fake client in CI]
The fake client needs no credentials and never touches the network, so it runs in CI as-is. Seed a `handler` to script exact responses per request, or `batchStatus: 'FAILED'` to exercise your error paths — no mocking framework, no recorded fixtures.
:::

**Know what's stable.** `@lonca/trendyol` is 1.x: breaking changes ship only in major versions. The [Stability & versioning page](/stability/) has the details; coming from 0.x, read [Migrating to 1.0](/migrating-to-1-0/).

## See also

- [Trendyol guide](/guides/trendyol/) — the full resource-by-resource tour
- [Webhook events guide](/guides/webhook-events/) — both marketplaces' webhook models side by side
- [Authentication](/authentication/) — credentials, environments, `.env` layout
- [API reference](/api/readme/) — every exported function, class, and type
