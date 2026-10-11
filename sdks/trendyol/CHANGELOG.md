# @lonca/trendyol

## 1.2.2

### Patch Changes

- [#193](https://github.com/zanaat-dev/lonca/pull/193) [`b940642`](https://github.com/zanaat-dev/lonca/commit/b94064245582debf86e36d41cdf923a84ab7b69f) Thanks [@keparlak](https://github.com/keparlak)! - `ShipmentPackage.whoPays` is deprecated. The field is not in Trendyol's documentation and does not appear in production order data. It is still passed through when Trendyol sends it, and will be removed in the next major version.

## 1.2.1

### Patch Changes

- [#192](https://github.com/zanaat-dev/lonca/pull/192) [`853f459`](https://github.com/zanaat-dev/lonca/commit/853f45980ecaa8645045d9f34d7add027cc2bee1) Thanks [@keparlak](https://github.com/keparlak)! - Package metadata and README links point to the project's new home: the repository moved to [github.com/zanaat-dev/lonca](https://github.com/zanaat-dev/lonca) and the docs to [lonca.zanaat.dev](https://lonca.zanaat.dev). Old GitHub URLs keep redirecting. No code changes.
- Updated dependencies [[`70938e6`](https://github.com/zanaat-dev/lonca/commit/70938e652a643ac45baf3cbeb400e4ca2874447d)]:
  - @lonca/core@1.1.0

## 1.2.0

### Minor Changes

- [#171](https://github.com/loncadev/lonca/pull/171) [`181d586`](https://github.com/loncadev/lonca/commit/181d58618e700dd53f2c7d59916fa84f1cdafdb6) Thanks [@keparlak](https://github.com/keparlak)! - Map the fields Trendyol actually sends for locations, supplier addresses and category attributes, checked against the docs and the prod wire baseline (2026-10-10). Fields the SDK used to read but that neither the docs nor prod ever carry stay on the public types, now `@deprecated` (no type was removed or narrowed).
  
  - `Neighborhood.postCode` (new): the neighborhood's postal code, present on prod neighborhood rows (not in the docs). `Neighborhood.code` is deprecated (neighborhood rows have no code; it always equals `id`) and `Neighborhood.districtCode` is deprecated (always `undefined`).
  - `District.cityCode` is deprecated: district rows carry no city reference, so it was always `undefined`. `District.code` keeps reading the wire `code`.
  - `SupplierAddress` gains `fullAddress`, `country`, `cityCode` and `districtId` (documented and present on prod). `SupplierAddress.name` and `fullName` are deprecated (Trendyol sends neither; use `fullAddress`).
  - `suppliers.getAddresses()` now upper-cases `addressType` before matching, so the documented `Shipment` / `Invoice` / `Returning` values map to `SHIPMENT` / `INVOICE` / `RETURNING`. Before, mixed-case values fell back to `SHIPMENT`.
  - `CategoryAttribute.values` is deprecated and always `[]`: `getAttributes` has no inline value list (no `attributeValues` in the docs or on prod). Use `categories.getAttributeValues(categoryId, attributeId)`.

## 1.1.0

### Minor Changes

- [#163](https://github.com/loncadev/lonca/pull/163) [`2e7491a`](https://github.com/loncadev/lonca/commit/2e7491a49fae1005957f2d91002c1ec50f7c2f5a) Thanks [@keparlak](https://github.com/keparlak)! - `createTrendyolClient` and `createHepsiburadaClient` accept an optional `fetch` implementation (e.g. to add a proxy agent, or to record or mock traffic). It defaults to the global `fetch`, so existing code is unaffected.

- [#167](https://github.com/loncadev/lonca/pull/167) [`4fcb527`](https://github.com/loncadev/lonca/commit/4fcb52703df0586462da41ae46c51c66e9a4a3e0) Thanks [@keparlak](https://github.com/keparlak)! - Fix `brands.list` pagination: `paginate((p) => client.brands.list(p))` used to stop after the first page, because the SDK waited for a `totalPages` field that Trendyol never sends. When the response has no page count, a full page now sets `nextCursor` (a short page is the last one); a `totalPages` value is still honoured if present.
  
  - `Brand` gains an optional `luxe` flag (Trendyol's luxury-brand marker, present on prod brand rows), on both `brands.list` and `brands.search`.
  - `City.countryCode` is now filled with the country of the lookup (`'TR'`, `'AZ'`, or the `getCitiesByCountry` argument). Trendyol's city rows have no country field, so it was always `undefined` before.

## 1.0.1

### Patch Changes

- [#158](https://github.com/loncadev/lonca/pull/158) [`875a4aa`](https://github.com/loncadev/lonca/commit/875a4aacdee80ed6a420a35da0241728a1cfe9f2) Thanks [@keparlak](https://github.com/keparlak)! - `videos.list()` now reads rows from the documented `{ meta, data: [...] }` response envelope; previously it returned `[]` for that shape. `SellerIntegrationStatus` now lists the documented values `IN_PROGRESS | SUCCESS | FAILED` (it remains an open union, so other strings still type-check).

## 1.0.0

### Major Changes

- [#139](https://github.com/loncadev/lonca/pull/139) [`da9ff38`](https://github.com/loncadev/lonca/commit/da9ff38928b5a953bad249fe740bd263f3e5f50a) Thanks [@keparlak](https://github.com/keparlak)! - First stable release. The public API is identical to the previous minor —
  upgrading requires no code changes. From 1.0.0 on, `@lonca/trendyol` follows the
  stability policy documented at https://loncadev.github.io/lonca/stability/:
  breaking changes only in major versions, deprecations announced at least two
  minors before removal, and the exported API surface is locked in CI.
  
  Verified read-only against the production API (seller account, 2026-08-30): all
  nine contract probes — products, orders, categories, brands, locations,
  questions, claims, finance settlements, and webhooks — answer 200 with the
  snapshotted shapes.
  
  One behavioural fix is folded in: `webhooks.*` now calls Trendyol's documented
  `/integration/webhook/sellers/{sellerId}/webhooks` path. The previous
  `/integration/sellers/{sellerId}/webhooks` path is not routed on production
  (the gateway answers a host-level 556); the documented path answers 200.
  Verified live on production for `webhooks.list()`.

### Patch Changes

- Updated dependencies [[`da9ff38`](https://github.com/loncadev/lonca/commit/da9ff38928b5a953bad249fe740bd263f3e5f50a)]:
  - @lonca/core@1.0.1

## 0.15.1

### Patch Changes

- [#136](https://github.com/loncadev/lonca/pull/136) [`e09d4d5`](https://github.com/loncadev/lonca/commit/e09d4d52b89d42d7cbdde34b2c82b46193274146) Thanks [@keparlak](https://github.com/keparlak)! - Fix TypeScript type resolution for CommonJS consumers ("Masquerading as ESM"):
  the `exports` maps now declare per-condition types (`import` resolves
  `dist/index.d.ts`, `require` resolves `dist/index.d.cts`, including the SDKs'
  `./testing` subpath). Runtime behaviour is unchanged; `publint` and
  `arethetypeswrong` now verify the packages in CI.
- Updated dependencies [[`e09d4d5`](https://github.com/loncadev/lonca/commit/e09d4d52b89d42d7cbdde34b2c82b46193274146), [`e09d4d5`](https://github.com/loncadev/lonca/commit/e09d4d52b89d42d7cbdde34b2c82b46193274146)]:
  - @lonca/core@1.0.0

## 0.15.0

### Minor Changes

- [#128](https://github.com/loncadev/lonca/pull/128) [`0c0436b`](https://github.com/loncadev/lonca/commit/0c0436b2d183edb341b00cc26ddf3b1ad4de37f6) Thanks [@keparlak](https://github.com/keparlak)! - Map non-JSON 401/403 responses to `AuthError`, and add typed hints to
  `CreateVideoInput` and `testOrders.updateStatus`.
  
  - A `401`/`403` whose body is not JSON — e.g. the Cloudflare block page served
    when the stage IP allowlist rejects the caller — now maps to `AuthError`
    ("Trendyol rejected the request before it reached the API (HTTP 403,
    non-JSON body) — check IP allowlisting / credentials / User-Agent") instead
    of `ValidationError` (`VALIDATION_FAILED`). The raw HTML/text body is never
    attached to the error: `error.data` carries only a `{ bodyKind, bodyLength }`
    hint. JSON 401/403 bodies keep their existing mapping.
  - `CreateVideoInput` is now a typed hint per the seller video API doc
    (`title`, `description`, `videoUrl`, `productContentIds`,
    `videoContentType` — new `VideoContentType` open union) while keeping the
    `Record<string, unknown>` passthrough, so existing call sites compile
    unchanged.
  - `testOrders.updateStatus(packageId, status, { lines?, params? })` — the
    test-order status doc shows a `{ lines, params, status }` body; pass the new
    optional third argument (`UpdateTestOrderStatusOptions`, with
    `TestOrderStatusLine` rows) to send it. Called with two arguments the body
    stays `{ status }` exactly as before. `TestOrderStatus` gains the documented
    `'AtCollectionPoint'` value.

- [#125](https://github.com/loncadev/lonca/pull/125) [`bce085f`](https://github.com/loncadev/lonca/commit/bce085f942602495be919a8cb57b4b2604c26e63) Thanks [@keparlak](https://github.com/keparlak)! - The last eleven `Promise<unknown>` methods now return a typed result. Where Trendyol
  documents a response body the SDK surfaces it as a small typed interface (every one
  of them extends `MutationResult`, so `.raw` is still the untouched body and the
  documented field is optional); where the docs show a bare `200 OK` the method
  returns `MutationResult` (`{ raw: unknown }`) from `@lonca/core`:
  
  - `webhooks.create` → `CreateWebhookResult` (`{ id?: string }`, documented `{ id }`)
  - `webhooks.update` / `delete` / `activate` / `deactivate` → `MutationResult`
  - `questions.answer` → `AnswerQuestionResult` (`{ answerId?: number }`, documented `{ answerId }`)
  - `videos.create` → `CreateVideoResult` (`{ videoId?: string }`, documented `{ videoId }`)
  - `labels.createCommon` → `MutationResult`
  - `testOrders.create` → `CreateTestOrderResult` (`{ orderNumber?: string }`, documented `{ orderNumber }`)
  - `testOrders.updateStatus` / `setClaimsWaitingInAction` → `MutationResult`
  
  `testOrders.setClaimsWaitingInAction` also accepts an optional
  `{ shipmentPackageId }` body (`SetClaimsWaitingInActionInput`), which is what
  Trendyol's test-order status doc shows for that endpoint; omitted, the call is
  unchanged.
  
  Migration is one line — `unknown` already forced a cast, so
  `(await x) as T` → `(await x).raw` (or read the documented field directly:
  `(await client.webhooks.create(...)).id`).

## 0.14.0

### Minor Changes

- [#91](https://github.com/loncadev/lonca/pull/91) [`e9a3332`](https://github.com/loncadev/lonca/commit/e9a3332cb939071f7b53b0ae34a3fb190d1f5833) Thanks [@keparlak](https://github.com/keparlak)! - Add a shared `ProductContentBase` interface, extended by both `Product` and
  `UnapprovedProduct`, so callers can read the common content surface
  (`productMainId`, `title`, `description`, `brand`, `category`, `images`,
  `attributes`) from either shape without branching (feedback item 8). The concrete
  types are otherwise unchanged — `Product` keeps `variants[]`, `UnapprovedProduct`
  stays flat — so this is purely additive.

  Also clarified `products.list` docs: it returns **approved products only** (use
  `listUnapproved` for drafts), and its date fields are ISO 8601 **strings**.

- [#89](https://github.com/loncadev/lonca/pull/89) [`24f63e2`](https://github.com/loncadev/lonca/commit/24f63e24384fc352a1eaafede84384a439e14c9d) Thanks [@keparlak](https://github.com/keparlak)! - The claim and invoice mutation methods (`claims.create` / `createIssue` /
  `approveLineItems`, `invoices.uploadFile` / `sendLink` / `deleteLink`) now return a
  `MutationResult` (`{ raw: unknown }`) instead of bare `unknown` — the API response
  is on `.raw`. `unknown` already forced a cast, so this is a one-line migration.

### Patch Changes

- Updated dependencies [[`24f63e2`](https://github.com/loncadev/lonca/commit/24f63e24384fc352a1eaafede84384a439e14c9d)]:
  - @lonca/core@0.7.0

## 0.13.0

### Minor Changes

- [#88](https://github.com/loncadev/lonca/pull/88) [`c758a77`](https://github.com/loncadev/lonca/commit/c758a77857a148d0a2ac111a88facb83d72e0094) Thanks [@keparlak](https://github.com/keparlak)! - Fix `finance.getSettlements` / `getOtherFinancials` failing against the live API.
  Trendyol's CHE finance endpoints **require** a `transactionType` (they return a
  bare 500 without one) and only accept a page **size of 500 or 1000** (`400 "Size
değeri 500 ya da 1000 olmalı"`), but the SDK left `transactionType` optional and
  sent `size=50`/capped at 200 — so both calls failed.

  The SDK now throws a clear `ValidationError` when `transactionType` is missing and
  clamps `limit` to 500/1000 (default 500). Verified live: `getSettlements({
transactionType: 'Sale', startDate, endDate })` → 116 transactions.

- [#87](https://github.com/loncadev/lonca/pull/87) [`72132c8`](https://github.com/loncadev/lonca/commit/72132c80e4411b25f9e374665764f16e27fb014c) Thanks [@keparlak](https://github.com/keparlak)! - Fix `locations.getTurkeyDistricts` / `getTurkeyNeighborhoods` (and the Azerbaijan
  variants) returning **500**. Trendyol's nested location endpoints key off the
  city/district **internal id**, but `City` only exposed the display `code` — e.g.
  Adana is `{ id: 100, code: "1" }`, so the natural `getTurkeyDistricts(city.code)`
  call hit the id-only path with `"1"` and 500'd.

  `City`, `District`, and `Neighborhood` now expose an `id` field (distinct from
  `code`), and the district/neighborhood lookups take that id. Verified live:
  `getTurkeyDistricts(city.id)` → 15 districts; `getTurkeyNeighborhoods(city.id,
district.id)` → 31 neighborhoods.

## 0.12.0

### Minor Changes

- [#80](https://github.com/loncadev/lonca/pull/80) [`0c2cf47`](https://github.com/loncadev/lonca/commit/0c2cf47412cf71474faf2b56445c136d5a9d0ed8) Thanks [@keparlak](https://github.com/keparlak)! - Re-export the `@lonca/core` pagination helpers from each SDK.

  `paginate`, `paginateOffset`, and the `CursorPage` / `OffsetPage` (and their
  param) types are now re-exported from `@lonca/trendyol` and `@lonca/hepsiburada`,
  so consumers can iterate list endpoints without taking a separate direct
  dependency on `@lonca/core`:

  ```ts
  import { paginate } from '@lonca/trendyol';
  for await (const pkg of paginate((cursor) => client.orders.list({ cursor }))) {
    /* … */
  }
  ```

## 0.11.3

### Patch Changes

- Updated dependencies [[`c80e1f7`](https://github.com/loncadev/lonca/commit/c80e1f7430f5919570b9642300fe89ec82294d94)]:
  - @lonca/core@0.6.0

## 0.11.2

### Patch Changes

- Updated dependencies [[`8ae5960`](https://github.com/loncadev/lonca/commit/8ae59608ea3c90cf435f1c1e6cee43cb428948e1)]:
  - @lonca/core@0.5.0

## 0.11.1

### Patch Changes

- [#74](https://github.com/loncadev/lonca/pull/74) [`3da755d`](https://github.com/loncadev/lonca/commit/3da755da6980d596dd8b5835f61a9f69b23814e0) Thanks [@keparlak](https://github.com/keparlak)! - Harden retry, backoff, and pagination against duplicate writes and retry storms.
  - **Retries no longer replay non-idempotent writes on ambiguous failures.** A
    timed-out, 5xx, or network-failed `POST`/`PUT`/`DELETE`/`PATCH` may already
    have committed server-side, so it is no longer auto-retried (which could
    duplicate an order split, cancel, or price/stock push). Only `429` — which the
    server provably rejected before processing — is replayed for writes; `GET`
    still retries normally. Pass `idempotent: true` on a request to opt a write
    back into full retries when it carries an idempotency key. New `@lonca/core`
    export: `isRetryableIdempotentOnly`.
  - **`Retry-After` parsing is unified and fixed.** A `Retry-After: 0` (or blank /
    past-date) header no longer collapses exponential backoff to a zero-delay
    retry storm. The parser now lives in `@lonca/core` (new export
    `parseRetryAfter`) and is shared by both SDKs, ending the Trendyol/Hepsiburada
    drift; `retry()` also defensively ignores a non-positive `retryAfterMs`.
  - **Trendyol `orders.list()` no longer throws mid-pagination at the 10k cap.**
    When the next page would exceed the 10,000-record offset cap, `nextCursor` is
    withheld so `paginate()` ends cleanly instead of handing back a cursor that
    then throws a `ValidationError`. Use `listStream()` for full scans.
  - **Shared transport lifecycle.** The request loop (rate-limit, fetch under a
    composed timeout, FormData/JSON body, 204 handling, error mapping, retry, and
    logging) is now a single `createRequester` factory in `@lonca/core`, with each
    SDK injecting only its marketplace-specific seams (URL building, headers,
    status→error mapping). This removes ~150 duplicated lines per SDK and the
    drift between them; as a side effect the Hepsiburada transport regains
    per-request `headers` support. New `@lonca/core` exports: `createRequester`,
    `BaseRequestOptions`, `RequesterConfig`.

- Updated dependencies [[`3da755d`](https://github.com/loncadev/lonca/commit/3da755da6980d596dd8b5835f61a9f69b23814e0)]:
  - @lonca/core@0.4.0

## 0.11.0

### Minor Changes

- [#70](https://github.com/loncadev/lonca/pull/70) [`d31981f`](https://github.com/loncadev/lonca/commit/d31981fd8d159a7a68b885b32d7b0c557c3d4ff2) Thanks [@keparlak](https://github.com/keparlak)! - feat(trendyol): add `products.listInventoryAndPrice()` and guard `orders.list()` against the 10,000-record cap

  Responds to two Trendyol integration notices:
  - **New `products.listInventoryAndPrice(params)`** — wraps Trendyol's lightweight `GET /products/approved/inventory-and-price` filter, which returns only stock + price for approved products. Filter by `barcode`, `contentId`, `stockCode`, `productMainId`, or listing `status`; sort with `orderByDirection`; page with the opaque cursor (forwarded as `nextPageToken`, `size` capped at 100). Optional `storeFrontCode` is sent as a request header (required on the International marketplace). Returns `CursorPage<ProductStockPrice>`; each variant carries `barcode`, `salePrice`, `listPrice`, `quantity`, `stockCode`, and `stockLastModifiedAt` (ISO, omitted when stock was never updated). New exported types: `ListInventoryAndPriceParams`, `ApprovedProductStatus`, `ProductStockPrice`, `ProductStockPriceVariant`.
  - **`orders.list()` now fails fast** with a `ValidationError` when `page × size` would exceed the 10,000-record cap Trendyol enforces on `getShipmentPackages` (effective 2026-06-08, otherwise HTTP 429), pointing callers to `orders.listStream()` for full scans. The stale rate-limit doc comment is updated. No change to `listStream()` — it already implements `getShipmentPackagesStream` (cursor-based, last 3 months).
  - **Transport** gained optional per-request `headers` support (used by `listInventoryAndPrice` for `storeFrontCode`).

## 0.10.0

### Minor Changes

- [#68](https://github.com/loncadev/lonca/pull/68) [`ace3bd7`](https://github.com/loncadev/lonca/commit/ace3bd70036bb5d6a0fa545b2ba46768a9a36efe) Thanks [@keparlak](https://github.com/keparlak)! - feat: batch helper, status map, normalized error issues, capabilities, and a test double
  - **fix (breaking on the previously-broken path):** `inventory.update()` now throws `ServerError` when Trendyol accepts the request but returns no `batchRequestId`, instead of returning `{ batchRequestId: '' }`. An empty id is unpollable and was forcing consumers into sentinel hacks.
  - `inventory.updateAndWait(items, opts?)` — chunks to ≤1000, submits, and polls each batch to a terminal state; returns one `BatchRequestResult` per chunk. Plus a standalone `pollBatchStatus(getStatus, id, opts)` for ids obtained elsewhere.
  - `statusMap` + `normalizeStatus` — exhaustive over the known shipment-package statuses, mapping into core's `NormalizedOrderStatus`; unknown statuses surface via `mapped: false`. Adds `KnownShipmentPackageStatus` (the open wire type `ShipmentPackageStatus` is unchanged).
  - `mapHttpError` now populates `LoncaError.issues` from Trendyol error bodies (`field`/`code`/`message` only — never the raw PII-bearing payload, which stays on `error.data`).
  - `trendyolCapabilities` (`scheduledPricing` / `stockOnlyBatch` / `listingUpdatedAt`), also exposed as `client.capabilities`.
  - New `@lonca/trendyol/testing` subpath export: `createFakeTrendyolClient(seed?)` — the real client graph over a fake transport for unit tests (batch hot-path works out of the box; drive other endpoints with `seed.handler`).

### Patch Changes

- Updated dependencies [[`ace3bd7`](https://github.com/loncadev/lonca/commit/ace3bd70036bb5d6a0fa545b2ba46768a9a36efe)]:
  - @lonca/core@0.3.0

## 0.9.0

### Minor Changes

- [#62](https://github.com/loncadev/lonca/pull/62) [`67cc6b4`](https://github.com/loncadev/lonca/commit/67cc6b45998f8dfd81576f99293bf490e02bc70a) Thanks [@keparlak](https://github.com/keparlak)! - feat(trendyol): Export Center + Videos + finance path correction (15 total endpoints across audit)

  Adds full coverage of Trendyol's Export Center program — Türkiye-based
  sellers shipping to Trendyol's international platforms. The Export Center
  shares the same `apigw.trendyol.com` gateway and HMAC auth as the main
  marketplace; the distinguishing factor is the `/integration/ecgw/v{N}/{sellerId}/…`
  path prefix.

  Previously the SDK only exposed `categories.getByBarcodes` (which routes
  through the Export Center barcode-lookup endpoint). This release adds 12
  more Export Center endpoints under a dedicated `exportCenter` resource.

  New `exportCenter` resource (12 methods):
  - **Products** (4)
    - `listProducts({ barcodes?, pageKey?, size? })` — `GET /v2/{id}/products`
    - `createProducts(items)` — `POST /v2/{id}/products` (max 5000)
    - `updatePrices(priceInfos)` — `POST /v1/{id}/prices` (max 5000; 1 update / barcode / day)
    - `updateStocks(items)` — `POST /v1/{id}/stocks` (max 5000)
  - **Batch status** (1)
    - `getBatchStatus(batchId)` — `GET /v1/{id}/check-status?batchId=…` (24-hour retention)
  - **Packages** (3)
    - `listPackagesV2({ status?, trackingNumber?, dates?, size?, boutiqueId? })`
    - `listPackagesV3({ status?, offset?, limit?, dates? })`
    - `getPackageItems({ packageId, status?, offset?, limit? })`
  - **Lookup** (4)
    - `getCategoryAttributes(categoryId)`
    - `getCareInstructions()` — values used by `createProducts`
    - `getCompositions()` — material compositions for `createProducts`
    - `getOrigins()` — country-of-origin values for `createProducts`

  Plus a corrected note in the README: V1 endpoint sunset (previously
  flagged for August 2026) is N/A — Trendyol's V2 docs reuse the V1 paths,
  and the SDK already emits the V2 response shape (`nextPageToken`
  pagination, content-based variants).

  New `videos` resource (2 methods) — Trendyol's `seller-integration-video-api`:
  - `create({ contentId, url, ... })` — `POST /integration/video/sellers/{id}/videos` (200 req/min)
  - `list({ id?, sellerIntegrationStatus?, offset?, limit? })` — `GET …/videos` (1000 req/min)

  Two separate token buckets so list polling doesn't starve the create budget.

  Finance path correction — `finance.getSettlements` and `getOtherFinancials`
  now hit `/integration/finance/che/sellers/…` per the **Cari Hesap Ekstresi
  Entegrasyonu** docs. The previous shorter path `/integration/sellers/…`
  was an older spec; the documented (current) path is the `/finance/che/`
  form. Wire shape unchanged.

  Body / response shapes are typed loosely (`Record<string, unknown>` per
  the developer-portal HTML-table docs) with `raw` accessors on every row
  for forward-compat field access. Per-endpoint limits and constraints are
  documented in JSDoc.

  Verification:
  - 288 mock tests pass (26 new in `export-center.test.ts`, 5 new in `videos.test.ts`)
  - typecheck + ESM/CJS/DTS build green

## 0.8.0

### Minor Changes

- [#59](https://github.com/loncadev/lonca/pull/59) [`082cb9c`](https://github.com/loncadev/lonca/commit/082cb9cd1dadefb0351844ee0e2fb781d36ddaf4) Thanks [@keparlak](https://github.com/keparlak)! - feat: cross-SDK harmonization Tier 3 — `OffsetPage<T>` in core + Trendyol resource constructor refactor

  **`@lonca/core`** — adds the offset-pagination companion to `CursorPage<T>`:
  - `OffsetPage<T>` interface: `{ totalCount, limit, offset, pageCount, items[] }`.
    This is the wire shape Hepsiburada's OMS endpoints use; lives in core so future
    marketplace SDKs (n11, Amazon TR, …) can reuse it.
  - `OffsetPaginationParams`: `{ offset?, limit? }`.
  - `paginateOffset()`: async iterator helper that walks an offset-paginated
    endpoint to exhaustion (or until `maxPages`).

  **`@lonca/hepsiburada`** — internal alignment:
  - `OrdersPage<T>` is now a `@deprecated` type alias for `OffsetPage<T>` from
    core. No runtime change; existing imports keep working.

  **`@lonca/trendyol`** — resource constructor harmonization:
  - Every resource constructor is now `(transport)` or `(transport, limiter?)` —
    the previous `sellerId` positional argument is gone. Resources read
    `transport.sellerId` (new getter) instead. Before: `new OrdersResource(transport,
sellerId, limiter?)`; after: `new OrdersResource(transport, limiter?)`.
  - Affected: `categories`, `claims`, `finance`, `inventory`, `invoices`,
    `labels`, `orders`, `products`, `questions`, `suppliers`, `testOrders`,
    `webhooks` (12 resources). `brands`, `locations` already had the clean
    signature.
  - `CategoriesResource.getByBarcodes` no longer throws when the seller wasn't
    passed at construction (the optional `sellerId` constructor arg was the
    only path that allowed `sellerId === undefined`; with the new signature
    it's always present).
  - `TrendyolTransport` exposes a public `sellerId` getter for resources to
    read.

  **Breaking change**: any caller manually constructing Trendyol resources
  needs to drop the `sellerId` argument:

  ```diff
  - new OrdersResource(transport, sellerId, limiter)
  + new OrdersResource(transport, limiter)
  ```

  `createTrendyolClient` users are unaffected — the factory always built
  resources correctly.

  Verification:
  - 478 mock tests pass (41 core + 180 hepsiburada + 257 trendyol).
  - typecheck + build green on all 3 packages.
  - 1 dead test removed in `categories.test.ts` (the "throws when constructed
    without sellerId" path was no longer reachable).

### Patch Changes

- Updated dependencies [[`082cb9c`](https://github.com/loncadev/lonca/commit/082cb9cd1dadefb0351844ee0e2fb781d36ddaf4)]:
  - @lonca/core@0.2.0

## 0.7.0

### Minor Changes

- [#57](https://github.com/loncadev/lonca/pull/57) [`bfb18b5`](https://github.com/loncadev/lonca/commit/bfb18b56f4e38c7593e0f0184779d327b80e67dc) Thanks [@keparlak](https://github.com/keparlak)! - feat: cross-SDK harmonization (Tier 1 + 2 + 4 of consistency audit)

  After a side-by-side consistency audit between the two SDKs, this release
  unifies the small-but-pervasive surface differences. No new resources,
  no new endpoints — just less surprise for callers using both SDKs.

  **Tier 1 — DX wins (breaking type changes)**
  - `@lonca/trendyol`: `integratorName` is now **required** on
    `CreateClientOptions` and the transport's `TransportConfig` (was
    optional, defaulted to `'SelfIntegration'`). Trendyol uses this to
    attribute API traffic — making it explicit prevents accidentally
    shipping `'SelfIntegration'` to production. `buildUserAgent(sellerId,
integratorName)` also drops its default.
  - `@lonca/hepsiburada`: transport adds per-request **correlation ID** —
    a UUID generated per call, included as `x-correlationid` request
    header, and surfaced in every `logger.debug` / `logger.warn` line.
    Mirrors what Trendyol's transport has done from day one; enables
    cross-marketplace log correlation.

  **Tier 2 — Export hygiene (Hepsiburada)**
  - `parseWebhookEvent` is the new canonical entry point — same function
    reference as `parseHepsiburadaWebhookEvent`, just a shorter name that
    matches `@lonca/trendyol`'s export. The old name stays exported as a
    `@deprecated` alias for one minor; remove in the following release.
  - `HepsiburadaTransport`, `RequestOptions`, `TransportConfig`, and
    `HepsiburadaService` are **no longer exported** from the package
    index. They were internal implementation surface; keeping them
    exported was an oversight that forced any internal refactor to be
    breaking. `HepsiburadaEnvironment` remains exported (it's a
    config-relevant type users may want to type their own env switches
    with).

  **Tier 4 — Documentation**
  - Both READMEs gain a "Rate-limiter defaults" table listing per-resource
    capacity and interval so users don't have to read the source to know
    the budget.
  - Both READMEs document the per-request correlation ID feature.

  Verification: 438 mock tests pass across both packages (180 Hepsiburada
  - 258 Trendyol); typecheck + build green on both.

## 0.6.0

### Minor Changes

- [#36](https://github.com/loncadev/lonca/pull/36) [`68e9ce2`](https://github.com/loncadev/lonca/commit/68e9ce26733ca1a107b791f6e7aa75d6310c3362) Thanks [@keparlak](https://github.com/keparlak)! - Add typed webhook event payloads + harden settlement / label types + extend smoke coverage.

  ### New: typed inbound webhook events

  Trendyol POSTs shipment-package status events to your endpoint using the same body shape as `getShipmentPackages` (per the official "Webhook Model" doc). The SDK now ships a top-level helper for parsing that JSON into typed `ShipmentPackage[]`:

  ```ts
  import express from 'express';
  import { parseWebhookEvent } from '@lonca/trendyol';

  const app = express();
  app.post('/trendyol/webhook', express.json(), (req, res) => {
    const event = parseWebhookEvent(req.body);
    for (const pkg of event.packages) {
      // pkg is the same typed ShipmentPackage you get from orders.list()
      await myQueue.enqueue({ packageId: pkg.id, status: pkg.status });
    }
    res.sendStatus(200);
  });
  ```

  `parseWebhookEvent` accepts either a parsed object or a raw JSON string, throws `ValidationError` for malformed bodies, and reuses the SDK's existing package normalizer.

  New exports:
  - `parseWebhookEvent(rawBody)` — the helper
  - `normalizeShipmentPackage(rawNode)` — re-usable single-package normalizer
  - `WebhookEvent`, `WebhookEventStatus` (open enum: `CREATED`, `PICKING`, `INVOICED`, …, `VERIFIED`), `PackageCreatedBy` (`order-creation` / `cancel` / `split` / `transfer`)

  ### Hardened types (replace `{ raw }`-only shapes)

  Both `finance.getSettlements()` and `finance.getOtherFinancials()` return the same `FinancialTransaction` wire shape per Trendyol's spec. SDK now surfaces the documented fields directly:

  ```ts
  // Before (0.5.0): page.items[0].raw.transactionType
  // After  (0.5.1): page.items[0].transactionType
  ```

  Fields covered: `id`, `transactionDate` (ISO), `transactionType`, `barcode`, `receiptId`, `description`, `debt`, `credit`, `paymentPeriod`, `commissionRate`, `commissionAmount`, `commissionInvoiceSerialNumber`, `sellerRevenue`, `orderNumber`, `paymentOrderId`, `paymentDate` (ISO), `sellerId`, `storeId`, `storeName`, `storeAddress`, `country`. `raw` is still preserved for any fields Trendyol adds later.

  `labels.getCommon()` now returns `{ labels: [{ label, format }], raw }` instead of `{ raw }` only — extracts Trendyol's documented `{ data: [{ label, format }] }` envelope.

  `SettlementRow` and `OtherFinancialRow` are kept as `@deprecated` aliases for `FinancialTransaction` so existing 0.5.0 code continues to type-check.

  New exports: `FinancialTransaction`, `CommonLabelEntry`.

  ### Smoke coverage extended

  4 endpoints that were never live-tested in earlier phases now have safe smoke sections:
  - `finance.getSettlements` / `getOtherFinancials` (read-only)
  - `labels.getCommon` with fake tracking number (wire-verify only)
  - `claims.getItemAudits` with fake id (wire-verify only)

  Result on STAGE 2026-05-26: finance returns 401 (feature-gated for this seller), labels returns 500 (wire reaches handler with fake tracking), claims-audits returns 404 (path verified). All four prove the SDK constructs the correct URL + headers.

  ### Test count

  246 → 258 mock tests (+12: 11 new webhook-event parse tests + revised finance/label assertions for the hardened shapes).

## 0.5.0

### Minor Changes

- [#31](https://github.com/loncadev/lonca/pull/31) [`26dc975`](https://github.com/loncadev/lonca/commit/26dc975b96dda78032965f246ca146329e4622fe) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 4b — claims (returns) resource** (6 endpoints). Introduces a new top-level `client.claims` resource. After this lands, the **returns + claims** surface is feature-complete.

  ### New methods on `client.claims`
  - **`create(input)`** → `unknown`
    - `POST /integration/order/sellers/{sellerId}/claims/create`
    - File a return claim against an order. Body validated client-side (`ValidationError` for empty `claimItems`).
  - **`createIssue(claimId, input)`** → `unknown`
    - `POST /integration/order/sellers/{sellerId}/claims/{claimId}/issue`
    - File a seller-side rejection ("ret talebi") against a customer claim. **Multipart/form-data** — the SDK builds the FormData from the typed input (joins `claimItemIdList` with commas, attaches `files: [Blob, ...]` for PDF/JPEG supporting docs).
    - SDK validates: non-empty `claimItemIdList`, non-empty `description`, `description.length <= 500`.
  - **`approveLineItems(claimId, input)`** → `unknown`
    - `PUT /integration/order/sellers/{sellerId}/claims/{claimId}/items/approve`
    - Approve specific claim line items; throws `ValidationError` on empty list.
  - **`list({ cursor?, limit?, startDate?, endDate?, claimItemStatus? })`** → `CursorPage<Claim>`
    - `GET /integration/order/sellers/{sellerId}/claims`
    - Page-based pagination (max 200, default 50). `claimItemStatus` is typed as an open enum (`Created`, `WaitingInAction`, `WaitingFraudCheck`, `Accepted`, `Unresolved`, `Rejected`).
    - Normalizer accepts both `id` and `claimId` for the claim identifier; converts ms-epoch dates to ISO.
  - **`getIssueReasons()`** → `ClaimIssueReason[]`
    - `GET /integration/order/claim-issue-reasons` (**not seller-scoped** — no `sellerId` in path).
    - Catalog of rejection-reason IDs used by `createIssue`.
  - **`getItemAudits(claimItemId)`** → `ClaimItemAudit[]`
    - `GET /integration/order/sellers/{sellerId}/claims/items/{claimItemsId}/audit`
    - Audit log for a single claim item; SDK wraps each row as `{ raw }` (Trendyol's shape varies, kept conservative until observed live).

  ### Transport extension

  `TrendyolTransport.request()` now accepts `body: FormData` for multipart endpoints — when the body is a `FormData` instance, the SDK skips JSON-stringify and lets `fetch` set the multipart boundary in `Content-Type`. Backwards-compatible: any non-FormData body still serializes as JSON.

  ### New exports
  - Resource: `ClaimsResource`
  - Types: `Claim`, `ClaimItemStatus` (open enum), `ClaimItemAudit`, `ClaimIssueReason`, `CreateClaimInput`, `CreateClaimItemInput`, `CreateClaimIssueInput`, `ApproveClaimLineItemsInput`, `ListClaimsParams`

  ### Smoke verified (STAGE 2026-05-25)

  ```
  ── 6.86 claims.list({ limit: 2 })
  ℹ claims.list: HTTP 404 (this STAGE seller has no claims — endpoint returns 404 for empty rather than empty array; wire path verified)

  ── 6.87 claims.getIssueReasons()
  ✓ Got 19 reason(s). First 5:
         251  Müşteriden gelen ürün defolu/zarar görmüş
         401  Müşteriden gelen ürün adedi eksik
         201  Müşteriden gelen ürün yanlış
          51  Müşteriden gelen ürün kullanılmış
         151  Müşteriden gelen ürünün parçası/aksesuarı eksik
  ```

  The 19-reason payload end-to-end-validates the SDK wire contract.

  ### Phase 4 complete
  - 4a ([#30](https://github.com/loncadev/lonca/issues/30)): manual returns + TEX compensation (3) ✅
  - **4b (this): claims (6) ✅**

  After this merges, **returns + claims surface is feature-complete** (9 endpoints across 4a+4b). Next: **Phase 5 — webhooks (6 endpoints).**

- [#34](https://github.com/loncadev/lonca/pull/34) [`90810f8`](https://github.com/loncadev/lonca/commit/90810f8210ea1cb0de57c2671b09551835282e89) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phases 7-11 — miscellaneous surface (18 endpoints)**. After this lands, **the Trendyol SDK fully covers Trendyol's seller marketplace API** (96 endpoints across 11 phases).

  ### New resources

  #### `client.invoices` (3 endpoints)
  - `uploadFile(input)` — `POST /sellers/{id}/seller-invoice-file` (**multipart**: PDF/JPEG/PNG, max 10 MB)
  - `sendLink(input)` — `POST /sellers/{id}/seller-invoice-links`
  - `deleteLink(input)` — `POST /sellers/{id}/seller-invoice-links/delete`

  #### `client.finance` (2 endpoints)
  - `getSettlements({...})` — `GET /sellers/{id}/settlements` → `CursorPage<SettlementRow>`
  - `getOtherFinancials({...})` — `GET /sellers/{id}/otherfinancials` → `CursorPage<OtherFinancialRow>`

  Both surfaced as `{ raw }` rows — the underlying schemas are wide and evolve frequently; callers drill into `raw` for any field.

  #### `client.labels` (2 endpoints)
  - `createCommon(trackingNumber, input)` — `POST /sellers/{id}/common-label/{tracking}` (ZPL format)
  - `getCommon(trackingNumber)` — `GET /sellers/{id}/common-label/{tracking}`

  #### `client.testOrders` (3 endpoints, **STAGE-only**)
  - `create(input)` — `POST /test/order/orders/core`
  - `updateStatus(packageId, status)` — `PUT /test/order/sellers/{id}/shipment-packages/{pkg}/status`
  - `setClaimsWaitingInAction()` — `PUT /test/order/sellers/{id}/claims/waiting-in-action`

  #### `client.locations` (8 endpoints)

  Full lookup tree for shipment / invoice addresses. **Not seller-scoped** — under `/integration/member/...`.
  - `getCountries()` — all supported countries (Trendyol returned **261** on STAGE)
  - TR domestic: `getTurkeyCities()` (returned **81**), `getTurkeyDistricts(cityCode)`, `getTurkeyNeighborhoods(cityCode, districtCode)`
  - AZ domestic: `getAzerbaijanCities()`, `getAzerbaijanDistricts(cityCode)`
  - GULF/CEE: `getCitiesByCountry(countryCode)`, `getDistrictsByCity(countryCode, cityId)`

  ### Smoke verified (STAGE 2026-05-25)

  ```
  ── 6.91 locations.getCountries()
  ✓ Got 261 country/ies. First 5:
        AF  Afghanistan
        AX  Åland
        AL  Albania
        DZ  Algeria
        AS  American Samoa

  ── 6.92 locations.getTurkeyCities()
  ✓ Got 81 TR city/ies. First 5:
         1  Adana
         2  Adıyaman
         3  Afyonkarahisar
         4  Ağrı
        68  Aksaray
  ```

  Real payloads through the SDK — wire fully verified.

  ### New exports

  Resources: `InvoicesResource`, `FinanceResource`, `LabelsResource`, `TestOrdersResource`, `LocationsResource`.

  Types: `UploadInvoiceFileInput`, `SendInvoiceLinkInput`, `DeleteInvoiceLinkInput`, `SettlementRow`, `OtherFinancialRow`, `ListFinanceParams`, `CreateCommonLabelInput`, `CommonLabel`, `CreateTestOrderInput`, `TestOrderStatus`, `Country`, `City`, `District`, `Neighborhood`.

  ### Final Trendyol surface (post-merge)

  | Resource     | Methods                                                                                               |
  | ------------ | ----------------------------------------------------------------------------------------------------- |
  | `brands`     | list, search                                                                                          |
  | `categories` | list, getAttributes, getAttributeValues, getByBarcodes                                                |
  | `suppliers`  | getAddresses                                                                                          |
  | `products`   | list, listUnapproved, getBase, getBuyboxInfo, getBatchStatus + 5 write + 4 lifecycle (12 total)       |
  | `inventory`  | update                                                                                                |
  | `orders`     | list, listStream, getCargoInvoiceItems + 12 package state methods + 3 returns/compensation (17 total) |
  | `claims`     | create, createIssue, approveLineItems, list, getIssueReasons, getItemAudits                           |
  | `webhooks`   | create, list, update, delete, activate, deactivate                                                    |
  | `questions`  | get, list, answer                                                                                     |
  | `invoices`   | uploadFile, sendLink, deleteLink                                                                      |
  | `finance`    | getSettlements, getOtherFinancials                                                                    |
  | `labels`     | createCommon, getCommon                                                                               |
  | `testOrders` | create, updateStatus, setClaimsWaitingInAction                                                        |
  | `locations`  | 8 lookup endpoints                                                                                    |

  **96 methods across 14 resources.** Trendyol is complete.

  Stacks on top of [#33](https://github.com/loncadev/lonca/issues/33) (Phase 6).

- [#30](https://github.com/loncadev/lonca/pull/30) [`b18538e`](https://github.com/loncadev/lonca/commit/b18538e8d5805be142cdfcf51690938a38628580) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 4a — manual returns + Trendyol Express compensation** (3 endpoints).

  ### New methods
  - **`client.orders.manualReturnByPackageId(packageId)`** → `void`
    - `PUT /shipment-packages/{packageId}/manual-return` (no body)
    - Seller-side notification that a shipped package was received back outside Trendyol's return-cargo flow.
  - **`client.orders.manualReturnByTrackingNumber(cargoTrackingNumber)`** → `void`
    - `PUT /shipment-packages/manual-return-by-tracking-number/{cargoTrackingNumber}` (no body, sibling path)
    - Same operation keyed by cargo tracking number.
  - **`client.orders.getCompensationTickets({ cursor?, limit?, startDate?, endDate? })`** → `CursorPage<CompensationTicket>`
    - `GET /integration/tex/compensation/sellers/{sellerId}/tickets`
    - Trendyol Express compensation tickets — claims filed when a shipment is lost or damaged in transit. 18-state lifecycle (`CompensationApproved`, `CompensationRejected`, `FoundInCompensation`, etc.).
    - **Requires Trendyol Express enrollment** (similar to AutoFT-only endpoints) — sellers without TEX get HTTP 401.
    - Note the different path prefix: `/integration/tex/compensation/...`, not `/integration/order/...`.

  ### Discovery-first wire details

  `getCompensationTickets` response envelope is unusual — spec documents `{ totalCount, data: { items: [...] } }`. The SDK accepts that **plus** common fallbacks (`data: [...]` raw array, `content: [...]`) so live wire surprises don't break callers. The 3 shapes are pinned by separate mock tests.

  ### New exports
  - `CompensationTicket`
  - `CompensationTicketState` (18-value open enum)
  - `CompensationItemDetail`
  - `ListCompensationTicketsParams`

  ### Smoke verified (STAGE 2026-05-25)

  ```
  ℹ wire-verified (rejected, no real data touched) manualReturnByPackageId      HTTP 401
  ℹ wire-verified (rejected, no real data touched) manualReturnByTrackingNumber HTTP 401
  ℹ getCompensationTickets: HTTP 401 (TEX enrollment required; same wire pattern as AutoFT-only categories.getByBarcodes)
  ```

  ### Phase 4 progress
  - **4a (this): manual returns + TEX compensation (3) ✅**
  - 4b: claims write+read (6) — createClaim, createClaimIssue, approveClaimLineItems, getClaims, getClaimIssueReasons, getClaimItemAudits

  After 4b, the returns/claims surface is feature-complete. Next: Phase 5 (webhooks).

- [#33](https://github.com/loncadev/lonca/pull/33) [`86c27d8`](https://github.com/loncadev/lonca/commit/86c27d8b82d6e0b6b493a67f0afcbd2ee789c8af) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 6 — customer Q&A resource** (3 endpoints).

  New top-level `client.questions` resource for the trendyol.com product-questions flow (customers post questions on product pages; sellers reply).

  ### New methods
  - **`questions.get(id)`** → `Question`
    - `GET /integration/qna/sellers/{sellerId}/questions/{id}`
  - **`questions.list({ cursor?, limit?, barcode?, startDate?, endDate?, status? })`** → `CursorPage<Question>`
    - `GET /integration/qna/sellers/{sellerId}/questions/filter`
    - Status filter: `'WAITING_FOR_ANSWER' | 'ANSWERED' | 'REJECTED' | 'REPORTED'` (open enum).
  - **`questions.answer(id, text)`** → `unknown`
    - `POST /integration/qna/sellers/{sellerId}/questions/{id}/answers` body `{ text }`
    - SDK validates 10 ≤ `text.length` ≤ 2000 before hitting the wire (Trendyol-enforced).

  ### Smoke verified (STAGE)

  ```
  ── 6.89 questions.list({ limit: 2 })
  ✓ Got 0 question(s)
  ```

  200 OK + empty content — this seller has no customer questions on STAGE. Wire contract fully verified.

  ### New exports
  - Resource: `QuestionsResource`
  - Types: `Question`, `QuestionAnswer`, `QuestionStatus`, `ListQuestionsParams`

  ### Stacks on top of [#32](https://github.com/loncadev/lonca/issues/32) (Phase 5).

- [#32](https://github.com/loncadev/lonca/pull/32) [`b6d50fe`](https://github.com/loncadev/lonca/commit/b6d50fe3817322072c81e7b545e2a709c40b1887) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 5 — webhooks resource** (6 endpoints).

  Introduces a new top-level `client.webhooks` resource managing Trendyol's shipment-package status webhooks. **Max 15 active subscriptions per seller.** Webhooks fire on order status events only (no product / stock support).

  ### New methods on `client.webhooks`
  - **`create(input)`** → `unknown`
    - `POST /integration/sellers/{sellerId}/webhooks`
    - SDK validates `url`, `authenticationType`, and auth-type-specific required fields (`username + password` for BASIC, `apiKey` for API_KEY) before hitting the wire.
  - **`list()`** → `Webhook[]`
    - `GET /integration/sellers/{sellerId}/webhooks`
    - Normalizer accepts 3 response shapes (raw array, `{ webhooks: [] }`, `{ content: [] }`) and 3 active-flag spellings (`active`, `isActive`, `status: 'ACTIVE'`).
  - **`update(webhookId, input)`** → `unknown`
    - `PUT /integration/sellers/{sellerId}/webhooks/{id}`
    - Same input shape as `create` (Trendyol does full-replace, not partial).
  - **`delete(webhookId)`** → `unknown`
    - `DELETE /integration/sellers/{sellerId}/webhooks/{id}`
  - **`activate(webhookId)`** → `unknown`
    - `PUT /integration/sellers/{sellerId}/webhooks/{id}/activate`
  - **`deactivate(webhookId)`** → `unknown`
    - `PUT /integration/sellers/{sellerId}/webhooks/{id}/deactivate`
    - Trendyol auto-deactivates webhooks after persistent delivery failures + sends 2 emails; use `activate()` to bring them back once your endpoint is healthy.

  ### Security note (documented in JSDoc)

  **No HMAC signature** — Trendyol authenticates against **your endpoint** using the auth method you configure (`BASIC_AUTHENTICATION` or `API_KEY`). Pick `API_KEY` so you can rotate the secret without redeploying. The SDK does not pre-check the 15-subscription cap (would need an extra round-trip); Trendyol returns HTTP 400 when exceeded.

  ### New exports
  - Resource: `WebhooksResource`
  - Types: `Webhook`, `WebhookInput`, `WebhookAuthenticationType`

  ### Smoke verified (STAGE)

  ```
  ── 6.88 webhooks.list()
  ✖ HTTP 401 ("Invalid token")
  ```

  Direct curl probe to `/integration/sellers/{id}/webhooks` returned the same 401 with a JSON error body — this seller hasn't enabled the webhook feature on STAGE (Trendyol's webhook layer uses a separate auth check from the general API). **Wire path + auth flow verified**; activation needs to be enabled on the seller side.

  ### Phase 5 complete

  Next: **Phase 6-11 — questions (3), invoices (3), settlements (2), common labels (2), test orders (3), location lookups (8) = 21 endpoints** to fully close out the Trendyol surface.

## 0.4.0

### Minor Changes

- [#22](https://github.com/loncadev/lonca/pull/22) [`04c4fbd`](https://github.com/loncadev/lonca/commit/04c4fbd1282c5fa3282e839e3dc980bb7668ec69) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 3a — order status lifecycle**: 4 shipment-package write endpoints completing the seller-side order state machine.

  ### New methods
  - **`client.orders.updatePackageStatus(packageId, { status, lines? })`** → `void`
    - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}`
    - Status is restricted to `'Picking'` (preparing) or `'Invoiced'` (invoice issued) — other transitions are driven by Trendyol / the cargo provider.
    - Optional `lines: [{lineId, quantity}]` for partial transitions.
  - **`client.orders.cancelPackageItem(packageId, { lines, reasonId })`** → `void`
    - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/items/unsupplied`
    - Trendyol's "supply failure" (Tedarik Edememe) notification — marks specific line items as `UnSupplied`.
    - SDK throws `ValidationError` on empty `lines` before hitting the wire.
    - `reasonId` is a numeric code Trendyol publishes separately (consult the seller panel for current values).
  - **`client.orders.extendDeliveryDate(packageId, days)`** → `void`
    - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/extended-agreed-delivery-date`
    - `days` is typed as `1 | 2 | 3` (Trendyol enforces server-side; SDK validates client-side too).
  - **`client.orders.processAlternativeDelivery(packageId, { isPhoneNumber, trackingInfo, params })`** → `void`
    - `PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/alternative-delivery`
    - Used when shipping via a non-Trendyol cargo provider. `isPhoneNumber: true` → Trendyol SMSes the link; `false` → stores the URL directly.

  All four return `void` (Trendyol responds with HTTP 200 + empty body on success). Path + body shape match the official OpenAPI spec exactly.

  ### New exports
  - `UpdatePackageStatusInput`
  - `CancelPackageItemInput`
  - `ProcessAlternativeDeliveryInput`
  - `PackageLineUpdate`

  ### Smoke verified (STAGE 2026-05-25)

  All 4 endpoints wire-verified against Trendyol STAGE using a deliberately fake integer `packageId`. Trendyol's gateway returns **HTTP 401** for unknown packageIds on these endpoints (its security layer rejects before reaching the handler) — which still proves the SDK is constructing the correct URL + body + headers (the same credentials succeed on every other endpoint in the same smoke run). A separate isolated probe with a real `packageId` returned HTTP 404 with `SellerIntegrationApiDomainNotFoundException` — also a wire-contract confirmation. No real package state is touched.

  ### Phase 3 plan progress
  - **3a (this PR): status lifecycle (4) ✅**
  - 3b: splitting (4)
  - 3c: cargo/delivery (4)
  - 3d: operational metadata (3)
  - 3e: read variants (2)

  Then phases 4 (returns/claims), 5 (webhooks), 6-11 (questions, invoices, settlements, labels, test orders, locations).

- [#23](https://github.com/loncadev/lonca/pull/23) [`bfaf03c`](https://github.com/loncadev/lonca/commit/bfaf03ce2aa5e1b704aca479e736205fb737c540) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 3b — shipment-package splitting**: 4 endpoints for re-arranging order lines into new packages.

  ### New methods (all POST, all `void`)
  - **`client.orders.splitPackage(packageId, orderLineIds)`** → `void`
    - `POST /shipment-packages/{packageId}/split` body `{ orderLineIds }`
    - Moves the listed line IDs into a single new package; the original keeps the remainder.
  - **`client.orders.splitPackageByQuantity(packageId, quantitySplit)`** → `void`
    - `POST /shipment-packages/{packageId}/quantity-split` body `{ quantitySplit: [{ orderLineId, quantities: number[] }] }`
    - Carves one line into multiple packages by quantity (e.g. `quantities: [2, 2, 1]` splits 5 units into 3 packages).
  - **`client.orders.multiSplitPackage(packageId, splitGroups)`** → `void`
    - `POST /shipment-packages/{packageId}/multi-split` body `{ splitGroups: [{ orderLineIds: number[] }] }`
    - Splits into multiple new packages by grouping line IDs.
  - **`client.orders.splitMultiPackagesByQuantity(packageId, splitPackages)`** → `void`
    - `POST /shipment-packages/{packageId}/split-packages` body `{ splitPackages: [{ packageDetails: [{ orderLineId, quantities: number }] }] }`
    - Most expressive — multiple new packages, each with multiple lines + per-line single-integer `quantities`.

  All four throw `ValidationError` on empty input arrays before hitting the wire.

  ### New exports
  - `QuantitySplit` — per-line quantity-split entry (`quantities: number[]`)
  - `SplitGroup` — grouping of line IDs for `multiSplitPackage`
  - `PackageDetail` — single line + quantity for `splitMultiPackagesByQuantity` (note: singular `quantities: number`, intentional naming mismatch with the API)
  - `SplitPackagePlan` — one new package's full contents

  ### Smoke verified (STAGE 2026-05-25)

  All 4 endpoints wire-verified with a fake integer `packageId`. Trendyol's gateway returns **HTTP 401** for unknown packageIds on the split endpoints (same gateway-layer behavior as Phase 3a) — same credentials succeed on every other endpoint in the same smoke run, proving the SDK constructs the correct URL + body. No real package state touched.

  ### Phase 3 progress
  - 3a ([#22](https://github.com/loncadev/lonca/issues/22)): status lifecycle (4) ✅
  - **3b (this): splitting (4) ✅**
  - 3c: cargo/delivery (4)
  - 3d: operational metadata (3)
  - 3e: read variants (2)

- [#24](https://github.com/loncadev/lonca/pull/24) [`248a4da`](https://github.com/loncadev/lonca/commit/248a4da507aed465bb3db5be37ee4d786c976203) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 3c — cargo + manual delivery** (4 endpoints).

  ### New methods
  - **`client.orders.changeCargoProvider(packageId, cargoProvider)`** → `void`
    - `PUT /shipment-packages/{packageId}/cargo-providers` body `{ cargoProvider }`
    - `cargoProvider` is typed as `TrendyolCargoProvider` — the documented enum (`'YKMP'`, `'ARASMP'`, `'SURATMP'`, `'HOROZMP'`, `'DHLECOMMP'`, `'PTTMP'`, `'CEVAMP'`, `'TEXMP'`, `'KOLAYGELSINMP'`, `'CEVATEDARIK'`) plus a `(string & {})` escape for codes Trendyol adds later.
  - **`client.orders.manualDeliverByPackageId(packageId)`** → `void`
    - `PUT /shipment-packages/{packageId}/manual-invoice-delivery` (no body)
    - Flip a package to `Delivered` when delivered outside Trendyol's cargo network.
  - **`client.orders.manualDeliverByTrackingNumber(cargoTrackingNumber)`** → `void`
    - `PUT /shipment-packages/manual-invoice-delivery-by-tracking-number/{cargoTrackingNumber}` (no body)
    - Same operation as above but keyed by cargo tracking number (e.g. from a cargo provider webhook). Note the sibling path — not under `/{packageId}/...`.
  - **`client.orders.markDeliveredByService(packageId)`** → `void`
    - `PUT /shipment-packages/{packageId}/delivered-by-service` (no body)
    - For appliance / installation-required products delivered by an authorized service partner.

  All four are PUT and return `void` (Trendyol responds with 200 + empty body).

  ### New exports
  - `TrendyolCargoProvider`

  ### Smoke verified (STAGE 2026-05-25)

  All 4 wire-verified with a fake integer `packageId` / fake tracking number; Trendyol's gateway returns HTTP 401 (consistent with Phase 3a/3b behavior). Same credentials succeed on every other endpoint in the run, proving the SDK is constructing the correct URL + body.

  ### Phase 3 progress
  - 3a ([#22](https://github.com/loncadev/lonca/issues/22)): status lifecycle (4) ✅
  - 3b ([#23](https://github.com/loncadev/lonca/issues/23)): splitting (4) ✅
  - **3c (this): cargo/delivery (4) ✅**
  - 3d: operational metadata (3)
  - 3e: read variants (2)

- [#25](https://github.com/loncadev/lonca/pull/25) [`f944ca1`](https://github.com/loncadev/lonca/commit/f944ca1a436b0750cb380b248dbb01a018714ad5) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 3d — operational metadata** (3 endpoints).

  ### New methods
  - **`client.orders.updateBoxInfo(packageId, { deci?, boxQuantity? })`** → `void`
    - `PUT /shipment-packages/{packageId}/box-info`
    - Update desi (volumetric weight) and/or box count. Both fields optional; send at least one for the call to be meaningful.
  - **`client.orders.updateLaborCosts(packageId, items)`** → `void`
    - `PUT /shipment-packages/{packageId}/labor-costs`
    - **Wire note**: Trendyol's body is a **raw array** here (no `{ items: [...] }` envelope) — the SDK forwards as-is. `items: [{ orderLineId, laborCostPerItem }]`.
    - SDK throws `ValidationError` on empty input.
  - **`client.orders.updateWarehouse(packageId, warehouseId)`** → `void`
    - `PUT /shipment-packages/{packageId}/warehouse` body `{ warehouseId }`
    - Reassign the package to a different warehouse. `warehouseId` comes from `client.suppliers.getAddresses()` (filter by `isShipmentAddress`).

  ### New exports
  - `UpdateBoxInfoInput`
  - `LaborCostInput`

  ### Smoke verified (STAGE 2026-05-25)

  All 3 wire-verified with fake `packageId` → Trendyol returns HTTP 401 (same gateway behavior as Phase 3a/3b/3c).

  ### Phase 3 progress
  - 3a ([#22](https://github.com/loncadev/lonca/issues/22)), 3b ([#23](https://github.com/loncadev/lonca/issues/23)), 3c ([#24](https://github.com/loncadev/lonca/issues/24)), **3d (this)** ✅ — 15 of 17 order-deep endpoints
  - 3e: read variants (stream, cargo invoice) — last sub-group, then Phase 4 begins

- [#26](https://github.com/loncadev/lonca/pull/26) [`fc211b5`](https://github.com/loncadev/lonca/commit/fc211b5eaf8ab9b9d4a5c22cd8c68f6522fd1676) Thanks [@keparlak](https://github.com/keparlak)! - Add **Phase 3e — order read variants** (2 endpoints). Final sub-group of Phase 3 — the orders surface is now feature-complete.

  ### New methods
  - **`client.orders.listStream({ cursor?, limit?, packageItemStatuses?, lastModifiedStartDate?, lastModifiedEndDate? })`** → `CursorPage<ShipmentPackage>`
    - `GET /integration/order/sellers/{sellerId}/orders/stream`
    - Streaming alternative to `orders.list` with **opaque cursor pagination** (vs page-index on `list`). Required when the dataset exceeds 10 000 records — bypasses the page-size cap.
    - Same `ShipmentPackage` shape as `list`; the normalizer was extended to accept Trendyol's stream-only `id` field (vs `shipmentPackageId` on the regular list).
  - **`client.orders.getCargoInvoiceItems(invoiceSerialNumber, { cursor?, limit? })`** → `CursorPage<CargoInvoiceItem>`
    - `GET /integration/finance/che/sellers/{sellerId}/cargo-invoice/{invoiceSerialNumber}/items`
    - Per-parcel cargo-fee breakdown for one cargo invoice. Useful for reconciling Trendyol cargo deductions against your shipped packages. `invoiceSerialNumber` comes from the Current Account Statement with `transactionType=DeductionInvoices`.
    - Page-based pagination (default page size 500, max 500).
    - Note the different path prefix — `/integration/finance/che/...`, not the regular `/integration/order/...`.

  ### Discovery-first wire fix

  The regular `getShipmentPackages` returns `shipmentPackageId`, but the new `getShipmentPackagesStream` returns the same field as `id`. SDK normalizer now accepts both (`shipmentPackageId ?? id`), and the existing `ShipmentPackage.id` public field stays unchanged for callers.

  ### New exports
  - `CargoInvoiceItem`
  - `ListOrdersStreamParams`

  ### Smoke verified (STAGE 2026-05-25)

  ```
  ── 6.8 orders.listStream({ limit: 2 })
  ✓ Got 2 package(s) (nextCursor: eyJzIjpbMjczOCwxNzc5NzI1…)
      pkg   92051591  order 1017338323  Cancelled   0 TRY
      pkg   92027347  order 1238514712  Invoiced    35.79 TRY

  ── 6.9 orders.getCargoInvoiceItems("LONCA-FAKE-INVOICE")
  ℹ getCargoInvoiceItems wire-verified: HTTP 200 for fake serial (empty content array — Trendyol returns empty for unknown serials)
  ```

  ### Phase 3 complete
  - 3a ([#22](https://github.com/loncadev/lonca/issues/22)): status lifecycle (4) ✅
  - 3b ([#23](https://github.com/loncadev/lonca/issues/23)): splitting (4) ✅
  - 3c ([#24](https://github.com/loncadev/lonca/issues/24)): cargo/delivery (4) ✅
  - 3d ([#25](https://github.com/loncadev/lonca/issues/25)): operational metadata (3) ✅
  - **3e (this): read variants (2) ✅**

  **Total: 17 new order endpoints + 1 normalizer extension across 5 stacked PRs.** Orders surface is feature-complete. Next: Phase 4 — Returns/Claims (10 endpoints).

## 0.3.0

### Minor Changes

- [#13](https://github.com/loncadev/lonca/pull/13) [`d04de5a`](https://github.com/loncadev/lonca/commit/d04de5a2043361f2f6896a380403a0456dfa076e) Thanks [@keparlak](https://github.com/keparlak)! - Add `categories.getAttributeValues` — V2 endpoint for fetching the value catalog of a single category attribute.
  - `client.categories.getAttributeValues(categoryId, attributeId, { cursor?, limit? })` → `CursorPage<CategoryAttributeValue>`
    - GETs `/integration/product/categories/{categoryId}/attributes/{attributeId}/values`
    - Page-based pagination internally (max page size 1000); SDK exposes the cursor convention from `@lonca/core` so callers can iterate with `paginate()`
    - Rate limit: 50 req/min (shared with `categories.list` / `getAttributes`)

  **Why this exists:** `categories.getAttributes` returns attribute metadata + flags but typically **omits** the `attributeValues` field on live responses. When `allowCustom` is `false`, you previously had no way to discover the accepted values from the SDK — this fills the gap so you can build valid `createProducts` payloads.

  **Discovery-first wire fix:** The official OpenAPI spec advertises `{ attributeValueId, attributeValueName }` as the response item shape, but live STAGE responses (verified 2026-05-25 on cat 67302 / attr 42737, 4 populated values) return `{ attributeValueId, attributeValue }` — without the `Name` suffix. The SDK normalizes both spellings into `{ id, name }`. Mock test pins the live wire shape so a regression on Trendyol's side surfaces immediately.

  New exports:
  - `ListCategoryAttributeValuesParams`

  Existing `CategoryAttribute.values` JSDoc updated to point at this new method.

  This unblocks the upcoming `products.create` (V2) implementation — the upstream prerequisite chain for product creation is now complete.

- [#17](https://github.com/loncadev/lonca/pull/17) [`b404f79`](https://github.com/loncadev/lonca/commit/b404f795f843cd81a94c8bef628c7375d96c4ebd) Thanks [@keparlak](https://github.com/keparlak)! - Add **Group 5 — product helpers**: `brands.search` and `categories.getByBarcodes`. This is the final group of the products Phase 2 plan — the Trendyol products surface is now feature-complete.

  ### New methods
  - **`client.brands.search(name)` → `Brand[]`**
    - `GET /integration/product/brands/by-name?name=...`
    - Returns matching brands directly without paging the 1000-per-page `list()`.
    - **Discovery-first wire fact**: Trendyol's docs claim case-sensitive exact match; the live wire is actually substring + case-insensitive. Documented in JSDoc.
  - **`client.categories.getByBarcodes(barcodes)` → `BarcodeCategoryLookup`**
    - `POST /integration/ecgw/v1/{sellerId}/lookup/product-categories/by-barcodes`
    - Returns `{ matches: [{barcode, category: {id, name}}], notFound: string[] }`.
    - Normalizes Trendyol's map-shaped `barcodeCategories` response into a flat array.
    - **Requires Trendyol Export Center (AutoFT) enrollment.** Sellers without it will get an auth error — documented in JSDoc.

  `CategoriesResource` now optionally takes a `sellerId` (third constructor arg) for the AutoFT lookup — wired automatically when constructed via `createTrendyolClient`. Other category endpoints are unaffected and require no seller ID.

  ### New exports
  - `BarcodeCategoryLookup`

  ### Smoke verified (STAGE 2026-05-25, output)

  ```
  ── 1.5 brands.search("Trendyol")
  ✓ Got 17 match(es). First 5:
        311522  Trendyol
            40  TRENDYOLMILLA
         14161  TRENDYOLKIDS
         13438  trendyol vavist
        317259  Trendyol Üyelik

  ── 5.5 categories.getByBarcodes(["3535ddvcxxnnbbvc"])
  ✓ matches: 1  notFound: 0
      3535ddvcxxnnbbvc  →      429  Yürüyüş Ayakkabısı
  ```

  Both endpoints round-trip cleanly. Bonus discovery: `brands.search` is substring + case-insensitive (not case-sensitive exact as docs claim).

  ### Phase 2 final state — Trendyol products surface is feature-complete
  - Group 1 ([#13](https://github.com/loncadev/lonca/issues/13)): `categories.getAttributeValues` ✅
  - Group 2 ([#14](https://github.com/loncadev/lonca/issues/14)): read completion (`listUnapproved`, `getBase`, `getBuyboxInfo`) ✅
  - Group 3 ([#15](https://github.com/loncadev/lonca/issues/15)): write core (`create`, `updateContent`, `updateVariants`, `updateUnapproved`, `updateDeliveryInfo`) ✅
  - Group 4 ([#16](https://github.com/loncadev/lonca/issues/16)): lifecycle (`delete`, `archive`/`unarchive`, `unlock`) ✅
  - **Group 5 (this PR): helpers (`brands.search`, `categories.getByBarcodes`) ✅**

  Full chain coverage: brands (list + search) → categories (tree + attrs + values + barcode→cat lookup) → suppliers → products (read approved/unapproved + base + buybox + write 5 endpoints + lifecycle 4 endpoints + batch status) → inventory → orders.

- [#16](https://github.com/loncadev/lonca/pull/16) [`356cba1`](https://github.com/loncadev/lonca/commit/356cba16ce1a5b8a626ced819fb93895c83d8ec0) Thanks [@keparlak](https://github.com/keparlak)! - Add **Group 4 — product lifecycle**: `delete`, `archive`/`unarchive`, `unlock`.

  ### New methods
  - **`client.products.delete(barcodes)`** → `BatchAcceptedResponse`
    - `DELETE /integration/product/sellers/{sellerId}/products` with body `{ items: [{barcode}] }`
    - Trendyol allows deletion of unapproved products and approved products that have been archived for more than a day (and not sales-stopped by Trendyol).
    - **Rate-limited separately at 100 req/min** — much tighter than the other writes (the SDK provisions a dedicated `deleteLimiter`).
  - **`client.products.archive(barcodes)`** → `BatchAcceptedResponse`
  - **`client.products.unarchive(barcodes)`** → `BatchAcceptedResponse`
    - Both `PUT /integration/product/sellers/{sellerId}/products/archive-state` with body `{ items: [{barcode, archived: bool}] }`
    - Exposed as two methods for ergonomic call sites; share one endpoint and one rate limiter.
  - **`client.products.unlock(barcodes)`** → `BatchAcceptedResponse`
    - `PUT /integration/product/sellers/{sellerId}/products/unlock` with body `{ items: [{barcode}] }`
    - Restores selling status for products Trendyol paused due to pricing or supply issues.

  All 4 return the standard `{ batchRequestId }` for `getBatchStatus` polling, max 1000 items per call, and throw `ValidationError` for empty or oversized inputs before hitting the network.

  ### Smoke verified (STAGE 2026-05-25, output)

  ```
  ── 6.45 products lifecycle smoke ────────────────────────
  ✓ delete       accepted; batchRequestId=a6e1dc0a-…
  ✓ archive      accepted; batchRequestId=23691686-…
  ✓ unarchive    accepted; batchRequestId=807b9632-…  (state restored)
  ✓ unlock       accepted; batchRequestId=f372ec93-…
  ```

  All 4 endpoints round-trip with real batch IDs. Archive → unarchive on a real approved barcode completes safely (state restored). Delete + unlock exercise the wire with a throw-away fake barcode (per-item fails server-side without affecting real listings).

  ### Phase 2 progress
  - Group 1 ([#13](https://github.com/loncadev/lonca/issues/13)): `categories.getAttributeValues` ✅
  - Group 2 ([#14](https://github.com/loncadev/lonca/issues/14)): read completion ✅
  - Group 3 ([#15](https://github.com/loncadev/lonca/issues/15)): write core ✅
  - **Group 4 (this PR): lifecycle ✅**
  - Group 5: helpers — `categories.getByBarcodes`, `brands.search`

  After Group 5, **the Trendyol products surface is feature-complete**: brands → categories (tree + attrs + values + barcode→cat) → suppliers → products (read + write + lifecycle) → inventory → orders.

- [#19](https://github.com/loncadev/lonca/pull/19) [`8540fb6`](https://github.com/loncadev/lonca/commit/8540fb6272899438c63d4855be7c55e5f5510cd8) Thanks [@keparlak](https://github.com/keparlak)! - Add **Group 2 — product reads**: 3 endpoints rounding out the read surface ahead of the upcoming write APIs.

  ### New methods
  - **`client.products.listUnapproved({ cursor?, limit?, barcode?, startDate?, endDate?, dateQueryType?, supplierId? })` → `CursorPage<UnapprovedProduct>`**
    - GETs `/integration/product/sellers/{sellerId}/products/unapproved`
    - Returns draft / `rejected` / `pendingApproval` products. Each item is a flat barcode/SKU (not nested under `variants[]` like approved products), with `rejectReasonDetails[]` populated for failed reviews.
    - Same `nextPageToken` cursor convention as `list()`.
    - Rate limit: shares the 2000 req/min filter bucket.
  - **`client.products.getBase(barcode)` → `ProductBase`**
    - GETs `/integration/product/sellers/{sellerId}/product/{barcode}` (singular `product` in path).
    - Cheap polling primitive for `createProducts` — flip-detect `approved: true` and grab the assigned `contentId` / `listingId`.
  - **`client.products.getBuyboxInfo(barcodes)` → `BuyboxInfo[]`**
    - POSTs `/integration/product/sellers/{sellerId}/products/buybox-information`
    - Max 10 barcodes per call; SDK throws `ValidationError` before hitting the network for empty or oversized inputs.
    - Rate limit: 1000 req/min (separate bucket from filter/batch).

  ### Discovery-first wire fixes

  Verified live against Trendyol STAGE on 2026-05-25. The SDK normalizes spec/wire divergence so callers see a clean shape:

  | Endpoint                   | Spec said                                                | Wire returns                                 | SDK                                                                                      |
  | -------------------------- | -------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
  | `filterUnapprovedProducts` | `media: [{url}]`                                         | `images: [{url}]`                            | Surfaces as `images: string[]`; accepts spec-name `media` as fallback                    |
  | `getBuyboxInformation`     | `{barcode, buyboxOrder, buyboxPrice, hasMultipleSeller}` | adds `secondBuyboxPrice`, `thirdBuyboxPrice` | Both extra fields are surfaced — useful when buybox is lost                              |
  | `filterUnapprovedProducts` | enum docs mention `waiting`                              | live returns `pendingApproval`, `rejected`   | Open-enum `UnapprovedProductStatus` (`(string & {})`) so unknown values still type-check |

  ### New exports
  - `ListUnapprovedProductsParams`, `UnapprovedDateQueryType`
  - `UnapprovedProduct`, `UnapprovedProductStatus`, `UnapprovedProductRejectReason`
  - `ProductBase`
  - `BuyboxInfo`

  ### Smoke verified
  - `listUnapproved({limit:2})` pulled `rejected` + `pendingApproval` drafts with reject reasons parsed.
  - `getBase("3535ddvcxxnnbbvc")` → `approved=true, approvedAt=2026-05-21T11:44:53Z, contentId=1135615039`.
  - `getBuyboxInfo(["3535ddvcxxnnbbvc"])` → `order=1, price=100, multipleSeller=false`.

  Phase 2 of Trendyol products coverage: Group 1 (categories.getAttributeValues, [#13](https://github.com/loncadev/lonca/issues/13)) + Group 2 (this PR) are now in. Next: Group 3 — write core (`create`, `updateContent`, `updateVariants`, `updateUnapproved`, `updateDeliveryInfo`).

- [#15](https://github.com/loncadev/lonca/pull/15) [`51d6972`](https://github.com/loncadev/lonca/commit/51d6972efd41d964083b45dcda9428d147a05bee) Thanks [@keparlak](https://github.com/keparlak)! - Add **Group 3 — product write core**: 5 async batch write endpoints completing the product CRUD surface.

  ### New methods

  All 5 share the same contract: async batch, max 1000 items, returns `{ batchRequestId }` to poll via `products.getBatchStatus`. SDK-side validation throws `ValidationError` before hitting the network for empty or oversized batches.
  - **`client.products.create(items)`** — V2 product creation; POSTs `/integration/product/sellers/{sellerId}/v2/products`. Required 14 fields enforced at compile time via `CreateProductV2Input`.
  - **`client.products.updateContent(items)`** — Content updates on approved products (title, description, images, attributes), identified by `contentId`. Partial except attributes (send-all-or-nothing).
  - **`client.products.updateVariants(items)`** — Variant updates on approved products (stockCode, vatRate, dimensionalWeight, warehouse IDs, location-based delivery, lot), identified by `barcode`.
  - **`client.products.updateUnapproved(items)`** — Update draft products (typically to fix rejected drafts surfaced by `listUnapproved.rejectReasonDetails`), identified by `barcode`.
  - **`client.products.updateDeliveryInfo(items)`** — Delivery duration / fast-delivery type updates.

  ### Discovery-first gotchas (verified live STAGE 2026-05-25)

  **Trendyol V2 spec is misleading on `updateUnapproved`**: the spec says only `barcode` is required, but the live endpoint returns HTTP 500 (`TrendyolSystemException` / `TypeError`) when too many optional fields are omitted. In practice, send at least `title`, `description`, `productMainId`, `brandId`, `categoryId`, `stockCode`, `dimensionalWeight`, `vatRate`, `images[]`, and `attributes[]` (an empty array is fine for the latter). Documented in the method JSDoc.

  ### New exports

  Input types (all in `@lonca/trendyol`):
  - `BatchAcceptedResponse` — generic `{ batchRequestId }` shape for all 5 endpoints
  - `CreateProductV2Input`
  - `UpdateContentInput`
  - `UpdateVariantInput`
  - `UpdateUnapprovedInput`
  - `UpdateDeliveryInfoInput`
  - Building blocks: `ProductImageInput`, `ProductAttributeV2Input`, `DeliveryOptionInput`

  ### Smoke verified (output)

  ```
  ── 6.4 products write smoke (5 endpoints) ───────────────
  ✓ create               accepted; batchRequestId=a450334d-d813-4a38-b9e2-…
  ✓ updateContent        accepted; batchRequestId=4ff126fe-7cfb-4b4f-9ca3-…
  ✓ updateVariants       accepted; batchRequestId=c3e4289f-4d70-4fab-be6a-…
  ✖ updateUnapproved     failed: HTTP 400 (Trendyol payload validation;
                           test draft is in a non-updatable state on STAGE,
                           contract verified separately with a clean payload)
  ✓ updateDeliveryInfo   accepted; batchRequestId=2246c5ea-837c-4f7a-8e5f-…
  ```

  The 4 successful endpoints each got a real `batchRequestId` that can be tracked via `getBatchStatus`. The 5th (`updateUnapproved`) round-trips correctly with a clean payload on a clean draft — verified via an isolated probe to the same path; the smoke test happens to hit a pre-rejected draft whose data Trendyol now refuses to re-process.

  ### Phase 2 progress
  - **Group 1** ([#13](https://github.com/loncadev/lonca/issues/13)): `categories.getAttributeValues` ✅
  - **Group 2** ([#14](https://github.com/loncadev/lonca/issues/14)): read completion ✅
  - **Group 3** (this PR): write core ✅
  - Group 4: lifecycle — `delete`, `archive`/`unarchive`, `unlock`
  - Group 5: helpers — `categories.getByBarcodes`, `brands.search`

## 0.2.0

### Minor Changes

- [`5180842`](https://github.com/loncadev/lonca/commit/51808429841d1ef5610a6fa71354ac5fddd7bdce) Thanks [@keparlak](https://github.com/keparlak)! - Add `categories` resource — required for product creation.
  - `client.categories.list()` — fetch the full Trendyol category tree (no pagination; returned in one response)
  - `client.categories.getAttributes(categoryId)` — fetch required and optional attributes for a category, including variant / slicer flags and allowed values

  New exported types: `Category`, `CategoryAttribute`, `CategoryAttributeValue`. IDs are normalized to strings per `@lonca/core` convention.

  Rate-limited to 50 req/min (shared bucket across both endpoints, matching Trendyol's service limits).

  Bottom-up rollout: categories are a prerequisite for the upcoming products resource (`createProduct V2` requires `categoryId` + category attributes).

- [`3cc3df8`](https://github.com/loncadev/lonca/commit/3cc3df8d47ab5a59a76bc482f5b6de73f404252f) Thanks [@keparlak](https://github.com/keparlak)! - Add `inventory` resource — Trendyol stock & price update (a.k.a. `updatePriceAndInventory`).
  - `client.inventory.update(items)` → `{ batchRequestId }`
    - POSTs to `/integration/inventory/sellers/{sellerId}/products/price-and-inventory`
    - Each item: `{ barcode (required), quantity?, salePrice?, listPrice? }`
    - Max 1000 items per call, 20 000 stock per product (Trendyol-side)
    - No rate limit (per Trendyol's service-limits table)
    - Async — poll the returned `batchRequestId` with `client.products.getBatchStatus(...)`
    - Client-side validation throws `ValidationError` for empty or oversized batches before hitting the network

  Verified against Trendyol STAGE on 2026-05-25: a safe smoke test posts a unique fake barcode (`LONCA-SMOKE-<ts>`) so the call cannot match any real product; Trendyol still accepts it asynchronously and returns a real `batchRequestId`.

  New exports: `InventoryResource`, `PriceInventoryUpdate`, `UpdatePriceInventoryResponse`.

  This rounds out the bottom-up Phase 1 set:
  - brands ✓ — read brand catalog
  - categories ✓ — read category tree + attributes
  - suppliers ✓ — read return/shipment addresses
  - products ✓ — read approved products + batch status
  - **inventory ✓ — write stock & price**

  Next major group (separate release): orders + shipment packages.

- [`1f848a5`](https://github.com/loncadev/lonca/commit/1f848a5e1edd6488cc4387c1750c0ed2f880e5d7) Thanks [@keparlak](https://github.com/keparlak)! - Add `orders` resource — list shipment packages (Trendyol's `getShipmentPackages`).
  - `client.orders.list({ cursor?, limit?, status?, orderNumber?, startDate?, endDate? })` → `CursorPage<ShipmentPackage>`
    - GETs `/integration/order/sellers/{sellerId}/orders`
    - Page-based pagination internally; SDK exposes the cursor convention from `@lonca/core` so callers can iterate with `paginate()`
    - Filters: `status`, `orderNumber`, date range
    - Page size capped at Trendyol's 200 max

  Discovery-first workflow: a separate `examples/inspect-orders.mts` script (`pnpm try:inspect-orders`) was used to dump the **real STAGE wire shape** _before_ writing types. The resulting types model the field set as Trendyol actually returns it (47 root-level fields on the package, nested `lines[]`, `packageHistories[]`, `invoiceAddress`, `shipmentAddress`). Wire field `3pByTrendyol` (cannot start with a digit in TypeScript identifiers) is renamed to `threePByTrendyol` on the public surface.

  New exports:
  - `OrdersResource`, `ListOrdersParams`
  - `ShipmentPackage`, `ShipmentPackageStatus`, `OrderLine`, `OrderLineDiscountDetail`, `OrderAddress`, `OrderAddressLines`, `OrderCustomer`, `PackageHistoryEntry`

  Smoke verified live on Trendyol STAGE 2026-05-25: pulled 2 packages
  (`Invoiced` 85 TRY, `Picking` 1300 TRY) with lines and customer info parsed
  correctly. Regression mock test pins the exact PROD-shape package.

  Phase 1 SDK now covers the full bottom-up chain: brands → categories → suppliers → products → inventory (write) → orders.

- [`7ed69b5`](https://github.com/loncadev/lonca/commit/7ed69b583b48fef42dc35ac32d91006bfdfcd17f) Thanks [@keparlak](https://github.com/keparlak)! - Add `products` resource — Trendyol approved-product filter + async batch status helper.
  - `client.products.list({ cursor?, limit?, barcode?, startDate?, endDate? })` → `CursorPage<Product>`
    - Reads `/integration/product/sellers/{sellerId}/products/approved`
    - Pagination uses Trendyol's `nextPageToken` (cursor mode) — required when the dataset exceeds 10 000 items, and used transparently for all responses
    - Filters: barcode, date range
    - Rate-limited to 2000 req/min
  - `client.products.getBatchStatus(batchRequestId)` → `BatchRequestResult`
    - Reads `/integration/product/sellers/{sellerId}/products/batch-requests/{batchRequestId}`
    - 4-hour retention window on Trendyol's side
    - Rate-limited to 1000 req/min

  Public types: `Product`, `ProductVariant`, `ProductAttribute`, `NamedRef`, `BatchRequestResult`, `BatchRequestItemResult`, `BatchRequestStatus`, `ListProductsParams`.

  Wire shape verified against live Trendyol PROD on 2026-05-25 (see `examples/try-trendyol.mts`). The SDK surfaces stable typed fields and keeps the untouched response on `Product.raw` / `ProductVariant.raw` / `BatchRequestResult.raw` for fields not modeled yet. Notable wire facts the typed surface paves over:
  - `contentId` (not `productContentId`), nested `brand` / `category` `{id,name}` refs
  - `variants[].barcode` — root-level barcode does not exist
  - `creationDate` / `lastModifiedDate` are ms-epoch; SDK exposes ISO strings
  - `getBatchRequestResult` returns `PROCESSING` for unknown batch IDs (not 404)

- [`35e815a`](https://github.com/loncadev/lonca/commit/35e815a04d55aebbbc8370b612e478f8d9e729d8) Thanks [@keparlak](https://github.com/keparlak)! - Add `suppliers` resource for fetching the seller's registered addresses (shipment, returning, invoice, warehouse).
  - `client.suppliers.getAddresses({ forceRefresh? })` — returns the address list, served from an in-memory cache to respect Trendyol's `1 req/hour` service limit
  - `client.suppliers.invalidateCache()` — drops the cache so the next call hits the API
  - Cache TTL defaults to 1 hour; override with `new SuppliersResource(transport, sellerId, { cacheTtlMs })` when constructing manually
  - Concurrent `getAddresses()` calls are deduplicated into a single in-flight request

  Required for the upcoming products resource — `createProduct V2` needs `shipmentAddressId` and `returningAddressId`, both sourced from here.

  New exported types: `SupplierAddress`, `SupplierAddressType`, `SuppliersResourceOptions`. Trendyol's legacy `_ADDRESS` suffix is stripped from `addressType` for cleaner consumer code.

### Patch Changes

- [`44b5cac`](https://github.com/loncadev/lonca/commit/44b5cac07d609ad7a4432857e64d1e7cd5f5aa6c) Thanks [@keparlak](https://github.com/keparlak)! - Align endpoint paths and response shapes with the official Trendyol OpenAPI specs.

  **Bug fix** — `@lonca/trendyol@0.1.0` shipped with placeholder paths that did not match Trendyol's actual API. Anyone trying to use the SDK against real Trendyol would have hit `404 Not Found`. This release fixes all four implemented endpoints.

  Path corrections (verified against the OpenAPI spec embedded in each `/reference/<endpoint>.md` page and against the official Postman collection):

  | Endpoint                   | Was                                          | Now                                               |
  | -------------------------- | -------------------------------------------- | ------------------------------------------------- |
  | `brands.list`              | `/sapigw/brands`                             | `/integration/product/brands`                     |
  | `categories.list`          | `/sapigw/product-categories`                 | `/integration/product/product-categories`         |
  | `categories.getAttributes` | `/sapigw/product-categories/{id}/attributes` | `/integration/product/categories/{id}/attributes` |
  | `suppliers.getAddresses`   | `/sapigw/suppliers/{sellerId}/addresses`     | `/integration/sellers/{sellerId}/addresses`       |

  Response shape fixes:
  - `categories.list` now parses the root-level JSON array (Trendyol does not wrap it in `{ categories: [...] }`)
  - `categories.getAttributes` pipes through the V2-only `allowMultipleAttributeValues` flag (added as an optional field on `CategoryAttribute`)

  Public TypeScript surface and runtime behavior remain otherwise unchanged.

- [`caac4ba`](https://github.com/loncadev/lonca/commit/caac4ba6c3cd9d3db85d35785fc6f298435a4a5d) Thanks [@keparlak](https://github.com/keparlak)! - Fix `categories.getAttributes` parsing against the real Trendyol response shape (verified against STAGE + PROD on 2026-05-25).

  The OpenAPI spec advertised an `attributeValues: [...]` field per attribute, but Trendyol's live `getCategoryAttributes` endpoint omits it for most attributes — the endpoint returns attribute metadata and flags only, not the value catalog. Without this fix, calling `getAttributes` against any real category would throw `TypeError: Cannot read properties of undefined (reading 'map')`.

  Changes:
  - `CategoryAttribute.values` is still typed as `CategoryAttributeValue[]`, but the resource now defaults to `[]` when the field is absent. JSDoc explains where to look for the actual value catalog when needed.
  - New optional `CategoryAttribute.categoryId` field — Trendyol echoes this back per attribute and it's useful for grouping.
  - Defensive normalization handles missing `attribute`, missing flags (default `false`), and missing `attributeValues`.
  - Categories list response handles both root-array and `{ categories: [...] }` wrapped shapes (different envs/seller setups behave differently).
  - New regression mock test pinned to the exact wire format we observed in PROD.

  Also documents in `brands.ts` that Trendyol enforces a **minimum 1000 page size** server-side regardless of the `limit` value passed.

## 0.1.0

### Minor Changes

- [`13931d2`](https://github.com/loncadev/lonca/commit/13931d2f634eafbec6c0cbca9761747d86ecccd7) Thanks [@keparlak](https://github.com/keparlak)! - Initial release of `@lonca/trendyol` — type-safe SDK for the Trendyol Marketplace API.

  This first scaffold proves the transport spine end-to-end. Subsequent releases will fill in the orders, products, inventory, and webhook resources.
  - `createTrendyolClient({ sellerId, apiKey, apiSecret, env, integratorName?, clientIp?, logger?, timeoutMs? })` factory
  - `client.brands.list()` — first endpoint, paginated via `@lonca/core` `CursorPage`, rate-limited to Trendyol's 50 req/min
  - Transport layer with:
    - All 5 required Trendyol headers (`Authorization`, `x-clientip`, `x-correlationid`, `x-agentname`, `User-Agent`)
    - Per-request UUID correlation IDs
    - Exponential backoff retry on 429 / 5xx (honors `Retry-After`)
    - Per-endpoint token-bucket rate limiting
    - `AbortSignal` + request timeout (default 30s)
  - HTTP error mapping to `@lonca/core` error hierarchy (`AuthError`, `RateLimitError`, `NotFoundError`, `ServerError`, `ValidationError`, `NetworkError`, `TimeoutError`)
  - Dual ESM + CJS build via tsup, 35 vitest tests covering auth/errors/transport/brands
