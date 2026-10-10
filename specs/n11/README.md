# n11 OpenAPI collection

Per-section OpenAPI 3.0.3 documents for the REST part of the n11 seller API, compiled by hand
from the [n11 developer portal](https://developer.n11.com/documentation/) (Turkish).

## Provenance and licence

- **Source**: n11 publishes **no machine-readable REST definition** (no OpenAPI, Swagger or
  Postman collection). Each REST operation exists only as an HTML page with prose, a
  request-parameter table, usually a response-field table, and JSON examples. Every operation
  here is compiled by hand from its page into
  [`scripts/specs/n11/source.mjs`](../../scripts/specs/n11/source.mjs), which is reviewed like
  code. [`scripts/specs/build-n11.mjs`](../../scripts/specs/build-n11.mjs) turns that source
  plus the committed probe baseline into the files below. Nothing comes from `@lonca/n11`: the
  SDK is checked against these files, not the other way round.
- **Compiled**: 2026-10-11, from the pages as published that day. The pages carry no
  last-modified date, so there is no per-operation portal date (unlike Trendyol's
  `x-lonca-portal-updated-at`). Every operation carries `x-lonca-doc-url`, the page it was
  compiled from. Raw page captures are **not** committed, and the build reads no network: it
  needs no capture file and no credentials.
- **Copyright**: the API definitions describe n11's API and are © n11.com (the portal footer
  reads "© Telif Hakkı 2026 n11.com. Tüm Hakları Saklıdır."). They are redistributed here for
  interoperability with the published API, with only the normalisation and the additions
  described below. They are **not** covered by this repository's MIT licence. If you represent
  n11 and want any of these files removed or corrected, open an issue and they will be taken
  down promptly. The scripts, this README and `manifest.json` are Lonca's own work (MIT).
- **SOAP is out of scope.** The SOAP services (`https://api.n11.com/ws/*`: product questions,
  catalogue search, invoice links, returns, partial cancel, shipment companies) are not
  OpenAPI material, and whether their WSDLs may be redistributed is still an open question with
  n11 (`sdks/n11/RESEARCH.md`, section 11, question 11). They are neither described nor
  redistributed here.

### Why the hand-maintained input is a `.mjs` module

The same reasons as Trendyol's `source.mjs` (see [`specs/trendyol/README.md`](../trendyol/README.md)):
no YAML parser in the repo, dependency-free build scripts, comments next to every non-obvious
choice, and eslint / prettier / ordinary diffs. Small builders (`int64()`, `str()`, `arr()`,
`exampleOnly()`, …) keep the definitions short; the generated JSON is plain OpenAPI.

## Files

n11 groups its documentation into **portal sections** ("Ürün Entegrasyonu", "Sipariş
Entegrasyonu", "İade/İptal Entegrasyonu", …), visible in the sidebar and in each page's URL.
Each section with REST operations is one file here. A split by host is impossible (everything is
`https://api.n11.com`), and a split by path family would cut one section in two:
"Ürün Entegrasyonu" serves categories from `/cdn/…` and products from `/ms/…`, while "Sipariş
Entegrasyonu" uses `/rest/delivery/…` and `/rest/order/…`. So, as with Trendyol's portal API
definitions, the section is the service unit, and each file's server is the bare host.

| File            | Portal section                                                                                    | Server                | Ops | Schemas |
| --------------- | ------------------------------------------------------------------------------------------------- | --------------------- | --: | ------: |
| `product.json`  | [Ürün Entegrasyonu](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/) (REST) | `https://api.n11.com` |   8 |      20 |
| `order.json`    | [Sipariş Entegrasyonu](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/) (REST)  | `https://api.n11.com` |   6 |      15 |
| `manifest.json` | index of the files above (generated)                                                              |                       |     |         |

The other sections have no REST operation: "İade/İptal Entegrasyonu" is SOAP only, and
"n11faturam", "n11depom" and "Mikro İhracat" describe fields and rules of the services above
(the Mikro İhracat page is used as a second source for the order listing; see below).

## Operation coverage

**14 operations**: every REST operation in the resource map of `sdks/n11/RESEARCH.md`
(section 6). "Basis" says
where a body's schema comes from (`x-lonca-doc-basis`, see below): **table** = the page has a
field table for it, **example** = the page has only example payloads and prose for it.

| Operation                                       | operationId                 | Page                                                                                                                                                             | Request basis   | Response basis | `@lonca/n11`               | Prod wire (drift) |
| ----------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------- | -------------------------- | ----------------- |
| `GET /cdn/categories`                           | `getCategories`             | [Kategori Ağacı Listeleme](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/kategori-agaci-listeleme/)                                       | —               | example        | `categories.list`          | yes               |
| `GET /cdn/category/{categoryId}/attribute`      | `getCategoryAttributesList` | [Kategori Özellikleri Listeleme](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/kategori-ozellikleri-listeleme/)                           | —               | example        | `categories.getAttributes` | yes               |
| `GET /ms/product-query`                         | `getSellerProducts`         | [Satıcı Ürün Sorgulama](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/satici-urun-sorgulama/)                                             | — (query table) | table          | `products.list`            | yes               |
| `POST /ms/product/tasks/product-create`         | `createProduct`             | [Ürün Yükleme](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-yukleme/)                                                               | table           | table          | —                          | —                 |
| `POST /ms/product/tasks/product-update`         | `updateProduct`             | [Ürün Bilgisi Güncelleme](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-bilgisi-guncelleme/)                                         | table           | table          | —                          | —                 |
| `POST /ms/product/tasks/price-stock-update`     | `updatePriceAndStock`       | [Ürün Fiyat-Stok Güncelleme](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-fiyat-stok-guncelleme/)                                   | table           | table          | —                          | —                 |
| `POST /ms/product/tasks/product-delete`         | `deleteProduct`             | [Ürün Silme](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-silme/)                                                                   | table           | table          | —                          | —                 |
| `POST /ms/product/task-details/page-query`      | `getTaskDetails`            | [Task Detail Sorgulama](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/task-detail-sorgulama/)                                             | example         | example        | —                          | —                 |
| `GET /rest/delivery/v1/shipmentPackages`        | `getShipmentPackages`       | [Sipariş Listeleme Servisi](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-listeleme-servisi/)                                         | — (query table) | table          | `orders.list`              | yes               |
| `PUT /rest/order/v1/update`                     | `updateOrder`               | [Sipariş Kalemlerini Güncelleme](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-kalemlerini-guncelleme-servisi/)                       | table           | example        | —                          | —                 |
| `POST /rest/delivery/v1/splitCombinePackage`    | `splitCombinePackage`       | [Sipariş Paket Bölme](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-paket-bolme/)                                                     | example         | example        | —                          | —                 |
| `POST /rest/delivery/v1/splitPackageByQuantity` | `splitPackageByQuantity`    | [Miktar Bazlı Paket Bölme & Sipariş Ürün İptali](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/miktar-bazli-paket-bolme-siparis-urun-iptali/) | example         | example        | —                          | —                 |
| `PUT /rest/delivery/v1/collectionRequest`       | `createCollectionRequest`   | [Toplama Talebi Oluşturma](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/toplama-talebi-olusturma/)                                           | table           | example        | —                          | —                 |
| `PUT /rest/order/v1/labor-costs`                | `updateLaborCosts`          | [Sipariş Kalemine İşçilik Bedeli Gönderme](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-kalemine-iscilik-bedeli-gonderme/)           | table           | example        | —                          | —                 |

- **Fully compiled from field tables** (request and/or response): product query, the four
  product tasks, order listing, order line update (request), collection request (request; the
  table has no type column) and labour costs (request).
- **Compiled from examples and prose only**, because the page has no field table: the category
  tree and category attributes (but every key the prod probes saw is in them; see below), task
  details, both package splits (the split-by-quantity page tables only the cancel reason ids),
  and the responses of order line update, collection request and labour costs. These schemas
  are as good as the examples: a key no example shows is missing, and a type is only what the
  example value suggests.
- Every operation `@lonca/n11` calls over REST is described (4 / 4), and all 4 match their
  prod wire shapes in `pnpm drift` with 0 breaking findings.

## How the pages were compiled

- **Field names, required-ness and table types come from the field tables, not from the
  examples.** Several examples are not valid JSON: the product-query example has an unquoted
  `"sellerNickname": testMagaza`, the order-listing example lacks its outer braces and a comma
  and spells two statuses with a leading space (`" Shipped"`), and several examples send the
  string `"null"` for a null value. Where a table and an example disagree on a type, the table
  wins and the property description says what the example shows ("Lonca: …").
- **Response types**: most response tables have no type column, so a response field's JSON type
  is read from the page's example value (`integer` with `format: int64` for ids and epoch-ms
  timestamps, `number` for amounts and rates). A field whose example value is `null`, or that
  the example omits, gets **no `type`** unless the table text names its values (for example
  `micro`: "true: e-İhracat siparişi, null: Yurt içi siparişi" → nullable boolean).
  `nullable: true` is set where an example shows `null` or the prose says the field can be
  null (package `id` for location-specific delivery orders, `shippingAddress.fullName` and
  `deliveryAddressType` for delivery-point orders).
- **Second source for the order listing**: the
  [Mikro İhracat](https://developer.n11.com/documentation/mikro-ihracat/mikro-ihracat/) page
  documents the same `shipmentPackages` response with a complete e-export example. It types
  `cargoSenderNumber`, `hsCode`, `invoiceLink`, `invoiceDate`, `etgbNo`, `etgbDate`, line
  `barcode` and `productOrigin` (null or absent in the order page's example) and shows two keys
  the order page does not mention, `isReturned` and `dst_office_id`. Those properties carry the
  Mikro İhracat page as their own `x-lonca-doc-url`.
- **Authentication**: two `apiKey` header schemes, `appKey` and `appSecret`, required together
  ("Authorization no auth seçiniz. Headers alanına appKey ve appSecret bilgisini eklemeniz
  gerekir."). The two category pages ask for `appKey` only, while the
  [changelog](https://developer.n11.com/documentation/changelog/) (2025-06-17, 2025-07-17)
  says category services need key and secret from 2025-08-15, so those operations list both
  alternatives. Header names are case-insensitive; some pages write `appkey` / `appsecret`.
- **Descriptions** are the pages' own Turkish wording, shortened. Request examples are kept only
  where the page has no request table (task details).
- **Not compiled**: error responses (the pages document none; the per-path-family error bodies
  observed on prod are in `sdks/n11/RESEARCH.md`, section 11, question 2), and the long
  attribute-id tables (product-safety and nutrition attributes on the product-update page, the
  labour-cost category list), which the operation descriptions point to instead.

## Lonca additions

Everything in the files is compiled from n11's pages, except these:

- `info.x-lonca-source`: `kind: "hand-compiled"`, portal section, section URL, compile date,
  source file and generator. `info.version` is the compile date (n11 does not version its
  API).
- Per operation: `x-lonca-doc-url` (the page it was compiled from), `operationId` and `tags`.
  The operationIds are lower-camel versions of the service names n11's prose uses where it uses
  one (`GetCategories`, `GetCategoryAttributesList`, `CreateProduct`, `TaskDetails`,
  `GetShipmentPackages`, `UpdateOrder`); the rest are Lonca's. `summary` is the page title.
- `x-lonca-doc-basis` on every request body and 200 response: `"table"` or `"example"` (see
  above).
- `x-lonca-doc-example-only: true` on a property, inside a `"table"` body, that the page's
  example shows but its field table does not list (wrapper keys such as `payload` / `skus` /
  `lines`, paging envelopes, the address sub-fields of the order listing).
- `x-lonca-doc-url` on a **property**: the property, or its type, comes from a different page
  than the operation (the Mikro İhracat page, above).
- "Lonca: …" sentences inside descriptions, for compilation notes such as table/example
  disagreements.
- **`x-lonca-observed`**: properties seen in **production** responses but absent from the
  compiled schema, typed from the observed JSON type, as for Trendyol. The source is the
  committed contract-probe baseline [`probe-snapshots/n11.json`](../../probe-snapshots/n11.json)
  (env `prod`; key sets and JSON types only, never values): for each probe in
  `PROBE_OBSERVATIONS` the build walks the probe's JSON `wire` shape against the documented 200
  schema. With the 2026-10-10 baseline there are **none**: every key prod sent is documented
  on the operation's page or on the Mikro İhracat page.
- **`x-lonca-observed-types`** on a documented property, with the JSON types prod sent, when
  (a) they contradict the documented type, or (b) the page gives no type at all and prod sent a
  non-null value. The documented type is left unchanged. Current entries:
  - (a) `ProductQueryItem.maxPurchaseQuantity` (example `5`, prod `null`) and
    `BillingAddress.countryCode` (example the string `"null"`, prod `null`). These are the
    docs-vs-prod contradictions `pnpm drift` would otherwise report as `undocumented-null`.
  - (b) package `taxId` and `taxOffice`, and `BillingAddress.taxId` / `taxHouse` (`null` in
    both examples, `null` or `string` on prod).
- `info.x-lonca-observed-source` names the snapshot on every file that received observations.

Known prod facts from `sdks/n11/RESEARCH.md` (section 11) and where they are reflected:

| Prod fact (2026-10-10)                                                            | In the spec                                                                                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| product-query `barcode` can be `null`                                             | untyped (example `null`): no finding                                                                            |
| product-query `maxPurchaseQuantity` can be `null`                                 | `x-lonca-observed-types: ["null"]` on the documented `integer`                                                  |
| leaf categories have `subCategories: null`                                        | `subCategories` is a nullable array (documented by the example and the prose)                                   |
| order envelope `{ pageCount, totalPages, page, size, content }`                   | `ShipmentPackagesPage`, from the example (`x-lonca-doc-example-only`)                                           |
| order timestamps are epoch ms                                                     | `int64` (`lastModifiedDate`, `agreedDeliveryDate`, `packageHistories[].createdDate`, `invoiceDate`, `etgbDate`) |
| product-query ids, prices, quantity, `vatRate`, `commissionRate` are JSON numbers | typed `integer` / `number` from the example                                                                     |

## Validation

- The build refuses to write a file with a dangling or external `$ref`, an unreferenced schema,
  a path template `{param}` that is not declared `in: path`, an operation without responses,
  without an `x-lonca-doc-url` on developer.n11.com, or with a missing or duplicate
  `operationId`. An observation whose probe's recorded wire path is not the mapped operation's
  path also fails the build.
- `@apidevtools/swagger-cli@4.0.4 validate`: both documents **valid**.
- `redocly lint --extends=recommended` (Redocly CLI 2): **0 errors**, 16 warnings, all
  `operation-4xx-response` (no page documents an error response) and `info-license` (omitted on
  purpose; see the licence above).
- `pnpm drift`: the 4 REST probe exchanges match `getCategories`,
  `getCategoryAttributesList`, `getSellerProducts` and `getShipmentPackages` with 0 breaking,
  0 additive and 0 warning findings. The 4 SOAP `POST` exchanges stay unmatched (warnings).

## Known gaps

- **REST only.** SOAP services are out of scope (see the licence section).
- **Example-only schemas** (see the coverage section) can miss keys no example shows, and their
  types are inferred from example values. Only the four read operations are checked against
  production; no write is ever probed.
- **No error responses**, no rate-limit headers (none documented; none seen on prod).
- **Undocumented encodings stay undocumented**: how `categoryIds` encodes several values, the
  shape of `rejectInfo`, the element shape of `customTextOptions` / `customTextOptionValues`,
  the `sku` object of task details for task types other than price/stock (the only example).
- Observed types are JSON types, so `number` is never narrowed to `integer`, and the snapshot
  depth cap (6) leaves nested category levels and order-line `variantAttributes` items
  uncompared.

## Regenerating

```bash
# rebuild specs/n11/*.json + manifest.json from scripts/specs/n11/source.mjs
# and probe-snapshots/n11.json (no network, no credentials)
pnpm specs:n11:build        # = node scripts/specs/build-n11.mjs

# exit 1 if the committed files are not what source.mjs + the snapshot produce
pnpm specs:n11:check        # = node scripts/specs/build-n11.mjs --check (also run in CI)

# optional structural lint (no local install needed)
pnpm --package=@redocly/cli@2 dlx redocly lint --extends=minimal specs/n11/order.json specs/n11/product.json
```

Build options: `--out DIR`, `--probe FILE`, and `--no-probe` to skip the observation pass.
Re-run the build after `pnpm probe:prod` rewrites `probe-snapshots/n11.json`, and after any
edit to `source.mjs`. When an n11 page changes, update `source.mjs` and `COMPILED_AT` together.
