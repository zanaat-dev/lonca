---
title: Trendyol guide
description: End-to-end usage of the @lonca/trendyol SDK — product catalog, orders, finance, claims.
---

`@lonca/trendyol` ships full coverage of Trendyol's published API surface. The repo's [`sdks/trendyol/README.md`](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/README.md) keeps the most up-to-date per-resource cheat sheet; this guide hits the highlights and points you at the most useful sections.

:::caution[Unofficial]
`@lonca/trendyol` is an independent, community-maintained SDK. It is not affiliated with, endorsed by, or supported by Trendyol. "Trendyol" and related names are trademarks of their respective owners.
:::

## Resources at a glance

| Resource       | What it covers                                                                   |
| -------------- | -------------------------------------------------------------------------------- |
| `brands`       | List all brands; resolve brand IDs by name.                                      |
| `categories`   | Category tree + per-category attributes.                                         |
| `suppliers`    | Seller-info read (rate-limited to 1 req/hour).                                   |
| `products`     | Read + create + update merchant products (incl. lightweight stock/price filter). |
| `inventory`    | Stock/price update + status polling.                                             |
| `orders`       | Order list, status transitions, package management.                              |
| `claims`       | Customer returns — list + accept/reject.                                         |
| `questions`    | Product questions on storefront — answer / reject.                               |
| `finance`      | Settlements + other financial transactions.                                      |
| `invoices`     | E-invoice flows.                                                                 |
| `labels`       | Shared cargo labels / barcodes.                                                  |
| `testOrders`   | Sandbox test order creation.                                                     |
| `locations`    | Country/city/district lookup.                                                    |
| `exportCenter` | Export Center (İhracat Merkezi) — cross-border catalog + packages.               |
| `videos`       | Product-page video upload + status.                                              |
| `webhooks`     | CRUD over webhook configurations + `parseWebhookEvent()` helper.                 |

## Quick start

```ts
import { createTrendyolClient } from '@lonca/trendyol';

const client = createTrendyolClient({
  sellerId: 12345,
  apiKey: process.env.TY_API_KEY!,
  apiSecret: process.env.TY_API_SECRET!,
  env: 'prod',
  integratorName: 'MyCompany',
});

const page = await client.brands.list({ limit: 50 });
for (const b of page.items) {
  console.log(b.id, b.name);
}
```

## Pagination

All list endpoints return `CursorPage<T>` with `items` + `nextCursor`. Use `paginate()` — re-exported from `@lonca/trendyol`, so you don't need a direct `@lonca/core` dependency — to iterate every page:

```ts
import { paginate } from '@lonca/trendyol';

for await (const brand of paginate((cursor) => client.brands.list({ limit: 50, cursor }))) {
  console.log(brand.id, brand.name);
}
```

:::note[Orders cap]
Trendyol's page-based `orders.list()` can only reach the first **10,000** records — requests past that offset return HTTP 429. `paginate()` stops cleanly at that boundary (it stops emitting a cursor) instead of throwing mid-iteration. For full scans, periodic syncs, or exports use `orders.listStream()`, which paginates with an opaque cursor and isn't subject to the cap (it exposes the last 3 months of orders).
:::

## Webhook events

Trendyol's webhook model is **body-discriminated** — a single endpoint receives every event, with `type` in the JSON body.

```ts
import express from 'express';
import { parseWebhookEvent } from '@lonca/trendyol';

const app = express();
app.use(express.json());

app.post('/ty/webhook', (req, res) => {
  const { packages, pageInfo } = parseWebhookEvent(req.body);
  for (const p of packages) {
    console.log(p.id, p.status);
  }
  res.status(200).end();
});
```

## Mutation results

Write / action methods never resolve to a bare `unknown`. When Trendyol documents a response body the SDK returns a typed shape — `BatchAcceptedResponse` (`{ batchRequestId }`) for async product writes, `CreateWebhookResult` (`{ id }`), `AnswerQuestionResult` (`{ answerId }`), `CreateVideoResult` (`{ videoId }`), `CreateTestOrderResult` (`{ orderNumber }`). Endpoints documented as a bare `200 OK` (webhook update/delete/activate/deactivate, `labels.createCommon`, test-order status updates, claim/invoice mutations) return `MutationResult` (`{ raw: unknown }`) from `@lonca/core`. The typed results extend `MutationResult`, so `.raw` is always the untouched body:

```ts
const { id } = await client.webhooks.create({ url, authenticationType: 'API_KEY', apiKey });
const res = await client.webhooks.deactivate(id);
console.log(res.raw); // whatever the gateway sent — usually undefined for 200 OK
```

## See also

- [`sdks/trendyol/README.md`](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/README.md) — full per-resource cheat sheet with method signatures
- [API Reference](/api/readme/) — exhaustive type information
- [`examples/try-trendyol.mts`](https://github.com/zanaat-dev/lonca/blob/main/examples/try-trendyol.mts) — read-only smoke script you can run against your own creds
