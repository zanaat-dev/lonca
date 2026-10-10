---
title: Hepsiburada guide
description: End-to-end usage of the @lonca/hepsiburada SDK — full dev-portal coverage.
---

`@lonca/hepsiburada` covers every operation documented on [developers.hepsiburada.com](https://developers.hepsiburada.com) — 12 resources / 95 methods / live-verified against SIT. The repo's [`sdks/hepsiburada/README.md`](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/README.md) keeps the most up-to-date per-resource cheat sheet; this guide hits the highlights.

:::caution[Unofficial]
`@lonca/hepsiburada` is an independent, community-maintained SDK. It is not affiliated with, endorsed by, or supported by Hepsiburada. "Hepsiburada" and related names are trademarks of their respective owners.
:::

## Resources at a glance

| Resource         |        Methods | Source                         |
| ---------------- | -------------: | ------------------------------ |
| `listings`       |             18 | OpenAPI spec                   |
| `shipping`       |              4 | OpenAPI spec                   |
| `claims`         |              6 | OpenAPI spec                   |
| `testOrders`     | 1 _(SIT only)_ | OpenAPI spec                   |
| `orders`         |             28 | Dev-portal `/operations` API ★ |
| `categories`     |              3 | Dev-portal `/operations` API ★ |
| `catalog`        |             11 | Dev-portal `/operations` API ★ |
| `productUpdates` |              3 | Dev-portal `/operations` API ★ |
| `suppliers`      |              5 | Dev-portal `/operations` API ★ |
| `accounting`     |              1 | Dev-portal `/operations` API ★ |
| `questions`      |              6 | Dev-portal `/operations` API ★ |
| `promotions`     |              9 | Dev-portal `/operations` API ★ |

★ — Hepsiburada publishes machine-readable OpenAPI for only 5 of its 20 dev-portal products. The other 7 API-bearing products are typed from a hidden `/api/v1/public/docs/{co}/{slug}/{ver}/operations[/{opId}]` endpoint that returns the same OpenAPI shape.

## Quick start

```ts
import { createHepsiburadaClient } from '@lonca/hepsiburada';

const client = createHepsiburadaClient({
  merchantId: process.env.HB_MERCHANT_ID!,
  username: process.env.HB_API_USER!,
  password: process.env.HB_API_PASS!,
  env: 'sit', // or 'prod'
  integratorName: 'MyCompany',
});

const page = await client.listings.list({ offset: 0, limit: 100 });
for (const l of page.items) {
  console.log(l.hepsiburadaSku, l.merchantSku, l.availableStock, l.price);
}
```

## Bulk price update (async upload + polling)

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

for (const v of result.priceValidations ?? []) {
  console.warn(`${v.hepsiburadaSku}: ${v.type} ${v.minPrice}–${v.maxPrice}`);
}
```

The same pattern applies to `uploadInventory`, `uploadStock`, `uploadShippingInfo`, `uploadAdditionalInfo`.

## Order fulfillment lifecycle

```ts
// 1. Find paid orders awaiting packaging
const open = await client.orders.list({ limit: 100 });

// 2. Package + transition status. createPackages resolves to a PackageReceipt
//    ({ packageNumber, barcode, raw }); the transitions resolve to MutationResult ({ raw }).
const { packageNumber } = await client.orders.createPackages({
  lineItems: ['L1', 'L2'],
  cargoCompany: 'ARAS',
});
await client.orders.markPackageInTransit(packageNumber!, { trackingNumber: 'TR-456' });
await client.orders.markPackageDelivered(packageNumber!);

// 3. Reconcile invoice attachment
const missingInvoice = await client.orders.listMissingInvoicePackages({ limit: 100 });
console.log(`${missingInvoice.totalCount} shipped packages still missing invoice`);
```

## Returns & claims handling

```ts
// status is a strict union: NewRequest | Accepted | AwaitingAction | InDispute
//                         | Rejected | Refunded | Cancelled | AwaitingPreApproval
const awaiting = await client.claims.listByStatus('AwaitingAction', { limit: 100 });

for (const claim of awaiting) {
  await client.claims.accept(claim.claimNumber!, { reasonCode: 'APPROVED' });
}
```

## Casing quirks

Hepsiburada's hosts disagree on `merchantId` path-segment casing — the SDK picks the casing each host actually serves so you don't need to think about it:

| Host                       | Lowercase `/merchantid/` | CamelCase `/merchantId/` | SDK uses  |
| -------------------------- | :----------------------: | :----------------------: | --------- |
| `listing-external[-sit]`   |          ✓ 200           |          ✗ 400           | lowercase |
| `oms-external[-sit]`       |          ✓ 200           |          ✓ 200           | camelCase |
| `mpop[-sit]` (catalog)     |       n/a (query)        |            ✓             | camelCase |
| `shipping-external[-sit]`  |           n/a            |            ✓             | camelCase |
| `mpfinance-external[-sit]` |          ✓ 200           |          ✓ 200           | lowercase |

## Webhook events

Hepsiburada's webhook model is **endpoint-per-event** — Hepsiburada `PUT`s to `<baseUrl>/<eventName>` for each event. 8 order events + 4 claim events = 12 total.

```ts
import express from 'express';
import { parseHepsiburadaWebhookEvent, ORDER_WEBHOOK_EVENTS } from '@lonca/hepsiburada';

const app = express();
app.use(express.json());

for (const event of ORDER_WEBHOOK_EVENTS) {
  app.put(`/hb/${event}`, (req, res) => {
    const { body } = parseHepsiburadaWebhookEvent(event, req.body);
    // process the event...
    res.status(204).end();
  });
}
```

## See also

- [`sdks/hepsiburada/README.md`](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/README.md) — full per-resource cheat sheet with method signatures, wire-shape notes, and version history
- [API Reference](/api/readme/) — exhaustive type information
- [`examples/try-hepsiburada.mts`](https://github.com/zanaat-dev/lonca/blob/main/examples/try-hepsiburada.mts) — read-only smoke script
