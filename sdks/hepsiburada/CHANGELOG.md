# @lonca/hepsiburada

## 1.3.3

### Patch Changes

- [#235](https://github.com/zanaat-dev/lonca/pull/235) [`755a229`](https://github.com/zanaat-dev/lonca/commit/755a229d40151b70db114c45f8e2c40d4ce6ad7a) Thanks [@keparlak](https://github.com/keparlak)! - `catalog.deleteByMerchantSkuList()` sends the array of `{ merchant, merchantSku }` Hepsiburada documents, filling in `merchant` from the client. It sent `{ merchantSkuList: [...] }`, which Hepsiburada answers with a 500 (verified on SIT, 2026-10-14), so the method never worked. The older input is still accepted and converted, so existing calls now work as written.
  
  <!-- tr
  `catalog.deleteByMerchantSkuList()` artık Hepsiburada'nın dokümante ettiği `{ merchant, merchantSku }` dizisini gönderiyor; `merchant` alanını istemciden dolduruyor. Önceden `{ merchantSkuList: [...] }` gönderiyordu; Hepsiburada buna 500 döndüğü için (SIT'te doğrulandı, 14 Ekim 2026) metot hiç çalışmıyordu. Eski girdi biçimi de kabul edilip diziye çevriliyor, yani mevcut çağrılar yazıldıkları gibi çalışmaya başlıyor.
  -->

## 1.3.2

### Patch Changes

- [#233](https://github.com/zanaat-dev/lonca/pull/233) [`cf3a244`](https://github.com/zanaat-dev/lonca/commit/cf3a244fe9529ce52a157ffeaa470ea91a5b58b7) Thanks [@keparlak](https://github.com/keparlak)! - The order write input types and README examples now use the field names Hepsiburada reads, checked on SIT with test orders (2026-10-14). The SDK forwards these bodies unchanged, so code that already sends the right fields is unaffected; code that followed the old hints never worked:
  
  - `createPackages`: `lineItemRequests: [{ id, quantity }]` (a `lineItems` list → `400 "Line items empty or null"`).
  - `updateLineItemCargoCompany` / `updatePackageCargoCompany`: `CargoCompanyShortName` (a `cargoCompany` field → `400 CargoCompanyNotFound`).
  - `markPackageUndelivered`: `undeliveredReason` + `undeliveredDate` (a `reason` field → `400 "incorrect undeliveredReason value"`); the in-transit and delivered fields are typed too.
  - `splitPackage`: `packageDetails` / `cancelledItems`; `cancelLineItem`: `reasonId` (both per the spec; SIT could not get past its own package lookup to confirm).
  - The order and package lists send `begindate` / `enddate` as documented, and `beginDate` / `endDate` are documented as `yyyy-MM-dd HH:mm`: other formats are not rejected, the list just comes back empty.
  
  <!-- tr
  Sipariş yazma metodlarının girdi tipleri ve README örnekleri artık Hepsiburada'nın okuduğu alan adlarını kullanıyor; SIT'te test siparişleriyle kontrol edildi (14 Ekim 2026). SDK bu gövdeleri olduğu gibi iletiyor; doğru alanları zaten gönderen kod etkilenmiyor, eski ipuçlarını izleyen kod ise hiç çalışmıyordu:
  
  - `createPackages`: `lineItemRequests: [{ id, quantity }]` (`lineItems` listesi → `400 "Line items empty or null"`).
  - `updateLineItemCargoCompany` / `updatePackageCargoCompany`: `CargoCompanyShortName` (`cargoCompany` alanı → `400 CargoCompanyNotFound`).
  - `markPackageUndelivered`: `undeliveredReason` + `undeliveredDate` (`reason` alanı → `400 "incorrect undeliveredReason value"`); kargoda ve teslim edildi alanları da tiplendi.
  - `splitPackage`: `packageDetails` / `cancelledItems`; `cancelLineItem`: `reasonId` (ikisi de spec'e göre; SIT kendi paket kaydı eksikliği yüzünden doğrulamaya izin vermedi).
  - Sipariş ve paket listeleri dokümandaki gibi `begindate` / `enddate` gönderiyor; `beginDate` / `endDate` için format `yyyy-MM-dd HH:mm` olarak belgelendi: başka formatlar hata vermiyor, liste boş dönüyor.
  -->

## 1.3.1

### Patch Changes

- [#231](https://github.com/zanaat-dev/lonca/pull/231) [`9b0ec68`](https://github.com/zanaat-dev/lonca/commit/9b0ec681a5021a388d538af54bc3f76739786c60) Thanks [@keparlak](https://github.com/keparlak)! - The order lists (`orders.list`, `listCancelled`, `listPaymentAwaiting`, …) always send `offset` and `limit` now, defaulting to `0` and `100`. Called without them, Hepsiburada answers `400 "limit and offset parameters are required"` (verified on SIT, 2026-10-14), so a bare `orders.list()` failed although the docs promised a default of 100.
  
  <!-- tr
  Sipariş listeleri (`orders.list`, `listCancelled`, `listPaymentAwaiting`, …) artık her zaman `offset` ve `limit` gönderiyor; varsayılanları `0` ve `100`. Bunlar olmadan Hepsiburada `400 "limit and offset parameters are required"` döndürüyor (SIT'te doğrulandı, 14 Ekim 2026). Bu yüzden dokümantasyon 100 varsayılanını söylese de parametresiz `orders.list()` hata veriyordu.
  -->

## 1.3.0

### Minor Changes

- [#226](https://github.com/zanaat-dev/lonca/pull/226) [`ea5bdb2`](https://github.com/zanaat-dev/lonca/commit/ea5bdb252c2ecc4ebdfdce0d673edbc01c1ac671) Thanks [@keparlak](https://github.com/keparlak)! - `catalog.uploadProductViaFile()` and `questions.answer()` now send `multipart/form-data`, as Hepsiburada documents them. Both sent a JSON body before, which Hepsiburada refuses (the upload with a 500, the answer with a 422 "Bu alan geçersizdir"), so neither worked; verified on SIT, 2026-10-14.
  
  - `catalog.uploadProductViaFile()` sends the products as a JSON file in the `file` part, fills in `merchant` from the client when a row has none, and rejects a row without `categoryId` or `attributes.merchantSku` before sending. Rows are typed as the new `CatalogUploadProduct`; `UploadProductsInput` still compiles but is deprecated. The upload receipt now reads the `trackingId` from the `data` envelope the endpoint answers with (it came back empty before), and `getProductStatus()` also returns `success` and `code`.
  - `questions.answer()` sends the `Answer` and `Files` parts (files as `Blob` / `File`), checks the answer is 1–2000 characters, and accepts the lower-case `answer` key the README used to show.
  
  <!-- tr
  `catalog.uploadProductViaFile()` ve `questions.answer()` artık Hepsiburada'nın dokümante ettiği gibi `multipart/form-data` gönderiyor. İkisi de önceden JSON gövde gönderiyordu; Hepsiburada bunu reddettiği için (yükleme 500, cevap 422 "Bu alan geçersizdir") ikisi de çalışmıyordu. SIT'te doğrulandı, 14 Ekim 2026.
  
  - `catalog.uploadProductViaFile()` ürünleri `file` alanında bir JSON dosyası olarak gönderiyor; `merchant` alanı olmayan satırlara istemcinin merchant id'sini koyuyor; `categoryId` ya da `attributes.merchantSku` içermeyen satırı gönderilmeden reddediyor. Satırların tipi yeni `CatalogUploadProduct`; `UploadProductsInput` derlenmeye devam ediyor ama kullanımdan kaldırıldı. Yükleme makbuzu `trackingId`'yi uç noktanın döndürdüğü `data` zarfından okuyor (önceden boş dönüyordu); `getProductStatus()` ayrıca `success` ve `code` döndürüyor.
  - `questions.answer()` `Answer` ve `Files` alanlarını gönderiyor (dosyalar `Blob` / `File` olarak), cevabın 1–2000 karakter olduğunu kontrol ediyor ve README'nin önceden gösterdiği küçük harfli `answer` anahtarını da kabul ediyor.
  -->

- [#224](https://github.com/zanaat-dev/lonca/pull/224) [`440a145`](https://github.com/zanaat-dev/lonca/commit/440a1453c2619d7f80946a50731fb5e05627b299) Thanks [@keparlak](https://github.com/keparlak)! - `productUpdates.importUpdates()` now sends the batch the way Hepsiburada takes it: a `{ merchantId, items }` JSON file in the multipart field `file`. It used to send the rows as a JSON body, which Hepsiburada answers with a 500, so the method never worked (verified on SIT, 2026-10-14; fixes [#220](https://github.com/zanaat-dev/lonca/issues/220)). Rows are typed as the new `ProductUpdateItem` (`hbSku`, `productName`, `productDescription`, `image1`–`image10`, `video`, `attributes`) and a row without `hbSku` is rejected before sending; `ProductUpdateInput` still compiles but is deprecated. `getUpdateStatus()` also returns `success` and `code` (e.g. `4009` "Variant is not found."), and `getUpdateHistory()` rows carry `createdAt`. The fake client now hands a multipart body to the handler as its `FormData`.
  
  <!-- tr
  `productUpdates.importUpdates()` artık toplu güncellemeyi Hepsiburada'nın beklediği biçimde gönderiyor: multipart `file` alanında `{ merchantId, items }` içeren bir JSON dosyası. Önceden satırları JSON gövdesi olarak gönderiyordu; Hepsiburada buna 500 döndüğü için metot hiç çalışmıyordu (SIT'te doğrulandı, 14 Ekim 2026; [#220](https://github.com/zanaat-dev/lonca/issues/220)'yi kapatır). Satırların tipi artık yeni `ProductUpdateItem` (`hbSku`, `productName`, `productDescription`, `image1`–`image10`, `video`, `attributes`); `hbSku` içermeyen satır gönderilmeden reddediliyor. `ProductUpdateInput` derlenmeye devam ediyor ama kullanımdan kaldırıldı. `getUpdateStatus()` ayrıca `success` ve `code` alanlarını döndürüyor (ör. `4009` "Variant is not found."), `getUpdateHistory()` satırlarında `createdAt` var. Sahte istemci multipart gövdeyi handler'a `FormData` olarak veriyor.
  -->

## 1.2.2

### Patch Changes

- [#219](https://github.com/zanaat-dev/lonca/pull/219) [`6f14246`](https://github.com/zanaat-dev/lonca/commit/6f14246cb54da310265ff7f4207aa0c24509f7f7) Thanks [@keparlak](https://github.com/keparlak)! - `productUpdates.getUpdateStatus()` and `catalog.getTrackingIdHistory()` now read rows from the `data` array of Hepsiburada's response envelope (`{ success, code, message, data: [...] }`). Both used to look only for a bare array, `rows` or `items`, so for a response in the documented shape `getUpdateStatus()` left `rows` unset (the rows were only on `raw`) and `getTrackingIdHistory()` returned an empty list.
  
  <!-- tr
  `productUpdates.getUpdateStatus()` ve `catalog.getTrackingIdHistory()` artık satırları Hepsiburada yanıt zarfının `data` dizisinden okuyor (`{ success, code, message, data: [...] }`). İkisi de yalnızca düz diziye, `rows` ya da `items` alanına bakıyordu; bu yüzden dokümandaki biçimde gelen bir yanıtta `getUpdateStatus()` `rows` alanını boş bırakıyor (satırlar yalnızca `raw` içindeydi), `getTrackingIdHistory()` ise hep boş liste dönüyordu.
  -->

## 1.2.1

### Patch Changes

- [#192](https://github.com/zanaat-dev/lonca/pull/192) [`853f459`](https://github.com/zanaat-dev/lonca/commit/853f45980ecaa8645045d9f34d7add027cc2bee1) Thanks [@keparlak](https://github.com/keparlak)! - Package metadata and README links point to the project's new home: the repository moved to [github.com/zanaat-dev/lonca](https://github.com/zanaat-dev/lonca) and the docs to [lonca.zanaat.dev](https://lonca.zanaat.dev). Old GitHub URLs keep redirecting. No code changes.

  <!-- tr
  Paket bilgileri ve README bağlantıları projenin yeni adresini gösteriyor: depo [github.com/zanaat-dev/lonca](https://github.com/zanaat-dev/lonca), dokümanlar [lonca.zanaat.dev](https://lonca.zanaat.dev) adresine taşındı. Eski GitHub adresleri yönlendirmeye devam ediyor. Kodda değişiklik yok.
  -->
- Updated dependencies [[`70938e6`](https://github.com/zanaat-dev/lonca/commit/70938e652a643ac45baf3cbeb400e4ca2874447d)]:
  - @lonca/core@1.1.0

## 1.2.0

### Minor Changes

- [#174](https://github.com/loncadev/lonca/pull/174) [`5499c15`](https://github.com/loncadev/lonca/commit/5499c15239e6c899462ed078fa1ee288a3a5a03b) Thanks [@keparlak](https://github.com/keparlak)! - `questions.list()` / `questions.get()` now expose the fields Hepsiburada actually returns (the documented `IssueViewModel`, verified on SIT): `issueNumber`, `subject`, `lastContent`, `conversations` (the question thread, including answers), `product` (`sku`, `name`, `imageUrl`, `stockCode`), `customerId`, `orderNumber`, `lineItemId`, `createdAt`, `lastModifiedAt`, `expireDate` and `didCustomerSeeTheMessage`. New exported types: `QuestionConversation`, `QuestionProduct`, `QuestionSubject`.
  
  Deprecated: `number`, `productSku` and `createdDate` were never sent by Hepsiburada — they are now filled from `issueNumber`, `product.sku` and `createdAt`; use those instead. `text` and `answer` have no single equivalent (read `conversations`) and stay unset unless a response carries them.

  <!-- tr
  `questions.list()` / `questions.get()` artık Hepsiburada'nın gerçekten döndürdüğü alanları veriyor (dokümandaki `IssueViewModel`, SIT'te doğrulandı): `issueNumber`, `subject`, `lastContent`, `conversations` (yanıtlar dahil soru yazışması), `product` (`sku`, `name`, `imageUrl`, `stockCode`), `customerId`, `orderNumber`, `lineItemId`, `createdAt`, `lastModifiedAt`, `expireDate` ve `didCustomerSeeTheMessage`. Yeni dışa açılan tipler: `QuestionConversation`, `QuestionProduct`, `QuestionSubject`.

  Kullanımdan kaldırılanlar: `number`, `productSku` ve `createdDate` Hepsiburada tarafından hiç gönderilmiyordu; artık `issueNumber`, `product.sku` ve `createdAt`'ten dolduruluyor, bunları kullan. `text` ve `answer`'ın tek bir karşılığı yok (`conversations`'ı oku); bir yanıt taşımadıkça boş kalıyor.
  -->

## 1.1.0

### Minor Changes

- [#163](https://github.com/loncadev/lonca/pull/163) [`2e7491a`](https://github.com/loncadev/lonca/commit/2e7491a49fae1005957f2d91002c1ec50f7c2f5a) Thanks [@keparlak](https://github.com/keparlak)! - `createTrendyolClient` and `createHepsiburadaClient` accept an optional `fetch` implementation (e.g. to add a proxy agent, or to record or mock traffic). It defaults to the global `fetch`, so existing code is unaffected.

  <!-- tr
  `createTrendyolClient` ve `createHepsiburadaClient` isteğe bağlı bir `fetch` uygulaması kabul ediyor (örneğin proxy eklemek ya da trafiği kaydetmek veya taklit etmek için). Varsayılan global `fetch` olduğu için mevcut kod etkilenmez.
  -->

- [#168](https://github.com/loncadev/lonca/pull/168) [`20dea75`](https://github.com/loncadev/lonca/commit/20dea75f870f9061fb13194d1f8afbfa512bce97) Thanks [@keparlak](https://github.com/keparlak)! - Typed fields now match what Hepsiburada actually returns (checked against the portal specs and real production responses). Several fields that were typed before could never be filled in. The data was only available on `raw`.
  
  - **`accounting.listTransactions()`**: `AccountingTransaction` gains `id`, `transactionType`, `transactionTypeCategory`, `status`, `sku`, `productName`, `quantity`, `merchantId`, `orderItemNumber`, `packageNumber`, `invoiceNumber`, `invoiceExplanation`, `isInvoice`, `isIncome`, `orderDate`, `invoiceDate`, `dueDate`, and the money objects `transactionAmount` (the API's `amount`), `taxAmount` and `netAmount`. Each is a `{ value, currencyCode }` object (new `AccountingAmount` type). The legacy `transactionId`, `type`, `amount` and `currency` fields are now filled from `id`, `transactionType`, `amount.value` and `amount.currencyCode`. They are deprecated, together with `transactionDate`, which Hepsiburada never sends.
  - **`orders.list*()` / `getByOrderNumber()`**: `Order` gains `id` (line item id), `orderId`, `orderDate`, `lastStatusUpdateDate`, `dueDate`, `packageNumber`, `sku`, `merchantSku`, `barcode`, `name`, `quantity`, `cargoCompany`, `customerId`, `vat`, `vatRate`, and the `{ amount, currency }` prices `unitPrice` and `totalPrice` (new `OrderPrice` type). `externalOrderNumber`, `modifiedDate` and `total` are deprecated because Hepsiburada never sends them. `createdDate` is still filled by `getByOrderNumber()` only.
  - **`catalog.listProducts()` / `listProductsByStatus()`**: `CatalogProduct` gains the fields each endpoint really returns: `barcode`, `hbSku`, `variantGroupId`, `price`, `tax`, `baseAttributes` / `productAttributes` / `variantTypeAttributes`, `validationResults` and `rejectReasons` from `listProducts()`, and `productStatus`, `taskDetails`, `matchedHbProductInfo`, `rejectReasonsMessages` and `videoStatus` from `listProductsByStatus()`, where `status` is now filled from `productStatus` too. New types: `CatalogProductAttribute`, `CatalogAttributePair`, `CatalogValidationResult`, `CatalogTaskDetail` and `CatalogMatchedHbProduct`. These 15 fields are deprecated because neither endpoint sends them: `id`, `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy`, `preMatchedSku`, `siblingSku`, `listingStatus`, `listingFailureReason`, `validationStatus`, `productType`, `uploadDate`, `productQuality`, `categoryScore` and `fields`.
  - **`categories.getAttributes()`**: `CategoryAttribute` gains `type` and `multiValue`. `externalName` and `values` are deprecated because they are never sent. Use `categories.getAttributeValues()` to get allowed values.
  
  Nothing is removed or narrowed. Deprecated fields stay in place until the next major.

  <!-- tr
  Tipli alanlar artık Hepsiburada'nın gerçekten döndürdüğüyle uyuşuyor (portal şemaları ve gerçek canlı yanıtlarla karşılaştırıldı). Önceden tipli olan bazı alanlar hiç dolamıyordu; veri yalnızca `raw` üzerinden okunabiliyordu.

  - **`accounting.listTransactions()`**: `AccountingTransaction`'a `id`, `transactionType`, `transactionTypeCategory`, `status`, `sku`, `productName`, `quantity`, `merchantId`, `orderItemNumber`, `packageNumber`, `invoiceNumber`, `invoiceExplanation`, `isInvoice`, `isIncome`, `orderDate`, `invoiceDate`, `dueDate` ile para nesneleri `transactionAmount` (API'deki `amount`), `taxAmount` ve `netAmount` eklendi. Her biri `{ value, currencyCode }` nesnesi (yeni `AccountingAmount` tipi). Eski `transactionId`, `type`, `amount` ve `currency` alanları artık `id`, `transactionType`, `amount.value` ve `amount.currencyCode`'dan dolduruluyor; bunlar ve Hepsiburada'nın hiç göndermediği `transactionDate` kullanımdan kaldırıldı.
  - **`orders.list*()` / `getByOrderNumber()`**: `Order`'a `id` (satır kimliği), `orderId`, `orderDate`, `lastStatusUpdateDate`, `dueDate`, `packageNumber`, `sku`, `merchantSku`, `barcode`, `name`, `quantity`, `cargoCompany`, `customerId`, `vat`, `vatRate` ile `{ amount, currency }` fiyatları `unitPrice` ve `totalPrice` eklendi (yeni `OrderPrice` tipi). `externalOrderNumber`, `modifiedDate` ve `total` Hepsiburada hiç göndermediği için kullanımdan kaldırıldı. `createdDate` yalnızca `getByOrderNumber()` tarafından dolduruluyor.
  - **`catalog.listProducts()` / `listProductsByStatus()`**: `CatalogProduct`'a her uç noktanın gerçekten döndürdüğü alanlar eklendi: `listProducts()`'tan `barcode`, `hbSku`, `variantGroupId`, `price`, `tax`, `baseAttributes` / `productAttributes` / `variantTypeAttributes`, `validationResults` ve `rejectReasons`; `listProductsByStatus()`'tan `productStatus`, `taskDetails`, `matchedHbProductInfo`, `rejectReasonsMessages` ve `videoStatus` (burada `status` da artık `productStatus`'tan dolduruluyor). Yeni tipler: `CatalogProductAttribute`, `CatalogAttributePair`, `CatalogValidationResult`, `CatalogTaskDetail` ve `CatalogMatchedHbProduct`. İki uç nokta da göndermediği için şu 15 alan kullanımdan kaldırıldı: `id`, `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy`, `preMatchedSku`, `siblingSku`, `listingStatus`, `listingFailureReason`, `validationStatus`, `productType`, `uploadDate`, `productQuality`, `categoryScore` ve `fields`.
  - **`categories.getAttributes()`**: `CategoryAttribute`'a `type` ve `multiValue` eklendi. `externalName` ve `values` hiç gönderilmediği için kullanımdan kaldırıldı. İzin verilen değerler için `categories.getAttributeValues()` kullan.

  Hiçbir şey kaldırılmadı ya da daraltılmadı. Kullanımdan kaldırılan alanlar bir sonraki büyük sürüme kadar yerinde kalıyor.
  -->

## 1.0.0

### Major Changes

- [#139](https://github.com/loncadev/lonca/pull/139) [`da9ff38`](https://github.com/loncadev/lonca/commit/da9ff38928b5a953bad249fe740bd263f3e5f50a) Thanks [@keparlak](https://github.com/keparlak)! - First stable release. The public API is identical to the previous minor —
  upgrading requires no code changes. From 1.0.0 on, `@lonca/hepsiburada` follows
  the stability policy documented at https://loncadev.github.io/lonca/stability/:
  breaking changes only in major versions, deprecations announced at least two
  minors before removal, and the exported API surface is locked in CI.
  
  Verified read-only against the production API (merchant account, 2026-08-30):
  all twelve contract probes answer 200, including `catalog.listProductsByStatus`
  (the pre-0.13.0 bare-500 regression stays fixed on production) and the
  per-service host routing — `mpfinance`, `asktoseller`, `diskonto`, `mpop`, and
  `supplier-api` all resolve and answer route-level JSON on their dedicated
  production hostnames.

  <!-- tr
  İlk kararlı sürüm. Genel API bir önceki ara sürümle aynı; yükseltmek için kod değişikliği gerekmez. 1.0.0'dan itibaren `@lonca/hepsiburada` [kararlılık politikasını](/stability/) izler: kırıcı değişiklikler yalnızca büyük sürümlerde gelir, kaldırılacak özellikler en az iki ara sürüm önceden duyurulur ve dışa açılan API yüzeyi CI'da kilitlidir.

  Canlı API'ye karşı salt okuma ile doğrulandı (mağaza hesabı, 30 Ağustos 2026): on iki sözleşme testinin hepsi 200 dönüyor; `catalog.listProductsByStatus` de dahil (0.13.0 öncesindeki çıplak 500 gerilemesi canlıda düzelmiş durumda) ve servis başına host yönlendirmesi de doğru: `mpfinance`, `asktoseller`, `diskonto`, `mpop` ve `supplier-api` kendi canlı host adlarında çözülüyor ve rota düzeyinde JSON dönüyor.
  -->

### Patch Changes

- Updated dependencies [[`da9ff38`](https://github.com/loncadev/lonca/commit/da9ff38928b5a953bad249fe740bd263f3e5f50a)]:
  - @lonca/core@1.0.1

## 0.13.1

### Patch Changes

- [#136](https://github.com/loncadev/lonca/pull/136) [`e09d4d5`](https://github.com/loncadev/lonca/commit/e09d4d52b89d42d7cbdde34b2c82b46193274146) Thanks [@keparlak](https://github.com/keparlak)! - Fix TypeScript type resolution for CommonJS consumers ("Masquerading as ESM"):
  the `exports` maps now declare per-condition types (`import` resolves
  `dist/index.d.ts`, `require` resolves `dist/index.d.cts`, including the SDKs'
  `./testing` subpath). Runtime behaviour is unchanged; `publint` and
  `arethetypeswrong` now verify the packages in CI.
- Updated dependencies [[`e09d4d5`](https://github.com/loncadev/lonca/commit/e09d4d52b89d42d7cbdde34b2c82b46193274146), [`e09d4d5`](https://github.com/loncadev/lonca/commit/e09d4d52b89d42d7cbdde34b2c82b46193274146)]:
  - @lonca/core@1.0.0

## 0.13.0

### Minor Changes

- [#123](https://github.com/loncadev/lonca/pull/123) [`460bcc1`](https://github.com/loncadev/lonca/commit/460bcc1e1ee74f82f2ea529240cd2fc0de029115) Thanks [@keparlak](https://github.com/keparlak)! - `catalog.listProducts` and `catalog.listProductsByStatus` now return `OffsetPage<CatalogProduct>` (from `@lonca/core`) instead of a bare `CatalogProduct[]`, mapped from Hepsiburada's Spring-style envelope: `totalElements` → `totalCount`, `totalPages` → `pageCount`, `data` → `items`. Both methods also accept `offset` / `limit` as an alias of `page` / `size`, so they plug straight into `paginateOffset` (pass `limit` — the API pages by number, so `offset` must be a multiple of it). `listProducts` gains the documented `barcode` / `merchantSku` / `hbSku` filters.
  
  Migration: `const rows = await c.catalog.listProducts()` → `const rows = (await c.catalog.listProducts()).items`.

- [#129](https://github.com/loncadev/lonca/pull/129) [`8b08874`](https://github.com/loncadev/lonca/commit/8b08874d9ecd91d476b192605f3e8ed01938a2dd) Thanks [@keparlak](https://github.com/keparlak)! - Route five resources to their real service hosts (previously all five went through `oms-external`, where every call failed with 401/404 — verified against SIT):
  
  | Resource         | Old host       | New host                           |
  | ---------------- | -------------- | ---------------------------------- |
  | `accounting`     | `oms-external` | `mpfinance-external[-sit]`         |
  | `suppliers`      | `oms-external` | `supplier-api-external[-sit]`      |
  | `questions`      | `oms-external` | `api-asktoseller-merchant[-sit]`   |
  | `promotions`     | `oms-external` | `diskonto-external[-sit]`          |
  | `productUpdates` | `oms-external` | `mpop[-sit]` (`/ticket-api` base)  |
  
  Request-shape fixes that the real services require:
  
  - `questions.*` now sends the required `merchantId` **header** on every call (missing it yields 401), and `questions.list()` pages with the API's `page`/`size` parameters and filters with `minCreatedAt`/`maxCreatedAt`. The old `offset`/`limit`/`beginDate`/`endDate` params still work as deprecated aliases.
  - `accounting.listTransactions()` sends the spec's PascalCase query parameters (`Offset`/`Limit`, defaulted to `0`/`100` since the API requires them) on the spec's lowercase `/transactions/merchantid/{id}` path, and exposes the full filter surface (`orderNumber`, `sku`, `orderDateStart`/`orderDateEnd`, `recordDateStart`/`recordDateEnd`, …). The API requires either an identifier filter or a date-range pair spanning at most 1 month. `beginDate`/`endDate` remain as deprecated aliases of `orderDateStart`/`orderDateEnd`.
  - `promotions.listDiscounts()` now sends the required `page`/`pagesize` query parameters (defaults `1`/`100`) and accepts an optional `{ page, pageSize }` argument.
  
  Normalization fixes for the real services' response shapes (both verified on SIT):
  
  - `promotions.listCategories()` / `listDiscounts()` unwrap diskonto's PascalCase `{ Data: [...] }` envelope (previously the rows were silently dropped) and categories map the wire's `categoryName` onto `name`.
  - `questions.getCountByStatus()` surfaces the API's flat per-status body (`{ waitingForAnswer, answered, ... }`) as `byStatus`.
  
  Compatibility note: no method signatures were removed, but calls to these five resources previously **always** failed with 401/404 — they now reach the real services and can return data (or real, route-level errors such as a supplier-enrollment 404).

- [#130](https://github.com/loncadev/lonca/pull/130) [`5c228f6`](https://github.com/loncadev/lonca/commit/5c228f6efa51d50616fe27bd8f55857898676cc7) Thanks [@keparlak](https://github.com/keparlak)! - Typed field hints for the remaining passthrough write inputs (Faz 1.6). All 17 `Record<string, unknown>` input aliases now carry spec-sourced field hints intersected with `Record<string, unknown>` — common fields autocomplete while undocumented ones still pass through (non-breaking).
  
  - **Catalog** (`mpop-catalog.json`): `PreMatchActionInput` and `CheckProductStatusInput` are now `MerchantSkuGroup[] | MerchantSkuGroup` — the spec takes an array of `{ merchant, merchantSkuList }` groups (new exported `MerchantSkuGroup` type); plain objects still pass through.
  - **Orders** (`oms-external.json`): `LaborCostInput` (`unitLaborCost`), `InvoiceLinkInput` (`invoiceLink`, `serialNumber`, `rowNumber`, `arrangementDate`, `invoices` — new exported `InvoiceLinkItem` type), `ParcelInfoInput` (`totalDesi`, `totalParcel`), `WarehouseInput` (`shippingAddressLabel`).
  - **Promotions** (`diskonto-external.json`): `CreateTlDiscountInput`, `CreatePercentDiscountInput`, `CreateXyDiscountInput` (name/date/condition/budget/discount fields per campaign type), `CancelDiscountInput` (`campaignId`).
  - **Questions** (`asktoseller-merchant.json`): `CreateQuestionInput` (`issueCount`), `AnswerQuestionInput` (`Answer`, `Files` — the endpoint is `multipart/form-data` per spec), `RejectQuestionInput` (`rejectReason`, `rejectConversationId`).
  - **Suppliers** (`supplier-api-external.json`): `OpenPurchaseOrderSearchInput`, `SupplierListingSearchInput`, `ListingUpdateRequestSearchInput`, `CreateListingUpdateRequestInput` — full filter/offer field sets, with new exported `PurchaseOrderType`, `PurchaseOrderLineRef`, and `CreateListingUpdateRequestItem` types and open unions for spec enums (`currencyCode`, `listingType`, `status`, `purchaseOrderTypes`).
  
  No runtime changes — types and JSDoc only. No inputs remain passthrough-only: every one of the 17 had a curated spec definition.

- [#127](https://github.com/loncadev/lonca/pull/127) [`b497044`](https://github.com/loncadev/lonca/commit/b497044287e3b1dc995bfe51de7c57aba433428b) Thanks [@keparlak](https://github.com/keparlak)! - No method returns `Promise<unknown>` any more. The 29 remaining return types are now modelled from the developer-portal specs (`specs/hepsiburada/*.json`), or resolve to the shared `MutationResult` (`{ raw }`) envelope from `@lonca/core` when the API documents no body worth typing (bare string, `204`, `{ success }` only, or no published spec):
  
  - `orders.createPackages` → `PackageReceipt` (`{ packageNumber?, barcode?, raw }` — the spec's `CreateDeliveryResponse`).
  - `orders.splitPackage` / `unpackPackage` / `markPackageInTransit` / `markPackageDelivered` / `markPackageUndelivered` / `cancelLineItem` / `updateLineItemCargoCompany` / `updateLineItemLaborCost` / `updatePackageCargoCompany` / `sendInvoiceLink` / `updateParcelInfo` / `updatePackageWarehouse` → `MutationResult`.
  - `promotions.createTlDiscount` / `createPercentDiscount` / `createXyDiscount` → `DiscountReceipt` (`{ success?, campaignId?, raw }`); `promotions.cancelDiscount` → `MutationResult`.
  - `questions.create` / `answer` / `reject` → `MutationResult` (`create`'s documented `number[]` body is on `raw`).
  - `shipping.createProfile` / `updateProfile` and `testOrders.create` → `MutationResult` (no portal response schema).
  - `suppliers.searchOpenPurchaseOrders` → `SupplierSearchResult<OpenPurchaseOrder>`, `searchSupplierListings` → `SupplierSearchResult<SupplierListing>`, `searchListingUpdateRequests` → `SupplierSearchResult<ListingUpdateRequestSummary>` (`{ totalCount?, items, message?, errorCode?, raw }`, unwrapped from the supplier API's `{ data, message, errorCode }` envelope); `getListingUpdateRequest` → `ListingUpdateRequestDetail` (`requestItems[]` with per-field approval statuses); `createListingUpdateRequest` → `ListingUpdateRequestReceipt` (`{ id?, raw }`).
  
  Migration is one line per call site — `unknown` already forced a cast, so `(await x) as T` becomes `(await x).raw`, or read the typed fields directly.
  
  `categories.list` is now `OffsetPage`-aligned: `CatalogPage<T>` extends `OffsetPage<T>` (`items`, `totalCount`, `limit`, `offset`, `pageCount`), so it plugs straight into `paginateOffset`, and `ListCategoriesParams` accepts `offset` / `limit` as an alias of `page` / `size` (`offset` must be a multiple of `limit` — the API pages by number). The Spring fields it exposed before (`data`, `totalElements`, `totalPages`, `number`, `numberOfElements`, `first`, `last`, `success`, `code`, `message`) are still returned but **deprecated** and will be removed in a later minor: migrate `.data` → `.items`, `.totalElements` → `.totalCount`, `.totalPages` → `.pageCount`.
  
  `CatalogProduct.id` is now optional (`id?: string`) instead of an `''` placeholder — `catalog.listProductsByStatus` rows carry no id on the wire. Guard with `if (product.id)` wherever the empty string was relied on.

### Patch Changes

- [#123](https://github.com/loncadev/lonca/pull/123) [`460bcc1`](https://github.com/loncadev/lonca/commit/460bcc1e1ee74f82f2ea529240cd2fc0de029115) Thanks [@keparlak](https://github.com/keparlak)! - Fix `catalog.listProductsByStatus` returning HTTP 500 on every call. The SDK sent the filter as `status=…`, but Hepsiburada's `products-by-merchant-and-status` endpoint requires it as `productStatus` and answers 500 (not 400) when that parameter is missing or not one of its UPPER_SNAKE values. The method now sends `productStatus`, requires `status` (a `ValidationError` is thrown client-side when it is missing), types it as the documented `CatalogProductLifecycleStatus` union (`'WAITING' | 'MATCHED' | 'MISSING_INFO' | …`, with an open string escape hatch), passes the documented optional `taskStatus` / `version` parameters through, and no longer sends the undocumented `modifiedAtSince` (now deprecated). The previously documented `'Active'` / `'WaitingApproval'` values were never accepted by the API — replace them with the UPPER_SNAKE vocabulary.

## 0.12.0

### Minor Changes

- [#89](https://github.com/loncadev/lonca/pull/89) [`24f63e2`](https://github.com/loncadev/lonca/commit/24f63e24384fc352a1eaafede84384a439e14c9d) Thanks [@keparlak](https://github.com/keparlak)! - Type the claim/package/catalog mutation surface (feedback items 4 + 5).
  - **Returns (feedback item 4):** `catalog.approvePreMatch` / `rejectPreMatch` / `checkProductStatus`
    and `claims.accept` / `reject` / `preApprovalConfirm` / `create` now return a
    `MutationResult` (`{ raw: unknown }`) instead of bare `unknown` — the API response
    is on `.raw`. (`unknown` already forced a cast, so this is a one-line migration:
    `(x as T)` → `x.raw`.)
  - **Inputs (feedback item 5):** `CreateClaimInput`, `ClaimActionInput`, `CreatePackagesInput`,
    `SplitPackageInput`, `CancelLineItemInput`, `PackageStatusInput`, and
    `ChangeCargoCompanyInput` now carry typed field hints intersected with
    `Record<string, unknown>`, so common fields autocomplete while undocumented ones
    still pass through (non-breaking).

### Patch Changes

- [#91](https://github.com/loncadev/lonca/pull/91) [`e9a3332`](https://github.com/loncadev/lonca/commit/e9a3332cb939071f7b53b0ae34a3fb190d1f5833) Thanks [@keparlak](https://github.com/keparlak)! - Document the FBH stock-overwrite hazard (feedback item 3): `Listing.isFulfilledByHB`
  and `listings.uploadStock` now warn that pushing stock to a Hepsiburada-fulfilled
  listing overwrites Hepsiburada's warehouse stock and can oversell — filter those
  SKUs out of stock sync unless you mean to override.
- Updated dependencies [[`24f63e2`](https://github.com/loncadev/lonca/commit/24f63e24384fc352a1eaafede84384a439e14c9d)]:
  - @lonca/core@0.7.0

## 0.11.0

### Minor Changes

- [#85](https://github.com/loncadev/lonca/pull/85) [`2f80d30`](https://github.com/loncadev/lonca/commit/2f80d30e49ef3524d26c84a8ace7217c40db748b) Thanks [@keparlak](https://github.com/keparlak)! - Fix `catalog.listProducts` / `listProductsByStatus` silently returning `[]`, and
  surface typed product content on `CatalogProduct`.

  **Fix (data loss):** Hepsiburada's catalog list endpoints return a paginated
  envelope (`{ totalElements, totalPages, data: [...] }`), but the SDK assumed a
  bare array and dropped every row when the response was an object — so these calls
  returned nothing against the live API. They now unwrap the envelope (`data`, with
  `content` / `items` / bare-array fallbacks). Verified against live prod
  `all-products-of-merchant`.

  **Content typing:** `CatalogProduct` now exposes `title`, `categoryId`,
  `categoryName`, `brand`, `description`, and `images`, resolved best-effort from the
  row (Hepsiburada keys the title as `productName`/`name`) — so callers stop
  hand-parsing the raw row. Fields stay `undefined` when the catalog doesn't surface
  them (never guessed); `fields` and `raw` are untouched.

  ```ts
  const products = await client.catalog.listProducts(); // now returns rows (was [])
  products[0]?.title; // string | undefined
  products[0]?.categoryName; // string | undefined
  products[0]?.images; // string[] | undefined
  ```

- [#85](https://github.com/loncadev/lonca/pull/85) [`2f80d30`](https://github.com/loncadev/lonca/commit/2f80d30e49ef3524d26c84a8ace7217c40db748b) Thanks [@keparlak](https://github.com/keparlak)! - Fix three read endpoints that silently returned empty results, found by
  verifying every GET endpoint against the live API.
  - **`shipping.getCargoFirms` / `shipping.listProfiles`** returned `[]` because
    Hepsiburada wraps the rows under endpoint-specific keys (`cargoFirms`,
    `profiles`) that the SDK didn't unwrap. They now resolve those keys (live: 5
    cargo firms / 9 profiles, previously 0).
  - **`categories.getAttributes`** returned `[]` because the response nests
    attributes in `data` under three buckets (`baseAttributes`, `attributes`,
    `variantAttributes`) rather than a bare array. They're now flattened into one
    `CategoryAttribute[]`, each tagged with a new `group` field
    (`'base' | 'category' | 'variant'`). Live: 38 attributes, previously 0.
  - **`claims.list` / `claims.listByStatus`** failed with `400 "LimitCannotBeEmpty"`
    when called without pagination. `offset`/`limit` now default to `0`/`100`
    (override via params), so `claims.list()` works out of the box.

## 0.10.0

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

## 0.9.3

### Patch Changes

- Updated dependencies [[`c80e1f7`](https://github.com/loncadev/lonca/commit/c80e1f7430f5919570b9642300fe89ec82294d94)]:
  - @lonca/core@0.6.0

## 0.9.2

### Patch Changes

- [#76](https://github.com/loncadev/lonca/pull/76) [`8ae5960`](https://github.com/loncadev/lonca/commit/8ae59608ea3c90cf435f1c1e6cee43cb428948e1) Thanks [@keparlak](https://github.com/keparlak)! - Resolve the remaining review findings: money rounding, error redaction, and a typed capabilities contract.
  - **`moneyFromMajor` rounds in decimal space.** It now scales via the number's
    string form (`"1.255e2"` → exactly `125.5`) instead of `major * 10 ** scale`,
    which first produces a binary-rounded product like `125.49999999999999`. So
    `moneyFromMajor(1.255, TRY)` is now `126` (was `125`) and `1.005` is `101`
    (was `100`), matching the decimal you actually wrote. Non-finite inputs now
    throw a `TypeError` instead of silently producing `NaN`.
  - **Shared capabilities contract.** New `@lonca/core` export
    `MarketplaceCapabilities`; each SDK's `*Capabilities` constant now `satisfies`
    it (kept `as const`), so the cross-marketplace key set can't drift — a
    renamed or missing flag is a compile error instead of a silent `undefined`.
  - **Hepsiburada 403 no longer leaks the raw server body.** `mapHttpError` gives
    `403` a fixed, safe message (`"Hepsiburada forbidden (check credentials,
permissions, or User-Agent header)"`) instead of echoing the server's
    message, which can carry request context; the raw body stays on
    `error.data` / `cause` for debugging.

- Updated dependencies [[`8ae5960`](https://github.com/loncadev/lonca/commit/8ae59608ea3c90cf435f1c1e6cee43cb428948e1)]:
  - @lonca/core@0.5.0

## 0.9.1

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

## 0.9.0

### Minor Changes

- [#68](https://github.com/loncadev/lonca/pull/68) [`ace3bd7`](https://github.com/loncadev/lonca/commit/ace3bd70036bb5d6a0fa545b2ba46768a9a36efe) Thanks [@keparlak](https://github.com/keparlak)! - feat: pagination consistency, status map, normalized error issues, typed fields, capabilities, and a test double
  - **breaking:** `listings.list()` now returns a core `OffsetPage<Listing>` (`.items` + `.pageCount`) instead of `{ listings, totalCount, limit, offset }`, so it composes with `paginateOffset` and matches every other list endpoint. `ListingsPage` stays exported as a **deprecated** alias of `OffsetPage<Listing>` for the lifetime of the `0.x` line — update `.listings` reads to `.items`.
  - `statusMap` + `normalizeStatus` mapping known Hepsiburada order/package statuses into core's `NormalizedOrderStatus`; unknown statuses surface via `mapped: false`. Adds `KnownHepsiburadaOrderStatus`.
  - `mapHttpError` now populates `LoncaError.issues` (`field`/`code`/`message` only — never raw PII) and aligns the raw body onto `error.data` (previously only on `cause`).
  - `Order.customerName` and `Listing.updatedAt` are now surfaced (as `string | null`) from the raw row, so callers stop guessing from `raw`.
  - `hepsiburadaCapabilities` (`scheduledPricing` / `stockOnlyBatch` / `listingUpdatedAt`), also exposed as `client.capabilities`.
  - New `@lonca/hepsiburada/testing` subpath export: `createFakeHepsiburadaClient(seed?)` — the real client graph over a fake transport for unit tests.

### Patch Changes

- Updated dependencies [[`ace3bd7`](https://github.com/loncadev/lonca/commit/ace3bd70036bb5d6a0fa545b2ba46768a9a36efe)]:
  - @lonca/core@0.3.0

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

- [#51](https://github.com/loncadev/lonca/pull/51) [`1efd1c5`](https://github.com/loncadev/lonca/commit/1efd1c50fdf0d044b11e264b7e178989fe9f40a3) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 2d — webhook event parser + casing regression tests + live smoke script

  No new resources or endpoints. Three quality-of-life additions on top of
  the 0.5.0 surface:

  **Webhook event helper** (`parseHepsiburadaWebhookEvent`)

  Hepsiburada uses endpoint-per-event webhooks (different from Trendyol's
  body-discriminated single-endpoint model). The SDK now ships:
  - `parseHepsiburadaWebhookEvent(event, rawBody)` — validates the event
    name + JSON body, throws `ValidationError` on bad input, returns a
    typed `{ event, body, raw }` envelope.
  - `OrderWebhookEvent` / `ClaimWebhookEvent` / `HepsiburadaWebhookEvent`
    union types for compile-time switch exhaustiveness.
  - `ORDER_WEBHOOK_EVENTS` / `CLAIM_WEBHOOK_EVENTS` /
    `HEPSIBURADA_WEBHOOK_EVENTS` runtime arrays for route registration.

  Covers all 12 documented events: 8 order events (`createOrder`,
  `createPackages`, `orderCancel`, `unpack`, `intransit`, `deliver`,
  `undeliver`, `changeShippingAddressOrder`) and 4 claim events
  (`awaitingAction`, `awaitingPreApproval`, `disputedClaimResult`,
  `packageFromClaimResult`). Per-event body shapes are typed as
  `Record<string, unknown>` — Hepsiburada documents fields in HTML tables;
  the SDK keeps body loose and exposes the raw payload via `.raw`.

  **Casing regression tests**

  The Phase 2c discovery that listing-external is case-sensitive while
  oms-external is case-insensitive lives in `__tests__/casing-regression.ts`
  now. The tests pin the exact path string each resource emits so a future
  refactor can't unintentionally flip casing back and silently break a
  production integration.

  **Live smoke script** (`examples/try-hepsiburada.mts`)

  Read-only walkthrough that hits one endpoint per resource against the
  configured `HB_ENV` (default `sit`). Reports `✓ 200`, `🔒 401/403` (path
  recognized, scope missing — production should work), and `✖ unexpected`
  per call. Mirrors the existing `pnpm try:trendyol` flow.

  Wire up: `pnpm try:hepsiburada` + new `@lonca/hepsiburada` workspace dep
  in `@lonca/examples`.

  Verification:
  - 180 mock tests pass (36 new: 22 webhook + 14 casing regression).
  - typecheck + ESM/CJS/DTS build + prettier all green.
  - Live SIT smoke run against sandbox merchant returns expected
    shape (200 for in-scope endpoints, 401 for out-of-scope, no behaviour
    regressions vs 0.5.0).

## 0.5.0

### Minor Changes

- [#48](https://github.com/loncadev/lonca/pull/48) [`b8613c9`](https://github.com/loncadev/lonca/commit/b8613c9408d61c85581fe0d9456fc86d579e5119) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 2c — ergonomics + strict types (live-SIT verified)

  Three targeted hardening fixes after exhaustive live-SIT verification of
  every read endpoint on the SDK. No new resources or methods — Phase 2c
  tightens contracts and corrects path casing per spec.

  **Breaking type changes** (runtime behavior preserved for valid inputs):
  - **`listings.getBuyboxOrder(skuList)` / `getCommissions(skuList)`** — the
    `skuList` parameter is now **required** (was `string | undefined`). The
    published OpenAPI spec marks it optional, but the live API rejects empty
    with `400 "skuList cannot be empty"`. The SDK now validates client-side
    and throws `ValidationError` with a clear message before the request
    leaves the process. Callers passing an empty / undefined `skuList` were
    always silently getting `400` from Hepsiburada; they now get a typed
    error at call time.
  - **`claims.listByStatus(status, ...)`** — `status` is now typed as
    `ClaimStatus`:
    ```ts
    type ClaimStatus =
      | 'NewRequest'
      | 'Accepted'
      | 'AwaitingAction'
      | 'InDispute'
      | 'Rejected'
      | 'Refunded'
      | 'Cancelled'
      | 'AwaitingPreApproval'
      | (string & {});
    ```
    Trendyol's `'Open'` / `'Closed'` naming does NOT apply to Hepsiburada;
    the live API rejects everything outside the published enum with
    `400 "Wrong Claim Status"`. The trailing `(string & {})` keeps the
    union forward-compatible if Hepsiburada adds a new status without an
    SDK release, while still giving intellisense for the documented set.

  **Path casing alignment** (no behavior change):
  - `orders` (28 methods), `claims` (already correct), `accounting`
    (1 method): all `/merchantid/{id}` segments updated to `/merchantId/{id}`
    per the published spec. Verified live: `oms-external-sit` accepts both
    casings and returns identical results.
  - `listings` (18 methods): path stays at `/merchantid/{id}` (lowercase).
    Live verification revealed `listing-external-sit` is **case-sensitive**
    and returns `400 Bad Request` for the camelCase variant. The lowercase
    form is what the host actually serves.

  The casing rationale is now documented per-resource in JSDoc.

  Live SIT verification:
  - 144 mock tests pass; typecheck + build green.
  - `listings.list` → 89 listings (lowercase, unchanged).
  - `orders.list` / `listMissingInvoicePackages` → 161 packages (camelCase
    works).
  - `claims.listByStatus('AwaitingAction')` → 2 claims (strict union accepted).
  - `listings.getBuyboxOrder('')` / `getCommissions('')` → `ValidationError`
    at call time (no network round-trip).

## 0.4.0

### Minor Changes

- [#46](https://github.com/loncadev/lonca/pull/46) [`55c339f`](https://github.com/loncadev/lonca/commit/55c339f9b18c0525650ac95c9ebca80a992727d5) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 2b — full developer-portal coverage (95 methods, 12 resources)

  Closes EVERY operation documented on developers.hepsiburada.com. Discovery
  methodology: the dev portal SPA exposes a hidden
  `/api/v1/public/docs/{co}/{slug}/{ver}/operations[/{opId}]` API that returns
  full OpenAPI-shape detail (method, path, parameters, requestBody, responses,
  examples) for every documented operation — even when a product's `versions`
  endpoint reports as empty. Phase 2b enumerates all 67 doc-only operations
  across the 12 products that ship documented API surfaces and merges them
  with the 29 spec-backed + 5 Phase 2a discovery endpoints already in the
  SDK. Total: **95 unique methods across 12 resources** (after dedup).

  Extensions to existing resources:
  - **`orders`** (2 → 28 methods): full `siparis-olusturma-entegrasyonu` surface —
    status-bucketed lists (cancelled / paymentAwaiting / shipped / delivered /
    undelivered / unpacked / missing-invoice), single-resource fetches
    (`getByOrderNumber`, `getPackage`, `getPackageLabel`), package mutations
    (`createPackages`, `splitPackage`, `unpackPackage`), status transitions
    (`markPackageInTransit` / `markPackageDelivered` / `markPackageUndelivered`),
    line-item actions (`cancelLineItem`, `updateLineItemCargoCompany`,
    `updateLineItemLaborCost`), package field updates
    (`updatePackageCargoCompany`, `sendInvoiceLink`, `updateParcelInfo`,
    `updatePackageWarehouse`), and cargo-company-change discovery
    (`getChangeableCargoCompaniesForLineItem` / `…ForPackage`,
    `getPackageableLineItems`).
  - **`catalog`** (1 → 11 methods): full `katalog-urun-entegrasyonu` product
    surface — `listProducts` / `listProductsByStatus`,
    `getProductStatus(trackingId)`, `getTrackingIdHistory`,
    `uploadProductViaFile`, `uploadFastListing`, `approvePreMatch` /
    `rejectPreMatch`, `checkProductStatus`, `deleteByMerchantSkuList` /
    `getDeleteProcess(trackingId)`.
  - **`categories`** (2 → 3 methods): adds `getAttributeValues(categoryId,
attributeId)` for enum-style attributes.

  New resources:
  - **`productUpdates`** (3 methods, oms-external) —
    `urun-guncelleme-entegrasyonu`: `importUpdates`, `getUpdateStatus`,
    `getUpdateHistory(hbSku)`.
  - **`suppliers`** (5 methods, oms-external) — `tedarikci-entegrasyonu`:
    `searchOpenPurchaseOrders`, `searchSupplierListings`,
    `searchListingUpdateRequests`, `getListingUpdateRequest`,
    `createListingUpdateRequest`.
  - **`accounting`** (1 method, oms-external) — `muhasebe-entegrasyonu`:
    `listTransactions`. The product's other documented endpoint ("Performans
    Servisi") is the same `/orders/merchantid/{id}` already exposed by
    `orders.list()`.
  - **`questions`** (6 methods, oms-external) — `saticiya-sor-entegrasyonu`:
    `list`, `get`, `getCountByStatus`, `create`, `answer`, `reject`.
  - **`promotions`** (9 methods, oms-external) —
    `satici-promosyonu-entegrasyonu`: `listCategories`, `getBudgets`,
    `getLimits`, `listDiscounts`, `getDiscount`, `createTlDiscount`,
    `createPercentDiscount`, `createXyDiscount`, `cancelDiscount`.

  Phase 2a path correction:
  - `catalog.listProducts` now correctly hits
    `/product/api/products/all-products-of-merchant/{merchantId}` (the
    doc-published path). The Phase 2a fallback `?merchantId=` query path was
    a shortcut that no longer matches the production spec.

  Live verification (SIT, beekod_dev):
  - All Phase 2b orders extensions return `200` end-to-end (e.g.
    `listMissingInvoicePackages` → 161 packages in sandbox).
  - Catalog fixed path returns `200` (empty in sandbox, full shape verified).
  - `productUpdates` / `suppliers` / `questions` / `promotions` return `401`
    in sandbox (gateway recognizes path, beekod_dev lacks scope) — paths are
    typed from the dev-portal spec; integrators with the right production
    scope can call them as-is.
  - `accounting.listTransactions` returns `404` in sandbox — host placement
    presumed `oms-external`; typed from spec, integrator's host may differ.

  Verification:
  - 144 mock tests pass (78 new in `phase-2b.test.ts`, plus Phase 2a tests
    updated for the catalog path fix).
  - `pnpm typecheck` + `pnpm build` green.
  - Live SIT smoke covers every endpoint reachable with the sandbox merchant's
    scope.

  Coverage: 13 of 20 Hepsiburada dev-portal products now covered (the other
  7 are pure documentation pages or empty placeholders on the portal).

## 0.3.0

### Minor Changes

- [#44](https://github.com/loncadev/lonca/pull/44) [`94c8144`](https://github.com/loncadev/lonca/commit/94c81440b22d2f7ef50024cc54c72be1dbfad19e) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 2a — orders, categories, catalog products (5 endpoints, 3 resources) + critical User-Agent fix

  **Critical fix**: prior versions (0.1.0 / 0.2.0) sent
  `User-Agent: {merchantId} - {integratorName}` which Hepsiburada SIT rejects with
  401/403 across listings / OMS / mpop. The SDK now sends the bare
  `integratorName` (e.g. `beekod_dev`) — what merchants configure server-side.
  Live-verified against SIT for all 7 resources (listings, shipping, claims,
  testOrders, orders, categories, catalog). **Upgrade required for working
  production calls.**

  New discovery-first resources (no upstream OpenAPI — shapes derived from live
  SIT probing):
  - **`orders`** (2 methods, `oms-external`):
    - `list({status?, beginDate?, endDate?, offset?, limit?})` — wrapped
      `{ totalCount, limit, offset, pageCount, items[] }`
    - `listPackages({...})` — raw array of shipping packages
  - **`categories`** (2 methods, `mpop` umbrella):
    - `list({page?, size?, leaf?})` — Spring-style envelope
      `{ totalElements, totalPages, data[] }`; ~27k categories total
    - `getAttributes(categoryId)` — **leaf-only**; non-leaf categories throw
      `ValidationError` with Hepsiburada code `1003`
  - **`catalog`** (1 method, `mpop` umbrella):
    - `listProducts({page?, size?})` — merchant catalog rows with per-field
      revision history, validation state, matching state, product-quality score

  Adds a new `mpop` service to the transport's base-URL table
  (`mpop[-sit].hepsiburada.com`) for the catalog / category surfaces. Resources
  already on `oms-external` (claims) now share that host with `orders`.

  **Total Hepsiburada coverage: 34 endpoints / 7 resources** — 8 of 20 API
  products covered. Remaining doc-only surfaces (suppliers, finance / settlements,
  e-invoice, tickets, notifications, questions, promotions) need either upstream
  OpenAPI publication or merchant-portal endpoint hints for Phase 2b.

## 0.2.0

### Minor Changes

- [#42](https://github.com/loncadev/lonca/pull/42) [`497da84`](https://github.com/loncadev/lonca/commit/497da841ec180374e36e2095b4f3ac6aab56c099) Thanks [@keparlak](https://github.com/keparlak)! - feat(hepsiburada): Phase 1b — shipping, claims, test orders (11 endpoints, 3 resources)

  Adds the remaining four OpenAPI-spec-backed Hepsiburada surfaces, completing
  coverage of every spec-backed product on developers.hepsiburada.com (5 of 20):
  - **`shipping`** (4 methods) — `shipping-entegrasyonu`: `getCargoFirms()`,
    `listProfiles()`, `createProfile()`, `updateProfile()`. Service base:
    `shipping-external[-sit].hepsiburada.com`.
  - **`claims`** (6 methods) — `talep-listeleme` + `talep-olusturma`:
    `list()`, `listByStatus()`, `accept()`, `reject()`, `preApprovalConfirm()`,
    `create()`. Dual-service routing: list / status / actions on
    `oms-external[-sit]`, create on `claim-stub-external[-sit]`.
  - **`testOrders`** (1 method, SIT sandbox only) — `test-siparisi-olusturma`:
    `create()` on `oms-stub-external[-sit]`.

  The shipping / talep-\* OpenAPI specs are skeletal (paths only, body schemas
  empty). Path params + known query params are typed strictly; bodies accept
  `Record<string, unknown>` with portal-doc references in JSDoc.

  Total coverage now: 29 endpoints across 4 resources (listings, shipping,
  claims, testOrders) — every Hepsiburada API surface that ships with a
  machine-readable OpenAPI spec.

## 0.1.0

### Minor Changes

- [#40](https://github.com/loncadev/lonca/pull/40) [`ded94fa`](https://github.com/loncadev/lonca/commit/ded94fa2a3c879cdd74bb1cc46650f7199bfaab6) Thanks [@keparlak](https://github.com/keparlak)! - Initial release — `@lonca/hepsiburada` 0.1.0 with **Listings (Phase 1a)** surface.

  ### What's in 0.1.0

  New top-level package + `createHepsiburadaClient({ merchantId, username, password, env, integratorName })` factory. Multi-service base URL resolution: each resource tags which Hepsiburada service it talks to (`listing` / `oms` / `shipping` / `claim-stub` / `oms-stub`), and the transport picks the matching `*-external[-sit]` hostname per environment.

  `client.listings` — 18 typed endpoints from the official OpenAPI spec at `developers.hepsiburada.com/api/v1/public/docs/hepsiburada/listeleme/v1/openapi`:

  | Method                                                           | Path                                                  |
  | ---------------------------------------------------------------- | ----------------------------------------------------- |
  | `list({offset, limit, ...})`                                     | `GET /listings/merchantid/{id}`                       |
  | `getBuyboxOrder(skuList?)`                                       | `GET /buybox-orders/merchantid/{id}`                  |
  | `getCommissions(skuList?)`                                       | `GET /commissions/merchantid/{id}`                    |
  | `activate(hbSku)` / `deactivate(hbSku)`                          | `POST /listings/.../sku/{sku}/{activate\|deactivate}` |
  | `updateSingle(hbSku, mSku, {...})`                               | `POST /listings/.../sku/{sku}/merchantsku/{mSku}`     |
  | `deleteSingle(hbSku, mSku)`                                      | `DELETE /listings/.../sku/{sku}/merchantsku/{mSku}`   |
  | `bulkUnlock({hbSkuList})`                                        | `POST /listings/.../bulk-unlock`                      |
  | `uploadInventory/Stock/Price/ShippingInfo/AdditionalInfo(items)` | `POST /listings/.../{kind}-uploads`                   |
  | `getInventoryUpload/StockUpload/...`                             | `GET /listings/.../{kind}-uploads/id/{id}`            |

  All five bulk uploads return `{ id }` synchronously; poll the matching `get*Upload(id)` to read the outcome (status + per-row errors + price validations for price uploads). Hepsiburada retains upload results for 24+ hours.

  ### Robustness
  - Retry with exponential backoff on 429 (`Retry-After` honored) and 5xx
  - Per-resource `TokenBucketRateLimiter` (default 600 req/min on listings — Hepsiburada doesn't publish per-endpoint limits)
  - Structured errors via `@lonca/core` — auth/rate-limit/not-found/validation/server/network/timeout
  - Client-side validation: empty / >1000-item bulk uploads, `list({offset≥0, limit≥1})`, empty `bulkUnlock` — all throw `ValidationError` before hitting the wire
  - `User-Agent` built automatically as `{merchantId} - {integratorName}` (Hepsiburada rejects requests without one)
  - `AbortSignal` support throughout

  ### Test coverage

  41/41 mock tests pin the documented paths, query keys (hyphenated `salable-listings`/`notsalable-listings`), raw-array body envelopes (Hepsiburada uses bare arrays for bulk uploads, not `{items:[...]}`), error normalization, and every `ValidationError` edge.

  ### Not in 0.1.0 (gaps)

  Only 5 of Hepsiburada's 20 published API products have machine-readable OpenAPI specs today. The other 15 (catalog + product creation/update, orders, fulfilment, suppliers, e-invoice, tickets, etc.) are doc-only on the developer portal. Plan:
  - **0.2.0 — Phase 1b** — Shipping (4 endpoints), Claims read+create (6), Test-order utility (1) → small additions, all spec-backed
  - **0.3.0+** — Catalog / product / order / supplier surfaces, which need either Hepsiburada to publish the missing specs or sandbox credentials for discovery-first probing (the same wire-verify pattern that built `@lonca/trendyol`)

  See [`sdks/hepsiburada/README.md`](./sdks/hepsiburada/README.md) for the full surface + an end-to-end bulk-price-update walkthrough.
