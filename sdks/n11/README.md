<p align="left">
  <img src="https://raw.githubusercontent.com/zanaat-dev/lonca/main/brand/logomark.svg" alt="Lonca" height="32">
</p>

# @lonca/n11

[![npm version](https://img.shields.io/npm/v/@lonca/n11.svg)](https://www.npmjs.com/package/@lonca/n11)

Type-safe TypeScript SDK for the [n11 seller API](https://developer.n11.com/documentation/). One client for n11's REST services and the SOAP services it still runs (questions, returns, partial cancels, invoice links, catalogue search, settlements) — **33 methods across 9 resources**, with no XML in your code and no SOAP dependency.

> [!IMPORTANT]
> **Unofficial.** This is an independent, community-maintained SDK. It is not affiliated with, endorsed by, or supported by n11. "n11" and related names are trademarks of their respective owners.

> [!NOTE]
> **0.x.** Reads are verified against a live seller account; product writes, settlements and order writes (approve, labour costs, both package splits, partial cancel, invoice link) against the test store n11 gives integrators, the order writes on a paid test order. Return decisions and the logistics collection request are verified up to n11's answer for a claim or package in the wrong state, so their success path follows n11's documentation. See [Stability & versioning](https://lonca.zanaat.dev/stability/).

## Coverage

| Resource     | Methods | Calls                                                                                                                                       |
| ------------ | ------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `products`   |       6 | `list`, `create`, `update`, `delete`, `getTask`, `waitForTask`                                                                              |
| `inventory`  |       2 | `update`, `updateAndWait` (price / stock tasks, chunks of 1000)                                                                             |
| `orders`     |       8 | `list`, `approve`, `splitPackage`, `splitPackageByQuantity`, `createCollectionRequest`, `updateLaborCosts`, `cancelItem`, `sendInvoiceLink` |
| `categories` |       2 | `list`, `getAttributes`                                                                                                                     |
| `catalog`    |       1 | `search`                                                                                                                                    |
| `questions`  |       3 | `list`, `get`, `answer`                                                                                                                     |
| `claims`     |       8 | `listReturns`, `listCancels`, reason lists ×3, `approveReturn`, `denyReturn`, `postponeReturn`                                              |
| `shipping`   |       1 | `getShipmentCompanies`                                                                                                                      |
| `finance`    |       2 | `listSettlements`, `getSettlementDetail` (daily payouts, per-line commission and fees, deferments)                                          |

Plus `normalizeStatus` (n11 package status → `@lonca/core` `NormalizedOrderStatus`), `n11Capabilities` and a fake client in `@lonca/n11/testing`.

Not covered, because n11 does not offer it over the API: webhooks, cargo label files (print the package's `cargoTrackingNumber` as a CODE-128 barcode instead, as n11 advises).

## Install

```bash
pnpm add @lonca/n11 @lonca/core
```

Node 22 or newer. ESM and CommonJS.

## Quick start

```ts
import { paginate } from '@lonca/core';
import { createN11Client } from '@lonca/n11';

const client = createN11Client({
  appKey: process.env.N11_APP_KEY!,
  appSecret: process.env.N11_APP_SECRET!,
  env: 'prod', // n11 has no public sandbox
  integratorName: 'MyCompany', // same value on every request
});

for await (const product of paginate((p) => client.products.list({ ...p, limit: 250 }))) {
  console.log(product.stockCode, product.quantity, product.salePrice);
}

const [task] = await client.inventory.updateAndWait([
  { stockCode: 'SKU-1', quantity: 12 },
  { stockCode: 'SKU-2', salePrice: 149.9, listPrice: 199 },
]);
console.log(task!.successCount, task!.failCount);
```

The [n11 guide](https://lonca.zanaat.dev/guides/n11/) walks through products, orders, questions, returns, errors and testing. Research notes, live findings and n11's answers to our questions are in [`RESEARCH.md`](RESEARCH.md).

## Things n11 does that you should know

- **Every product write is an async task.** Per-SKU failures arrive later, with HTTP 200, in task details. Create tasks can take ~15 minutes.
- **Client errors often come as HTTP 500** (`TASK_ERR_*`, Java exception names) **or HTTP 200** (SOAP `result.status: failure`). The SDK maps them to `ValidationError` / `NotFoundError` / `AuthError` so they are not retried.
- **No 429.** Requests milliseconds apart get your IP suspended; keep bulk work sequential.
- **`integratorName`** is free text with no registration, but n11 logs by it: keep it identical, including case and `I`/`ı`.
