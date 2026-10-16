---
title: Migrating to 1.0
# Without an explicit slug the dot is dropped and the URL becomes /migrating-to-10/.
slug: migrating-to-1-0
description: What changes when you upgrade @lonca/core, @lonca/trendyol, @lonca/hepsiburada and @lonca/n11 from 0.x to 1.0 — and what 1.x has deprecated since.
---

`@lonca/core`, `@lonca/trendyol` and `@lonca/hepsiburada` reached 1.0 on 30 August 2026, `@lonca/n11` on 16 October 2026. This page collects what an upgrade from 0.x involves. Every item comes from the package changelogs and links to the release that made the change: 1.x releases to the [release notes](/en/changelog/), 0.x releases to each package's `CHANGELOG.md` on GitHub.

## The short answer

If you are on the last 0.x release of each package, **nothing changes**. Each 1.0.0 has the same public API as the release before it:

| Package              | Last 0.x | First 1.x | Code changes |
| -------------------- | -------- | --------- | ------------ |
| `@lonca/core`        | 0.7.0    | 1.0.0     | None         |
| `@lonca/trendyol`    | 0.15.1   | 1.0.0     | None         |
| `@lonca/hepsiburada` | 0.13.1   | 1.0.0     | None         |
| `@lonca/n11`         | 0.4.0    | 1.0.0     | None         |

One behaviour changed in [`@lonca/trendyol` 1.0.0](/en/changelog/#trendyol-1.0.0): `webhooks.*` now calls Trendyol's documented `/integration/webhook/sellers/{sellerId}/webhooks` path. The old `/integration/sellers/{sellerId}/webhooks` path is not routed on production (the gateway answers 556). You change nothing; webhook calls that failed on production now work.

Upgrade the packages you use:

```bash
pnpm add @lonca/core@^1 @lonca/trendyol@^1 @lonca/hepsiburada@^1
```

From 1.0 on, breaking changes ship only in major versions and deprecated APIs keep working until the next major. See [Stability & versioning](/stability/).

## Coming from an older 0.x

If you skipped releases, these are the changes you could trip over, newest first. Purely additive changes (new methods, new optional fields) are left out.

### `@lonca/core`

- **CommonJS type resolution** ([1.0.0](/en/changelog/#core-1.0.0)). The `exports` maps declare types per condition: `import` resolves `dist/index.d.ts`, `require` resolves `dist/index.d.cts`. The same fix shipped for the SDKs, including their `./testing` subpath, in [`@lonca/trendyol` 0.15.1](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#0151) and [`@lonca/hepsiburada` 0.13.1](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#0131). Runtime behaviour is unchanged.
- **`moneyFromMajor` rounds in decimal space** ([0.5.0](https://github.com/zanaat-dev/lonca/blob/main/packages/core/CHANGELOG.md#050)). `moneyFromMajor(1.255, TRY)` is now `126` (was `125`) and `1.005` is `101` (was `100`). Non-finite input throws a `TypeError` instead of producing `NaN`.
- **Writes are not retried on ambiguous failures** ([0.4.0](https://github.com/zanaat-dev/lonca/blob/main/packages/core/CHANGELOG.md#040)). A `POST` / `PUT` / `PATCH` / `DELETE` that times out, gets a 5xx, or hits a network error is no longer retried, because it may already have been applied. Only 429 is retried for writes; `GET` retries as before. A `Retry-After: 0` header no longer causes an immediate retry.

### `@lonca/trendyol`

- **Typed mutation results** ([0.15.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#0150), [0.14.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#0140)). No method returns `Promise<unknown>` any more. Where Trendyol documents a body, you get a typed result (`webhooks.create` → `CreateWebhookResult`, `questions.answer` → `AnswerQuestionResult`, `videos.create` → `CreateVideoResult`, `testOrders.create` → `CreateTestOrderResult`); everything else returns `MutationResult`. All of them carry the untouched body on `.raw`:

  ```diff
  - const body = (await client.claims.create(input)) as MyClaimResponse;
  + const body = (await client.claims.create(input)).raw;
  ```

- **Non-JSON 401/403 is an `AuthError`** ([0.15.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#0150)). A 401/403 with an HTML or text body, such as the block page from the stage IP allowlist, used to be a `ValidationError`. If you caught that case as `ValidationError`, catch `AuthError`.
- **Finance needs `transactionType`** ([0.13.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#0130)). `finance.getSettlements` and `getOtherFinancials` throw `ValidationError` without it (Trendyol answers 500), and `limit` is clamped to 500 or 1000 (default 500).
- **Location lookups take `id`, not `code`** ([0.13.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#0130)). `City`, `District` and `Neighborhood` expose `id`, and the district/neighborhood lookups key off it:

  ```diff
  - await client.locations.getTurkeyDistricts(city.code);
  + await client.locations.getTurkeyDistricts(city.id);
  ```

- **The 10,000-record cap on `orders.list`** ([0.11.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#0110), [0.11.1](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#0111)). A request past the cap throws `ValidationError`, and `paginate()` stops at the cap instead of throwing mid-loop. Use `orders.listStream()` for full scans.
- **`inventory.update` throws when no batch id comes back** ([0.10.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#0100)). You get a `ServerError` instead of `{ batchRequestId: '' }`.
- **Resource constructors lost the `sellerId` argument** ([0.8.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#080)). This only matters if you build resources yourself; `createTrendyolClient` users are unaffected.

  ```diff
  - new OrdersResource(transport, sellerId, limiter)
  + new OrdersResource(transport, limiter)
  ```

- **`integratorName` is required** ([0.7.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#070)). It used to default to `'SelfIntegration'`; pass it explicitly.

### `@lonca/hepsiburada`

- **Catalog lists return an `OffsetPage`** ([0.13.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#0130)). `catalog.listProducts` and `catalog.listProductsByStatus` return `OffsetPage<CatalogProduct>` instead of an array:

  ```diff
  - const rows = await client.catalog.listProducts();
  + const rows = (await client.catalog.listProducts()).items;
  ```

- **`listProductsByStatus` requires `status`** ([0.13.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#0130)). Before 0.13.0 every call failed with HTTP 500, because the SDK sent the wrong query parameter. `status` is now required (missing → `ValidationError`) and must use Hepsiburada's UPPER_SNAKE values (`'MATCHED'`, `'WAITING'`, …). The `'Active'` / `'WaitingApproval'` values documented earlier were never accepted.
- **Five resources moved to their real hosts** ([0.13.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#0130)). `accounting`, `suppliers`, `questions`, `promotions` and `productUpdates` used to go through `oms-external`, where every call failed with 401/404. They now reach their own services and can return data, or real errors such as a supplier-enrollment 404. Request shapes changed with them:
  - `questions.list()` pages with `page` / `size` and filters with `minCreatedAt` / `maxCreatedAt`. The old `offset` / `limit` / `beginDate` / `endDate` still work as deprecated aliases.
  - `accounting.listTransactions()` needs either an identifier filter or a date range of at most one month. `beginDate` / `endDate` are deprecated aliases of `orderDateStart` / `orderDateEnd`.
  - `promotions.listDiscounts()` sends `page` / `pagesize` (defaults `1` / `100`).
- **Typed mutation results** ([0.13.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#0130), [0.12.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#0120)). No method returns `Promise<unknown>` any more. `orders.createPackages` returns a `PackageReceipt`, the `promotions.create*Discount` methods a `DiscountReceipt`, the supplier searches a `SupplierSearchResult`, and actions without a documented body a `MutationResult`. The migration is the same one line as for Trendyol: `(await x) as T` becomes `(await x).raw`, or read the typed fields.
- **`categories.list` is an `OffsetPage` too** ([0.13.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#0130)). `CatalogPage<T>` extends `OffsetPage<T>`. The Spring fields are still there but deprecated: `.data` → `.items`, `.totalElements` → `.totalCount`, `.totalPages` → `.pageCount`.
- **`CatalogProduct.id` is optional** ([0.13.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#0130)). It used to be an `''` placeholder; guard with `if (product.id)` where you relied on the empty string.
- **Reads that returned `[]` now return rows** ([0.11.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#0110)). `catalog.listProducts` / `listProductsByStatus`, `shipping.getCargoFirms` / `listProfiles` and `categories.getAttributes` dropped every row because of unhandled response envelopes. `getAttributes` now flattens Hepsiburada's three attribute buckets into one list, each tagged with `group`. `claims.list` / `listByStatus` default `offset` / `limit` to `0` / `100`.
- **`listings.list` returns an `OffsetPage`** ([0.9.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#090)):

  ```diff
  - const { listings } = await client.listings.list({ offset: 0, limit: 100 });
  + const { items: listings } = await client.listings.list({ offset: 0, limit: 100 });
  ```

- **Fixed 403 error message** ([0.9.2](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#092)). The `AuthError` for a 403 carries a fixed message instead of echoing the server's; the body stays on `error.data` / `cause`. Code that matched on the server's message text needs updating.
- **Export cleanup** ([0.7.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/hepsiburada/CHANGELOG.md#070)). `parseWebhookEvent` is the canonical name; `parseHepsiburadaWebhookEvent` is a deprecated alias. `HepsiburadaTransport`, `RequestOptions`, `TransportConfig` and `HepsiburadaService` are no longer exported.

### `@lonca/n11`

Every 0.x release only added to the API (resources, methods and fields), so code written against any 0.x release runs unchanged on 1.0. What 0.x added, release by release, is in [`CHANGELOG.md`](https://github.com/zanaat-dev/lonca/blob/main/sdks/n11/CHANGELOG.md).

## Deprecated in 1.x

These still work and stay until the next major. Most are fields the marketplace never sends, so they were always `undefined` or filled from the real field. Your editor shows them struck through.

**`@lonca/core`**: nothing deprecated.

**`@lonca/trendyol`**

- [1.2.2](/en/changelog/#trendyol-1.2.2): `ShipmentPackage.whoPays`.
- [1.2.0](/en/changelog/#trendyol-1.2.0): `Neighborhood.code` and `districtCode`, `District.cityCode`, `SupplierAddress.name` and `fullName` (use `fullAddress`), `CategoryAttribute.values` (use `categories.getAttributeValues`).
- From 0.x: `SettlementRow` and `OtherFinancialRow`, aliases of `FinancialTransaction` ([0.6.0](https://github.com/zanaat-dev/lonca/blob/main/sdks/trendyol/CHANGELOG.md#060)).

**`@lonca/hepsiburada`**

- [1.2.0](/en/changelog/#hepsiburada-1.2.0): `Question.number`, `productSku` and `createdDate` (use `issueNumber`, `product.sku`, `createdAt`); `Question.text` and `answer` (read `conversations`).
- [1.1.0](/en/changelog/#hepsiburada-1.1.0): `Order.externalOrderNumber`, `modifiedDate` and `total`; `AccountingTransaction.transactionId`, `type`, `amount`, `currency` and `transactionDate`; 15 `CatalogProduct` fields Hepsiburada never sends (`id`, `createdAt`, `modifiedAt`, `productQuality`, `fields`, …); `CategoryAttribute.externalName` and `values` (use `categories.getAttributeValues`).
- From 0.x: `parseHepsiburadaWebhookEvent`, the `OrdersPage` and `ListingsPage` type aliases (use `OffsetPage`), the Spring fields on `CatalogPage`, the `questions.list` and `accounting.listTransactions` parameter aliases above, and `ListProductsByStatusParams.modifiedAtSince`, which is no longer sent.

The changelog entry for each version lists the replacement for every deprecated field.
