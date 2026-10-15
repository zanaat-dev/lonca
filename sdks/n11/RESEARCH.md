# n11 seller API: research notes

Roadmap item 5.1, third marketplace. Status: **0.x release** (2026-10-13). Sections 1–9 were
written from the docs alone on 2026-10-10, before any n11 account existed; the live findings that
followed (a seller's prod keys for reads, then n11's test store for writes) are recorded in sections
7, 10 and 11, which take precedence over earlier inferences.

- **Captured:** 2026-10-10, from n11's public developer portal.
- **Notation:** every factual claim links to the page it came from. Claims marked **(inferred)**
  are my reading of the docs, not something the docs say. Claims marked **(unverified)** need a live
  account to confirm.
- **Why this file is here and not on the docs site:** the Starlight sidebar
  (`docs/astro.config.mjs`) is a hand-curated set of user docs for released packages. A page there
  about an unreleased, unsupported SDK would look like a support claim. Once n11 ships, the
  user-facing parts can move into `docs/src/content/docs/guides/n11.md`.

## 1. Where the docs are

| What                                     | URL                                                                                                               | Notes                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Developer portal (current)**           | https://developer.n11.com/documentation/                                                                          | A WordPress/Elementor site with about 25 pages in Turkish: products, orders, returns, notices, n11faturam, n11depom, micro-export, and a changelog. Each page has prose, parameter tables and JSON or XML examples.                                                                                                                                        |
| Changelog                                | https://developer.n11.com/documentation/changelog/                                                                | Dated entries from 2024-04-04 to 2026-08-03.                                                                                                                                                                                                                                                                                                               |
| Old support-centre pages (being retired) | e.g. https://magazadestek.n11.com/satis-surecleri/restapi-satici-urun-sorgulama-10493                             | Each one now only says "Dokümantasyon Adresimiz Güncellendi" and links to the new portal. The site returns HTTP 403 to non-browser clients, probably bot protection.                                                                                                                                                                                       |
| Legacy SOAP manual (.docx, 2020)         | https://n11scdn.akamaized.net/a1/org/sp/w/3/n11_api_dokumantasyonu_turkce_w3KWkpKB.docx?v=1591683564148           | Linked as "API Entegrasyon Dokümanı" from the support-centre footer. It covers the whole old SOAP surface (`api.n11.com/ws/*.wsdl`): Category, City, Product, ProductSelling, ProductStock, Order, ShipmentCompany, Shipment, Settlement, Ticket, ClaimCancel, Return, ClaimExchange and SAP e-invoice services. The `v=` timestamp dates it to June 2020. |
| Contact                                  | `sellerintegration@n11.com`, given on most changelog entries (https://developer.n11.com/documentation/changelog/) |                                                                                                                                                                                                                                                                                                                                                            |

**Is there a machine-readable definition?** For the REST services, no. The portal publishes no
OpenAPI, Swagger or Postman collection. Every REST endpoint exists only as prose and examples. The
SOAP services still in use do have WSDLs, and the portal links them, for example
`https://api.n11.com/ws/productService.wsdl`
([questions page](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-soru-cevap-servisi/)),
`CatalogService.wsdl`, `SellerInvoiceService.wsdl`, `ReturnService.wsdl` and
`ClaimCancelService.wsdl`. Those files are served by the **API host** (`api.n11.com`), not by the
docs site, so I did not fetch them: this task was not allowed to call any n11 API endpoint. As a
result, the research PR had **no `specs/n11/` and no capture script** (see section 9). Since
2026-10-11, [`specs/n11/`](../../specs/n11/) holds an OpenAPI document of the REST pages,
compiled by hand (section 9); the SOAP side is still not described there.

## 2. API style: REST is current, SOAP is still in use

n11 is part-way through a SOAP-to-REST migration. As of October 2026 the surface is **mixed**:

- **REST (JSON).** This is current for products, categories, stock and price, and orders.
  - 2024-04-04: stock/price update and product update moved to REST batch "tasks"
    ([changelog](https://developer.n11.com/documentation/changelog/)).
  - 2024-12-25: order listing, order approval and package split moved to REST (same page).
  - 2025-01-25: n11 announced that the SOAP product-write services were **closed**: all of
    `ProductSellingService`, all of `ProductStockService`, and `ProductService`'s
    `SaveProduct` / `UpdateProductBasic` / price and discount methods (same page).
- **SOAP (XML).** This is still the documented way to:
  - list and answer product questions (`ProductService` → `GetProductQuestionList`,
    `GetProductQuestionDetail`, `SaveProductAnswer`;
    [page](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-soru-cevap-servisi/));
  - search the catalogue (`CatalogService` → `SearchCatalog`;
    [page](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/hizli-urun-yukleme/));
  - send invoice links (`SellerInvoiceService` → `SaveLinkSellerInvoice`;
    [page](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/fatura-linki-gonderme/));
  - handle return claims (`ReturnService` → `ClaimReturnList`, approve, deny, pend and reason
    lists; [page](https://developer.n11.com/documentation/iade-entgrasyonu/iade-talepleri-servisi/));
  - request a partial cancel (`ClaimCancelService` → `ClaimCancelPartial`;
    [page](https://developer.n11.com/documentation/iade-entgrasyonu/parcali-iptal-talebi/)).
- **SOAP order services still exist.** The 2025-10-14 changelog entry lists the SOAP
  `DetailedOrderList`, `OrderDetail` and `OrderList` as affected services, next to REST
  `GetShipmentPackages`. They were therefore still running at that date. n11 also publishes a
  SOAP-to-REST field and status mapping for orders
  ([page](https://developer.n11.com/documentation/bilgilendirme/soap-restapi-siparis-servisi-karsilastirmasi/)).
  **(inferred)** SOAP order listing is the legacy path, and new integrations should use REST.

**What this means for the SDK (inferred):** build REST-first. Add a small SOAP layer only for
questions, returns, invoice links and catalogue search, until n11 moves those to REST as well.

## 3. Auth, environments, headers

- **REST auth** is two plain request headers, `appKey` and `appSecret`. Every REST page says
  "Authorization: no auth seçiniz. Headers alanına appKey ve appSecret bilgisini eklemeniz
  gerekir." (e.g. [product query](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/satici-urun-sorgulama/)).
  Pages spell them as `appKey`/`appSecret` or `appkey`/`appsecret`
  ([order update](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-kalemlerini-guncelleme-servisi/)).
  HTTP header names are case-insensitive, so either spelling should work. The skeleton sends
  lowercase.
- **Category endpoints.** Their pages still say only `appKey` is needed
  ([categories](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/kategori-agaci-listeleme/)).
  However, the 2025-06-17 and 2025-07-17 changelog entries say category services stop working
  without "API Key & Secret" from 2025-08-15. The skeleton sends both headers on every call.
- **SOAP auth** puts the same key pair in the request body as `auth.appKey` / `auth.appSecret`
  (examples on every SOAP page above). The namespace is `http://www.n11.com/ws/schemas`.
- **Getting credentials.** The key and secret come from the n11 Seller Office (`so.n11.com`).
  **(unverified)** The exact menu path is not on the portal. A third-party guide describes creating
  an "API account" from the account section, with the secret sent by e-mail and only Admin users
  allowed to do it (https://docs.helorobo.com/en/helorobo/article/n11-integration).
- **Environments.** The only base URL in the docs is `https://api.n11.com`, with path families
  `/cdn/…` (categories), `/ms/…` (products), `/rest/…` (orders) and `/ws/…` (SOAP). The portal
  documents **no sandbox or test environment** and no test-order service. The skeleton's `env`
  therefore only accepts `'prod'`. n11 support confirmed this on 2026-10-13: their test
  environment is closed to outside parties. Instead they hand integrators a **test store on
  prod** (Seller Office login plus its own `appKey`/`appSecret`, kept out of the repo). To test
  orders, create a product whose title and image clearly mark it as a test product (or use one
  of the store's existing test products), give it a low price, and place a real order.
- **Integrator identification.** Product write tasks take a required body field `integrator`:
  "use the same name in all your requests"
  ([product create](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-yukleme/),
  [price/stock](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-fiyat-stok-guncelleme/)).
  n11 documents **no** `User-Agent` convention, unlike Trendyol and Hepsiburada, and no
  correlation-id header. The skeleton sends neither. It stores `integratorName` on the transport so
  write resources can fill `integrator`. n11 support (2026-10-13): send the integrator's company
  name; there is no registration and nothing to match in Seller Office. Product services that
  require the field expect one common value, with no variation in letter case or `I`/`ı`/`İ`/`i`,
  because n11 logs by it. They named no `User-Agent` or IP allowlist requirement.

## 4. Rate limits and batch limits (documented)

| Limit                                                                                                               | Source                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /rest/delivery/v1/shipmentPackages`: at most **1000 requests/minute**                                          | [order listing](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-listeleme-servisi/)                              |
| SOAP `GetProductQuestionList`: **once per minute**                                                                  | [questions](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-soru-cevap-servisi/)                                |
| Product tasks (create, update, price/stock, delete): **≤ 1000 SKUs** per request                                    | the four task pages, e.g. [price/stock](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-fiyat-stok-guncelleme/) |
| `GET /ms/product-query`: `size` default 20, **max 250**                                                             | [product query](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/satici-urun-sorgulama/)                              |
| `shipmentPackages`: `size` **max 100**; date window clamped to **15 days**; no orders from before **November 2024** | [order listing](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-listeleme-servisi/)                              |
| `SearchCatalog`: ≤ 10 values per multi-value parameter                                                              | [catalogue](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/hizli-urun-yukleme/)                                     |
| Legacy SOAP: an over-limit call returns `errorCode` `maxCallLimit.reached`                                          | legacy .docx manual (section 1)                                                                                                           |

Nothing else is documented. n11 support added on 2026-10-13 that limits work differently from a
plain requests-per-minute quota:

- **CreateProduct:** a fixed **10,000 products per hour per store**.
- **UpdateProductPriceAndStock:** a limit that varies with the number of products (no figure
  given).
- **Bursts:** a client that keeps sending requests milliseconds apart is taken for an attack. n11
  raises an alarm and first suspends the **IP** temporarily, then restricts it.

They described no 429 or `Retry-After`. What a suspended IP receives is still unknown, so the SDKs
must pace themselves rather than wait for a 429: a default limiter on every bulk path (paging,
product writes) is the safe design.

## 5. Pagination

- **REST** uses Spring-Data-style pages. The request takes `page` (0-based) and `size`. The
  response is `{ content[], totalElements, totalPages, number, size, first, last, empty, pageable }`
  ([product query](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/satici-urun-sorgulama/),
  [task details](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/task-detail-sorgulama/)).
  The docs' stopping rule: "start at page 0, use `totalPages`, and treat the page whose `content` is
  empty as the last one". The order listing response example also has `pageCount`, `totalPages`,
  `page` and `size` at the top
  ([order listing](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-listeleme-servisi/)).
- **SOAP** uses `pagingData { currentPage (0-based), pageSize }` in the request and
  `pagingData { currentPage, pageSize, totalCount, pageCount }` in the response
  ([returns](https://developer.n11.com/documentation/iade-entgrasyonu/iade-talepleri-servisi/)).
- **Mapping to `@lonca/core`.** REST pages fit `CursorPage` with the page index as the opaque
  cursor, the same approach `@lonca/trendyol` takes. SOAP pages fit `OffsetPage` / `paginateOffset`
  (`pageCount` is present) or the same `CursorPage` approach. The skeleton uses `CursorPage` for
  `products.list`.

## 6. Resource map: n11 vs `@lonca/trendyol` / `@lonca/hepsiburada`

| Area                          | n11 service (style)                                                                                                                                                                                                                                                                                                      | TY equivalent                                     | HB equivalent                                     | Notes                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Categories                    | `GET /cdn/categories`, the full tree in one call ([doc](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/kategori-agaci-listeleme/)) (REST)                                                                                                                                                          | `categories.list`                                 | `categories.list`                                 | `subCategories: null` marks a leaf. Products must use a leaf id.                                                                                                                                                                         |
| Category attributes           | `GET /cdn/category/{id}/attribute`, which returns attributes **with their values** ([doc](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/kategori-ozellikleri-listeleme/)) (REST)                                                                                                                  | `categories.getAttributes` + `getAttributeValues` | `categories.getAttributes` + `getAttributeValues` | Flags: `isMandatory`, `isVariant`, `isSlicer`, `isCustomValue`, `isN11Grouping`.                                                                                                                                                         |
| Brands                        | No brand service. Brand is category attribute `attributeId: 1` ("Marka") (same doc)                                                                                                                                                                                                                                      | `brands.list/search`                              | —                                                 | **(inferred)** A cross-marketplace "brands" capability would be `false` for n11.                                                                                                                                                         |
| Product list (read)           | `GET /ms/product-query` ([doc](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/satici-urun-sorgulama/)) (REST)                                                                                                                                                                                      | `products.list` / `listInventoryAndPrice`         | `listings.list`                                   | **Implemented in the skeleton.** Price, stock, status and commission all come in one row.                                                                                                                                                |
| Product create                | `POST /ms/product/tasks/product-create` ([doc](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-yukleme/)) (REST, async task)                                                                                                                                                                   | `products.create`                                 | `catalog.uploadProductViaFile`                    | Required: `shipmentTemplate` (by name), `preparingDay`, `productMainId`, `vatRate ∈ {0,1,10,20}`, title of at least 15 characters ([errors](https://developer.n11.com/documentation/bilgilendirme/api-hata-mesajlari-ve-aciklamalari/)). |
| Catalogue match / fast create | SOAP `SearchCatalog`, then REST `product-create` with `catalogId`/`barcode` ([doc](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/hizli-urun-yukleme/))                                                                                                                                            | `products.getBase` (roughly)                      | `catalog.uploadFastListing` (roughly)             |                                                                                                                                                                                                                                          |
| Product update                | `POST /ms/product/tasks/product-update` ([doc](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-bilgisi-guncelleme/)) (REST, async task)                                                                                                                                                        | `products.updateContent`                          | `productUpdates`                                  | `status: Active/Suspended` here works like TY archive/unarchive. Core attributes (brand, colour, size) can only be changed by n11.                                                                                                       |
| Stock and price               | `POST /ms/product/tasks/price-stock-update` ([doc](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-fiyat-stok-guncelleme/)) (REST, async task)                                                                                                                                                 | `inventory.update`                                | `listings.uploadStock` / `uploadPrice`            | Stock-only updates are allowed. Price updates need `listPrice` and `salePrice` together, with ≤ 2 decimals, a dot as decimal separator, and `listPrice ≥ salePrice`. `currencyType` is `TL`, `USD` or `EUR`.                             |
| Product delete                | `POST /ms/product/tasks/product-delete` ([doc](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-silme/)) (REST, async task)                                                                                                                                                                     | `products.delete`                                 | `catalog.deleteByMerchantSkuList`                 |                                                                                                                                                                                                                                          |
| Batch status                  | `POST /ms/product/task-details/page-query` (`{ taskId, pageable }`) ([doc](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/task-detail-sorgulama/)) (REST)                                                                                                                                          | `products.getBatchStatus`                         | `listings.get*Upload`, `catalog.getProductStatus` | Task status values are `IN_QUEUE`, `PROCESSED` and `REJECT`. Each SKU gets `SUCCESS` or `FAIL` plus `reasons[]`. Note the dates are `dd-MM-yyyy HH:mm:ss` strings, not epochs.                                                           |
| Orders (list)                 | `GET /rest/delivery/v1/shipmentPackages` ([doc](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-listeleme-servisi/)) (REST)                                                                                                                                                                     | `orders.list`                                     | `orders.list`                                     | Orders are package-centric, like TY shipment packages. Statuses are `Created`, `Picking`, `Shipped`, `Cancelled`, `Delivered`, `Unpacked` and `UnSupplied`, one per request. Timestamps are epoch milliseconds ("GMT+3").                |
| Order approve                 | `PUT /rest/order/v1/update` (`{ lines:[{lineId}], status:"Picking" }`) ([doc](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-kalemlerini-guncelleme-servisi/)) (REST)                                                                                                                          | `orders.updatePackageStatus` (Picking)            | `orders.createPackages`                           | Returns a result per line, so it can partly succeed.                                                                                                                                                                                     |
| Package split                 | `POST /rest/delivery/v1/splitCombinePackage`, `POST …/splitPackageByQuantity` ([split](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-paket-bolme/), [by qty / cancel](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/miktar-bazli-paket-bolme-siparis-urun-iptali/)) (REST) | `orders.splitPackage` / `splitPackageByQuantity`  | `orders.splitPackage`                             |                                                                                                                                                                                                                                          |
| Logistics pickup              | `PUT /rest/delivery/v1/collectionRequest` (Horoz, Ceva, Borusan only) ([doc](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/toplama-talebi-olusturma/)) (REST)                                                                                                                                         | —                                                 | —                                                 |                                                                                                                                                                                                                                          |
| Labour cost (jewellery)       | `PUT /rest/order/v1/labor-costs` ([doc](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-kalemine-iscilik-bedeli-gonderme/)) (REST)                                                                                                                                                              | `orders.updateLaborCosts`                         | `orders.updateLineItemLaborCost`                  |                                                                                                                                                                                                                                          |
| Invoice link                  | SOAP `SaveLinkSellerInvoice` ([doc](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/fatura-linki-gonderme/))                                                                                                                                                                                            | `invoices.sendLink`                               | `orders.sendInvoiceLink`                          | HTTPS link to a pdf, png or jpeg, at most 2048 characters. Micro-export orders also need `invoiceNumber` and `invoiceDateTime` ([doc](https://developer.n11.com/documentation/mikro-ihracat/mikro-ihracat/)).                            |
| Returns (claims)              | SOAP `ReturnService` ([doc](https://developer.n11.com/documentation/iade-entgrasyonu/iade-talepleri-servisi/))                                                                                                                                                                                                           | `claims.*`                                        | `claims.*`                                        | Statuses: `REQUESTED`, `CANCELLED`, `DENIED`, `PENDING`, `PENDED`, `APPROVED`. Dates are `dd/mm/yyyy` strings.                                                                                                                           |
| Partial cancel                | SOAP `ClaimCancelPartial` ([doc](https://developer.n11.com/documentation/iade-entgrasyonu/parcali-iptal-talebi/))                                                                                                                                                                                                        | `orders.cancelPackageItem`                        | `orders.cancelLineItem`                           |                                                                                                                                                                                                                                          |
| Questions                     | SOAP `GetProductQuestionList/Detail`, `SaveProductAnswer` ([doc](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-soru-cevap-servisi/))                                                                                                                                                         | `questions.*`                                     | `questions.*`                                     | One answer per question, 1 to 2048 characters. Listing is limited to once per minute.                                                                                                                                                    |
| Settlements / finance         | **Not on the new portal.** The legacy SOAP `SettlementService` (`GetSettlementList/Detail`) appears in the 2020 .docx; n11 support (2026-10-13) says finance still runs over SOAP                                                                                                                                        | `finance.*`                                       | `accounting.*`                                    | **(unverified)** It may no longer be live. Order lines do carry `commissionRate`, `sellerCampaignCommissionRate`, `netMarketingFeeRate` and `netMarketplaceFeeRate`.                                                                     |
| Shipment companies            | Order docs refer to a `GetShipmentCompanies` method ([order listing](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-listeleme-servisi/)), but the new portal has no page for it. The legacy SOAP `ShipmentCompanyService` is in the .docx                                                      | — (`orders.changeCargoProvider` only)             | `shipping.getCargoFirms`                          | **(unverified)**                                                                                                                                                                                                                         |
| Cargo labels                  | Not documented                                                                                                                                                                                                                                                                                                           | `labels.*`                                        | `orders.getPackageLabel`                          | No label service (n11, 2026-10-14). The label is `cargoTrackingNumber` (campaign code) as CODE-128.                                                                                                                                      |
| Webhooks                      | Not documented                                                                                                                                                                                                                                                                                                           | `webhooks.*`                                      | —                                                 | Polling only.                                                                                                                                                                                                                            |
| Test orders                   | Not documented; n11 support (2026-10-13): a real low-priced order on a test product in their prod test store                                                                                                                                                                                                             | `testOrders.*`                                    | `testOrders.*`                                    | There is no sandbox either (section 3).                                                                                                                                                                                                  |
| n11 warehouse (n11depom)      | `sender` filter `SELLER`/`N11`/`ALL` on product query, order listing and returns ([doc](https://developer.n11.com/documentation/n11depom/n11depom/))                                                                                                                                                                     | —                                                 | —                                                 |                                                                                                                                                                                                                                          |

The CONTRIBUTING minimum of orders, products and inventory is reachable over REST alone.

## 7. Semantics worth knowing before harmonising

- **Async writes.** Every product write returns `{ id, type, status: IN_QUEUE | REJECT, reasons[] }`.
  The per-SKU outcome is only available from task-details. This is the same model as TY's
  `batchRequestId` and HB's tracking ids
  ([price/stock](https://developer.n11.com/documentation/n11-marketplace-entegrasyonu/urun-fiyat-stok-guncelleme/)).
- **Failures can arrive with HTTP 200.** A task can be `REJECT`, a SKU or line can be `FAIL`, and
  SOAP responses carry `result.status: "failure"`. **(inferred)** Resources have to turn these into
  typed results or errors themselves, because the HTTP-status mapping in `errors.ts` never sees
  them.
- **Product tasks on the wire (n11's test store, 2026-10-13).** Every product write was exercised
  on the test store with the store's own keys:
  - **Request-level errors are HTTP 500** with `{ errorCode: "TASK_ERR_…", errorMessage }`: a
    missing `integrator` or an empty `skus` (`TASK_ERR_008`, bean-validation text), a body without
    `payload` (`TASK_ERR_000` "Undefined error."), broken JSON or an unknown enum value
    (`TASK_ERR_006`, Jackson text). `mapHttpError` maps every `TASK_ERR_*` to `ValidationError`.
  - **Per-SKU errors come back with HTTP 200** in task details (`status: FAIL`, Turkish
    `reasons`): an unknown stock code, more than 2 decimals, `listPrice` below `salePrice`, a lone
    `salePrice` ("list price boş olamaz"), an update with nothing to change, an invalid category,
    a create without images and attributes, an image n11 cannot fetch ("All Images are invalid"),
    and a price over the category's cap ("fahiş fiyat … Maximum 42,000 TL").
  - **Placeholder row.** While a task is `IN_QUEUE`, task details already hold one row with no
    `itemCode`, `status: FAIL` and the reason "N sku işlenmeye alındı.". It is not a result; the
    SDK drops it. Real rows appear one by one as SKUs finish.
  - **Timing.** Price/stock, update and delete tasks finished in 1 to 5 seconds. Create tasks took
    from a few seconds to about 15 minutes, and one with an `http://` image took about 20 minutes
    to fail. `waitForTask` defaults to 2 minutes; creates need a longer `timeoutMs`.
  - **Task timestamps** are `dd-MM-yyyy hh:mm:ss` on a 12-hour clock with no AM/PM (a task created
    at 22:58 Turkish time reads `10:58:24`), so the SDK passes them through unparsed.
  - **Unknown task id:** `200 {}` (the SDK throws `NotFoundError`).
  - **Same stock code twice in one task:** both rows are applied in order; the last one wins.
  - **Update status enum** (from the Jackson error): `Active`, `CatalogRejected`, `InApproval`,
    `Suspended`, `InCatalogApproval`, `Unlisted`; only `Active` / `Suspended` are documented as
    inputs. The "nothing to update" message lists one undocumented field,
    `exportListableByActorActionCode`.
  - **Create side effects:** n11 re-capitalises the title ("Lonca SDK" → "Lonca Sdk"), stores the
    image on its own CDN with `order` 0, and can attach a catalogue (`catalogId`) and clear
    `productMainId`. A product with a custom brand value opened as `InCatalogApproval`. On such a
    catalogue product an update of `productMainId` reports `SUCCESS` but is not stored (2026-10-14).
  - **Test store, approved orders (2026-10-14).** The store held three old `Picking` orders of
    other integrators (one line, quantity 1). On them: `sendInvoiceLink` → success (the link did not
    show in Seller Office; the REST `invoiceLink` field is filled for micro-export orders only, per
    the docs); `updateLaborCosts` → `FAIL` "kategori uyumsuzdur" (the docs page names a category
    list but shows none); `createCollectionRequest` → "Satıcı toplama talebi için uygun değil"
    (store not eligible); `cancelItem` 1 of 1 → "parçalı iptal talebi için uygun durumda değildir",
    although the docs allow approved and late-approved orders. Approve, split and return decisions
    need our own orders: LONCA-ORDER-1 / -2 (10 TL) were opened and n11 support was asked for test
    orders, return claims and the quantity-split / collection permissions. The docs have no test or
    sandbox page and no way to move a test order to shipped / delivered.
  - **Test store after n11's reply (2026-10-15).** Other developers' test orders on the store
    (including two on LONCA-ORDER-1 / -2, paid in full by a marketplace discount: `totalAmount` 0,
    `totalDiscountAmount` 10) all moved from `Created` to `Picking` about one second after
    creation (package `histories`), so something on the shared store approves new orders and
    `approve` may not get a `Created` line to work on. Read-only checks on them all passed:
    `orderNumber`, `status` and update-date filters, `ASC` / `DESC`, a 2-row page size returning
    every package once, money and fee fields against the raw lines, and `claims.listReturns` per
    status (the store has approved, denied and cancelled claims, none awaiting a decision).
    - `createCollectionRequest` on our own `Picking` package no longer fails at store level; it
      fails per line with `SELLER_API.orderItemInvalidForCollectionRequest` ("Order item toplama
      talebi için uygun değil"). The docs limit the service to logistics-company shipments
      (Horoz, Ceva, Borusan); the package ships with Aras, and no shipment template in Seller
      Office offers a logistics company.
    - The labour-cost category list is now on the docs page: 68 jewellery categories (gold,
      silver, diamond, …). Creating a 10 TL test product in one of them (category 1104101,
      `Gümüş Aksesuar`) failed twice over: the category is restricted (n11 asks for supply
      invoices) and its minimum price is 32.23 TL. `updateLaborCosts` needs n11 to open such a category.
- **End-to-end run** (`pnpm e2e:n11`, `scripts/e2e/n11.mts`, 2026-10-14): all 31 methods against
  the test store. 20 verified on the success path; the order writes, return decisions and
  `questions.answer` only up to n11's refusal for a package, claim or question in the wrong state
  (the store has no unpaid open orders). A new SKU was created, matched to a catalogue product and
  processed in about 15 seconds.
  - **Task results echo the SKU** under `sku`, with fields per task type (for a create:
    `n11ProductId`, `groupId`, `status`, prices, images; for price/stock: prices and `stock`).
- **Order status vocabulary.** n11 publishes the SOAP-to-REST status mapping
  ([page](https://developer.n11.com/documentation/bilgilendirme/soap-restapi-siparis-servisi-karsilastirmasi/)).
  REST package statuses map onto `@lonca/core` `order-status` almost one to one
  (`Created`, `Picking`, `Shipped`, `Delivered`, `Cancelled`, `UnSupplied`). **(inferred)**
- **Money.** Prices are decimal numbers in major units with at most 2 decimals. The currency code is
  `TL`, not `TRY`. The skeleton normalises it to `TRY` and converts with `moneyFromMajor`.
  - Invoice amount per line: `(price × quantity) − (sellerDiscount + sellerCouponDiscount) = sellerInvoiceAmount`
    ([order listing](https://developer.n11.com/documentation/n11-siparis-entegrasyonu/siparis-listeleme-servisi/)).
- **Identifiers grow wider.** The docs warn that `n11ProductId` and `orderNumber` grow in width over
  time ("9 → 10 digits", "12 → 13 digits"). The SDK keeps all ids as strings, which matches Lonca's
  convention.
- **PII.** Order rows carry buyer name, e-mail, GSM, address and `tcId`. Since 2025-10-15 `tcId` can
  be empty ([changelog](https://developer.n11.com/documentation/changelog/)). Pick-up-point orders
  (`deliveryAddressType` `KTN`, `EASYPOINT` or `PUP`) put the point's address in `shippingAddress`
  and leave the buyer only in `billingAddress` (changelog 2026-08-03).
- **Doc quality.** The product-query response example is not valid JSON
  (`"sellerNickname": testMagaza` has no quotes), and it types `listPrice` once as `10000` and once
  as `10000.0`. The order example has a missing comma and status values with a leading space
  (`" Shipped"`). Wire types must therefore be confirmed against live traffic, which is exactly what
  the contract probes are for.

## 8. SOAP transport design

Five documented services still need SOAP: questions, returns, partial cancel, invoice link and
catalogue search. Options:

1. **The `soap` npm package.** It reads the WSDL at runtime and builds clients dynamically. The
   downside is the weight it would add to a currently near-zero-dependency SDK: a large transitive
   tree (axios, xml-crypto, formidable and more), a WSDL fetch from the API host whenever a client
   starts, and untyped dynamic clients. **Rejected.**
2. **Hand-written envelope builder plus a small XML parser.** Each operation is a short template.
   The `sch:` namespace, `<auth><appKey/><appSecret/></auth>` and the operation fields are all
   copied from the doc examples, with proper XML escaping. Responses are parsed with a small parser,
   either `fast-xml-parser` (one pure-JS dependency, no native code) or an in-repo parser of about
   100 lines that handles only elements and text, which is all n11's responses use.
   **Recommended.** Typed request and response interfaces then come from the WSDL or XSD, or from
   the doc tables.
3. **Wait for REST.** n11 has migrated one service family per year (products 2024, orders
   2024–25). Questions and returns may follow, but there is no announced date.

Needed in `@lonca/core` for option 2: `createRequester` currently JSON-stringifies every non-GET
body (`packages/core/src/transport.ts`). It needs one of two seams. Either let a pre-serialised
`string` body pass through with a caller-supplied `Content-Type: text/xml; charset=utf-8` and a
`SOAPAction` header, or give the n11 transport a second, small requester. Responses already come
back as text when they are not JSON (`safeJson` falls back to text), so parsing can stay in the n11
SDK.

SOAP faults probably arrive as HTTP 500 with a `<faultstring>`. The JSON status mapping would see
them as retryable `ServerError`s, so the SOAP path needs its own fault-to-`LoncaError` mapping, and
must not retry faults that are not transient.

**Built (2026-10-10), option 2:**

- `@lonca/core` `createRequester` gained a `rawBody` string option (sent as-is; it takes precedence
  over the JSON `body`). That is the only core change.
- `src/soap/xml.ts` is the in-repo parser of about 150 lines plus an envelope serialiser. The parser
  strips prefixes, turns repeated siblings into arrays and maps `xsi:nil` to `null`. It
  **rejects DTDs and processing instructions**, so there is no entity expansion and no XXE.
- `N11Transport.soap({ service, operation, fields })` has its own requester. It POSTs to
  `https://api.n11.com/ws/<service>/` with `Content-Type: text/xml; charset=utf-8` and
  `SOAPAction: ""`, and puts the keys only in the envelope's `auth`. Calls are sent as idempotent,
  because every SOAP method wired so far is a read.
- **Errors.** `result.status: failure` (sent with HTTP 200) goes through `mapSoapFailure`: an
  auth-like code is `AuthError`, a "limit" code is `RateLimitError`, anything else is
  `ValidationError`. A `Fault` with a client `faultcode` is `ValidationError`; other faults follow
  the HTTP status (5xx is a retried `ServerError`). On prod, a wrong secret answers **HTTP 200**
  with `result.status: failure` and `errorCode: SELLER_API.authenticationFailed`, which maps to
  `AuthError`. No fault has been seen yet.
- **Read resources** (element names from the WSDLs, which declare `elementFormDefault="unqualified"`):
  - `questions.list` / `questions.get`: `GetProductQuestionList` / `GetProductQuestionDetail`. Dates
    are `DD/MM/YYYY` on the Istanbul calendar day. The documented once-a-minute limit is the
    default limiter.
  - `claims.listReturns` / `listCancels` and the deny / pending reason lists.
  - `shipping.getShipmentCompanies`.
- **SOAP writes** (built 2026-10-13): `SaveProductAnswer`, `ClaimReturnApprove` / `Deny` /
  `Pending`, `ClaimCancelPartial`, `SaveLinkSellerInvoice` and `SearchCatalog`. Element names and
  order come from the WSDLs (read, not redistributed); the doc examples are not reliable here (the
  `ClaimReturnApprove` example sends `claimCancelId`, and the WSDLs add `splitQuantity` to approve
  and deny, which the pages do not describe). Writes go out with `idempotent: false`, so a lost
  response is never replayed. Service path segments are case-insensitive (`SellerInvoiceService`
  and `sellerInvoiceService` both answer).

## 9. Licence and redistribution

- The portal footer says "© Telif Hakkı 2026 n11.com. Tüm Hakları Saklıdır." (all rights reserved)
  on every documentation page. I found no licence grant, no terms specific to the API docs, and no
  machine-readable REST definition.
- **So nothing of n11's is redistributed in this PR.** The SDK's TypeScript types are Lonca's own
  description of the documented wire format, written for interoperability. The test fixtures use
  invented values shaped like the doc examples. No doc text or examples are copied into the repo
  beyond short field names and enum values.
- **If `specs/n11/` is wanted later**, there are two possible sources:
  - The WSDLs and XSDs from `api.n11.com/ws/*.wsdl`. They are machine-readable, but they come from
    the API host, and they only cover the SOAP side.
  - An OpenAPI document compiled by hand from the REST pages, like Trendyol's `video.json`
    (`specs/trendyol/README.md`).

  Either would follow `specs/README.md`: © n11 (**(unverified)** confirm the operating legal
  entity before naming it in a README), redistributed for interoperability, not MIT, and taken
  down on request. Asking `sellerintegration@n11.com` for
  permission first would be cheap insurance.

- **WSDLs: answered (2026-10-13).** Asked whether `api.n11.com/ws/*.wsdl` may be kept and
  redistributed in this MIT repo as a schema reference, n11 support replied that using our own
  types is the healthier choice. Read that as a no: the WSDLs stay out of the repo, and the SOAP
  layer keeps its hand-written types.
- **Done for REST (2026-10-11):** the second option.
  [`specs/n11/`](../../specs/n11/README.md) has one document per portal section with REST
  operations (`product.json`: 8 operations, `order.json`: 6), compiled by hand from the pages
  into `scripts/specs/n11/source.mjs` and built by `scripts/specs/build-n11.mjs`
  (`pnpm specs:n11:build` / `specs:n11:check`). Fields seen on prod but missing from the pages
  would be added as `x-lonca-observed` from `probe-snapshots/n11.json` (none with the
  2026-10-10 baseline; two docs-vs-prod `null`s are marked `x-lonca-observed-types`). The licence
  note names
  "n11.com", as the portal footer does, not a legal entity. The WSDLs are not fetched or
  redistributed (question 11 in section 11).

## 10. What the SDK covers

- **Package.** `sdks/n11/` is `@lonca/n11`, publishable from `0.1.0` (changeset
  `n11-first-release`), with a `./testing` entry (`createFakeN11Client`). It is listed in
  `scripts/health-packages.mts`, `scripts/api-surface.mts` (snapshots `etc/n11-*.d.ts.snapshot`)
  and the docs TypeDoc entry points; the user guide is `docs/src/content/docs/guides/n11.md`.
- **Harmonisation:** `normalizeStatus` / `statusMap` map the seven package statuses onto
  `@lonca/core`'s `NormalizedOrderStatus` (`Unpacked` → `picking`, `UnSupplied` → `cancelled`);
  `n11Capabilities` satisfies `MarketplaceCapabilities`; resource and method names follow
  `@lonca/trendyol` where n11 has the same operation (`inventory.update` / `updateAndWait`,
  `products.create` / `update` / `delete`).
- **`createN11Client({ appKey, appSecret, env: 'prod', integratorName, logger?, timeoutMs?, fetch? })`.**
- **`N11Transport`.** Built on `@lonca/core` `createRequester`. It sends the `appkey` and
  `appsecret` headers and JSON content headers, and uses the base URL `https://api.n11.com`. It
  joins array query values with commas.
- **`mapHttpError`.** Maps 401/403 to `AuthError`, 400/422 to `ValidationError`, 404 to
  `NotFoundError`, 429 to `RateLimitError`, 5xx to `ServerError`, and anything else to
  `UNKNOWN`. On top of that it reads the observed envelopes (question 2 below): a `/ms` `500
InternalServerException` naming `MissingRequestHeaderException` is an `AuthError`, one naming
  `ConstraintViolationException` / `IllegalArgumentException` is a `ValidationError`, and a body
  with `errorCode` ending in `authenticationFailed` is an `AuthError` whatever the status.
  Messages are fixed and redacted. Issues come from `errors[].reason`, `reasons[]`,
  `errorCode`/`errorMessage` or `message`.
- **`products.list(params)`.** `GET /ms/product-query` with every documented filter, `size` clamped
  to 250, and the page index used as the `CursorPage` cursor. It stops on an empty page,
  `last: true` or `totalPages`. Rows are normalised to `N11Product`: string ids, `Money` prices, and
  `raw` kept.
- **`categories.list()` / `categories.getAttributes(id)`.** `GET /cdn/categories` (the whole
  tree, `leaf` derived from `subCategories: null`) and `GET /cdn/category/{id}/attribute`
  (attributes with their values, string ids).
- **`orders.list(params)`.** `GET /rest/delivery/v1/shipmentPackages` with `status`,
  `startDate`/`endDate` (a `Date` or epoch ms), `orderNumber` and ordering; `size` clamped to 100,
  page index as cursor, the documented 1000 requests/minute as the default limiter. Packages are
  normalised to `N11ShipmentPackage`: string ids, `Money` in TRY, ISO timestamps, nulls dropped,
  `raw` kept.
- **`n11Capabilities`.** `scheduledPricing: false`, `stockOnlyBatch: true`,
  `listingUpdatedAt: false`, all from the docs.
- **Tests.** Fixture-based with a mocked transport or `fetch` and invented values (shapes follow
  prod). Line coverage is 100%.
- **SOAP reads** (section 8): `questions.list` / `get`, `claims.listReturns` / `listCancels` /
  reason lists, and `shipping.getShipmentCompanies`. They were verified on prod on 2026-10-10
  (read operations only, approved by the maintainer):
  - **Reason lists.** Prod repeats the list element itself (`<denyReasonTypeDataList><id/><value/>`
    once per reason), without the WSDL's inner `denyReasonTypeData` wrapper. The SDK accepts both.
  - **Unknown question id.** `GetProductQuestionDetail` answers `result: success` with no
    `productQuestion`. The SDK throws `NotFoundError`.
  - **Extra cancel fields.** `ClaimCancelList` rows also carry `buyerName`, `buyerEmail`,
    `buyerPhone`, `paymentDate`, `shipmentCompany` and `deliveryFeeType`, none of which is in the
    WSDL.
  - **Date formats.** Claim dates are `DD/MM/YYYY`; question-detail dates are `YYYY-MM-DD`.
  - Every response carries `result.status`, including the question responses, whose WSDL omits it.
- **Product writes** (verified on n11's test store, 2026-10-13; see section 7):
  `products.create` / `update` / `delete` and `inventory.update` queue a task and return
  `{ taskId, type, status, reasons }`; `products.getTask` reads every page of task details and
  drops the placeholder row; `products.waitForTask` and `inventory.updateAndWait` (chunks of 1000)
  poll until `PROCESSED` / `REJECT`. Batch size, price decimals, the sale/list price pair,
  `listPrice ≥ salePrice` and empty updates are checked before sending.
- **Order and SOAP writes** (n11's test store, 2026-10-13). The store has no order in `Created`
  or `Picking` and no return claim awaiting a decision, so success paths could only be checked
  where data allowed:
  - **Verified success:** `questions.answer` (a second answer fails with
    `SELLER_API.productQuestion.alreadyAnswered`), `catalog.search` by title + category, by id and
    by barcode (an unknown barcode gives an empty `<products/>`).
  - **Verified request shape, failure only:** `orders.approve` and `orders.updateLaborCosts` answer
    200 with per-line `{ lineId, status: FAIL, reasons }` (`reasons` is one string; a line id n11
    does not know is silently left out of `content`). `splitPackage`, `splitPackageByQuantity` and
    `createCollectionRequest` answer `400 { code, status: "failure", errorCode: "SELLER_API.…",
errorMessage }`. An invalid `status` on the line update is `400` plain text in ISO-8859-1.
    `claims.approveReturn` / `denyReturn` / `postponeReturn` on an approved claim answer
    `SELLER_API.claimReturn.invalidRequestFor…`; on an unknown id, approve says
    "claimReturnId alanı boş olamaz" (`SELLER_API.nullParam`) and deny says `systemError`.
    `orders.cancelItem` on a cancelled line: `SELLER_API.claimCancel.invalidRequestForPartial`.
    `orders.sendInvoiceLink` on an unknown order: `SELLER_API.order.not.found`.
  - **Error mapping:** SOAP "not found" codes → `NotFoundError`, `systemError` → `ServerError`,
    the rest → `ValidationError`.
  - **Partial-cancel reasons** come from `ClaimCancelDenyReasonType` (61 "Stokta Kalmayan Ürün", 62,
    63, 64, 81); the REST split-and-cancel uses its own documented ids (61–65).
- **Contract probes.** `scripts/probe/probes/n11.mts` runs the four reads above against prod
  (`pnpm probe:prod -- --only n11`); the shape baseline is `probe-snapshots/n11.json`.

## 11. Open questions that need an n11 account

Checked on prod on 2026-10-10 with a seller's own keys, **read-only GETs only** (no write, no
SOAP call: SOAP requests are `POST`s and were not sent). Answers are marked **Answered**,
**Mostly answered** or **Partly answered**; the rest stay open. On 2026-10-11 the open ones were
sent to n11 seller integration support by e-mail; their reply of 2026-10-13 is marked
**n11 (2026-10-13)**.

1. **Sandbox.** Is there a test environment or test seller? If not, can n11 create test orders for
   an integrator account? Without one, every write is a production write.
   **Answered, n11 (2026-10-13):** the test environment is closed to outside parties. n11 gave us a
   test store on prod (credentials kept out of the repo). Test orders are real orders: a product
   marked as a test product in its title and image (or an existing test product of the store),
   at a low price. Every write is still a production write, only on a store meant for it.
   **n11 (2026-10-15):** there is no test payment method; n11 itself pays for test orders.
   Order a low-priced test product, then get the money back by cancelling or returning it (n11
   helps with a cancel or return that gets stuck). `Shipped` is set by the seller in Seller
   Office; `Delivered` is fed by the cargo companies, so n11 sets it on request (send them the
   order number). A return can be opened once the order is shipped; a return is followed by a
   postpone request, so one order line covers both.
2. **Error envelope.** What status codes and JSON bodies do REST failures use (bad key, missing
   secret, validation)? Is 401 used, or 403, or 200 with an error body?
   **Answered:** it differs per path family.
   - `/ms`: Spring envelope `{ "@type", name, message, description, urlStack, errors: [{ reason }] }`.
     Wrong secret: `401 SellerApiUserUnauthorizedException`. Missing `appsecret` header:
     `500 InternalServerException` / `MissingRequestHeaderException`. `size` over 250, an unknown
     `saleStatus` and a negative `page`: `500` with `ConstraintViolationException` /
     `IllegalArgumentException`.
   - `/rest`: wrong secret is `400 { code: 400, status: "failure", errorCode:
"SELLER_API.authenticationFailed", errorMessage, errorCategory: "SELLER_API" }`; a missing
     header is `400` HTML.
   - `/cdn`: wrong key is `403 text/plain` "Authentication failed"; an unknown or non-leaf
     category is `400 { errorCode: "invalidInput", errorMessage }`.
   - An unknown path is `503` HTML. No 200-with-error body was seen on these reads.
3. **Rate limits.** What are the limits outside `shipmentPackages` and the question list? Is a 429
   returned, with `Retry-After`? Are the limits per key or per IP?
   **Partly answered:** no response carries a rate-limit or `Retry-After` header; no 429 was seen
   (limits were not pushed on purpose). **n11 (2026-10-13):** CreateProduct is a fixed 10,000
   products/hour per store; UpdateProductPriceAndStock varies with the product count; requests
   arriving milliseconds apart trigger attack detection, a temporary IP suspension and then a
   restriction (section 4). No 429 was mentioned. Still unknown: other endpoints' limits and the
   response a suspended IP gets.
4. **Header names.** Do the `cdn` category endpoints really reject requests without `appSecret` now?
   Does any endpoint care about header-name case?
   **Answered:** `/cdn/categories` still answers 200 with `appkey` alone (403 with no headers);
   `/ms` and `/rest` require both. Lower-case `appkey` / `appsecret` work everywhere.
5. **`product-query` wire.** How is `categoryIds` encoded (comma-separated or a repeated
   parameter)? Is the response `status` vocabulary the same as the `productStatus` filter? What
   shape is `rejectInfo`? Are numeric fields really numbers? What happens when `page` is past
   `totalPages`?
   **Mostly answered:** ids, prices, `quantity`, `vatRate` and `commissionRate` are JSON numbers;
   `barcode` and `maxPurchaseQuantity` can be `null`; `rejectInfo` is absent on active products
   (its shape is still unknown); a page past the end is `200` with an empty `content`. A single
   `categoryIds` value filters. **n11 (2026-10-13):** several ids go comma-separated in one
   value (what the SDK sends); more than 1000 ids answer `500`, so `products.list` rejects them
   with a `ValidationError` before sending.
   The 250-row sample had only `status: Active`, `saleStatus: On_Sale`, `sender: SELLER` and
   `currencyType: TL`.
6. **Orders.** Confirm the meaning of "GMT+3 epoch ms" for `startDate`/`endDate`, the 15-day
   clamping, and the `orderByField` behaviour. Are `Cancelled` and `Unpacked` really filterable?
   **Mostly answered:** all seven statuses are accepted by the filter (an unknown value is `200`
   with an empty page, not an error). With no dates the last ~15 days come back; with only
   `startDate`, 15 days from it; a 40-day range answered like the last 15 days, so the window is
   clamped silently. `size` over 100 is silently clamped to 100. The envelope is `{ pageCount,
totalPages, page, size, content }`, where `pageCount` equals the number of rows in the page.
   Timestamps are epoch ms. **n11 (2026-10-13):** `orderByField` is a boolean: `true` applies the
   dates to the package's last update, `false` or absent to its creation (the SDK now types it
   `boolean`). The dates are "the epoch ms of a Turkish time", which is how we put the question.
   **Checked on n11's test store (2026-10-13):** for two cancelled packages, a 4-minute window
   around the `Created` history timestamp returned the package and the same window shifted by
   ±3 hours did not; with `orderByField: true` the same held around `lastModifiedDate`. So the
   query dates use the same epoch as the response timestamps (a plain `Date.getTime()`, as the
   SDK sends), and `orderByField: true` does switch to the update date.
7. **SOAP lifetime.** Are SOAP `OrderList`/`DetailedOrderList` and `CategoryService` still up, and
   is there a sunset date? Are questions and returns moving to REST?
   **Partly answered:** `ProductService` (questions), `ReturnService`, `ClaimCancelService` and
   `ShipmentCompanyService` answer on prod (2026-10-10). The order and category SOAP services were
   not called. No sunset date is known. **n11 (2026-10-13):** no dates yet for moving these
   services to REST or for shutting SOAP down. Cancel requests were retired long ago: only the
   partial cancel (`ClaimCancelPartial`) is still active in the cancel-claim service. Response
   types are to be redesigned after the REST move, which will take time; build on the current
   ones.
8. **Finance.** Is the legacy `SettlementService` still live, or is there a REST replacement for
   settlements and commission invoices?
   **Answered, n11 (2026-10-13):** finance still runs over SOAP; there is no REST replacement.
9. **Shipment companies, cargo labels, city lists.** Are they still SOAP-only
   (`ShipmentCompanyService`, `CityService`), and is there any label service?
   **Partly answered:** `GetShipmentCompanies` works over SOAP. **n11 (2026-10-13):** cities
   and the rest stay on SOAP. **Cargo labels, n11 (2026-10-14):** there is no label
   integration, so no PDF/ZPL over the API; it may be planned later but is not on the agenda
   (passed to their development team). The label is the campaign code from Seller Office or
   from `shipmentPackages` (`cargoTrackingNumber`), printed as a CODE-128 barcode.
10. **Integrator identity.** Does n11 register integrators by name? Should `integrator` match
    anything configured in Seller Office? Is a `User-Agent` or IP allowlist ever required (both TY and HB
    needed a meaningful `User-Agent`)?
    **Answered, n11 (2026-10-13):** the integrator's company name, no registration. Product
    services that require `integrator` expect one common value (no case or `I`/`ı` variation);
    n11 logs by it. No `User-Agent` or IP requirement was named.
11. **WSDLs.** May we fetch and redistribute `api.n11.com/ws/*.wsdl` in `specs/n11/`? Should we ask
    `sellerintegration@n11.com`?
    **Answered, n11 (2026-10-13):** "using your own types would be healthier." The WSDLs stay
    out of the repo. `specs/n11/` covers the REST pages only, so `pnpm drift` keeps reporting the
    four SOAP probe exchanges as unmatched.
12. **Credential scope.** Can one key pair access everything (products, orders, returns), or are
    there per-service permissions?
    **Answered, n11 (2026-10-13):** the only per-store authorisation n11 named is the
    quantity-based package split (`splitPackageByQuantity`); n11 grants it on the seller's
    request. **n11 (2026-10-15):** on the test store the quantity split is enabled, the store
    was made eligible for collection requests, and the labour-cost category list was added to
    the docs page (section 7).

## 12. Next steps (proposed)

1. ~~Get an n11 seller or integrator account. Add `N11_APP_KEY` / `N11_APP_SECRET` and contract
   probes for `categories`, `product-query` and `shipmentPackages` (read-only).~~ Done on
   2026-10-10 (keys in `.env.prod`, since n11 has no sandbox).
2. ~~Decide the `specs/n11/` source (WSDL capture, a hand-compiled OpenAPI, or both). Write
   `scripts/specs/{fetch,build}-n11.mjs` the same way as Trendyol's, so the scripts read only the
   docs portal.~~ Done on 2026-10-11 for REST: a hand-compiled OpenAPI
   (`scripts/specs/n11/source.mjs` + `scripts/specs/build-n11.mjs`, no fetch script because the
   portal has nothing machine-readable to fetch). The 4 REST probe exchanges now match it in
   `pnpm drift` (0 breaking). A WSDL capture waits for question 11.
3. ~~Fill in REST resources (categories, products writes and task details, inventory, orders) and
   reach the CONTRIBUTING minimum.~~ Done on 2026-10-13 (section 10).
4. ~~Add the SOAP layer (section 8) for questions, returns and invoice links.~~ Done on
   2026-10-13, plus partial cancel and catalogue search.
5. ~~Harmonise with the TY/HB SDKs (order-status mapping, capabilities, `testing` fake client).
   Then publish as `0.x` with a changeset.~~ Done on 2026-10-13; the first npm publish of a new
   scoped package has to be done by hand (see the release notes in the PR).
6. Still open: verify order writes and return decisions on a real order (needs an order in
   `Created` / `Picking` on the test store; per n11's 2026-10-15 reply we place and pay for it
   ourselves, and n11 sets `Delivered`), `createCollectionRequest` (needs a logistics-company
   shipment) and `updateLaborCosts` (needs a jewellery category opened for the test store), and a
   settlements resource over SOAP if users ask for it.
