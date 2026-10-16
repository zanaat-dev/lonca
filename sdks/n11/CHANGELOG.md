# @lonca/n11

## 0.4.0

### Minor Changes

- [#253](https://github.com/zanaat-dev/lonca/pull/253) [`6748495`](https://github.com/zanaat-dev/lonca/commit/67484951630fe4a86c49256c31995f29f04b69b2) Thanks [@keparlak](https://github.com/keparlak)! - New `locations` resource for n11 address data (SOAP `CityService`), verified on n11's test store (2026-10-16): `getCities()` (the 81 Turkish cities), `getCity(plateCode)`, `getDistricts(plateCode)` and `getNeighborhoods(districtId)`. Districts are looked up by plate code (`N11City.code`), not by n11's `cityId`.
  
  <!-- tr
  n11 adres verileri için yeni `locations` kaynağı (SOAP `CityService`), n11 test mağazasında doğrulandı (16 Ekim 2026): `getCities()` (Türkiye'nin 81 ili), `getCity(plakaKodu)`, `getDistricts(plakaKodu)` ve `getNeighborhoods(ilçeId)`. İlçeler n11'in `cityId` değeriyle değil plaka koduyla (`N11City.code`) aranıyor.
  -->

## 0.3.0

### Minor Changes

- [#249](https://github.com/zanaat-dev/lonca/pull/249) [`619db46`](https://github.com/zanaat-dev/lonca/commit/619db46f641999135871cacf59ce154d76a0f0c7) Thanks [@keparlak](https://github.com/keparlak)! - New `finance` resource for n11 settlements (SOAP `SettlementService`), verified on n11's test store (2026-10-16):
  
  - `finance.listSettlements({ startDate, endDate })` lists settlement days with their status, remittance date, paid, deducted and settled amounts.
  - `finance.getSettlementDetail(date)` opens one day: its totals, the order lines behind it (commission rate, ad and service fees, seller discounts, VAT, deferments; paged with `paginate()`) and the deferred amounts.
  - Dates are `YYYY-MM-DD` for this service; a `Date` is sent as its Turkish calendar day. Both calls page by `limit`, at most 100.
  
  <!-- tr
  n11 hakedişleri için yeni `finance` kaynağı (SOAP `SettlementService`), n11 test mağazasında doğrulandı (16 Ekim 2026):
  
  - `finance.listSettlements({ startDate, endDate })` hakediş günlerini durum, havale tarihi, tahsil edilen, kesilen ve ödenecek tutarlarla listeliyor.
  - `finance.getSettlementDetail(date)` bir günü açıyor: gün toplamları, arkasındaki sipariş kalemleri (komisyon oranı, reklam ve hizmet bedelleri, satıcı indirimleri, KDV, ertelemeler; `paginate()` ile sayfalanır) ve ertelenen tutarlar.
  - Bu serviste tarihler `YYYY-MM-DD` biçiminde; `Date` verilirse Türkiye takvim günü gönderiliyor. İki çağrı da `limit` ile sayfalanıyor, en fazla 100.
  -->

## 0.2.0

### Minor Changes

- [#238](https://github.com/zanaat-dev/lonca/pull/238) [`c287336`](https://github.com/zanaat-dev/lonca/commit/c2873360baab4d194f365162e1b2e2c925910488) Thanks [@keparlak](https://github.com/keparlak)! - `orders.list` lines carry the fee and discount fields n11 sends, so a seller can work out what an order nets: `marketplaceFeeRate`, `marketingFeeRate`, `taxDeductionRate`, `sellerCampaignCommissionDiscount` / `Rate`, `sellerDiscountedPrice`, `totalSellerDiscount`, `totalMallDiscount`, `installmentCharge`, `laborCostExcludingVat`, `deliveryFeeType`, `sender`, `productOrigin`. Packages add `installmentCharge`, `sellerId` and the micro-export fields `isMicroExport`, `invoiceLink`, `invoiceAt`, `etgbNo`, `etgbAt`, `hsCode`. All are documented by n11 and were seen on every line of a live store's last eight weeks of orders (read-only check, 2026-10-14). They used to be reachable only through `raw`.
  
  <!-- tr
  `orders.list` satırları artık n11'in gönderdiği kesinti ve indirim alanlarını taşıyor; böylece satıcı bir siparişten ne kazandığını hesaplayabiliyor: `marketplaceFeeRate`, `marketingFeeRate`, `taxDeductionRate`, `sellerCampaignCommissionDiscount` / `Rate`, `sellerDiscountedPrice`, `totalSellerDiscount`, `totalMallDiscount`, `installmentCharge`, `laborCostExcludingVat`, `deliveryFeeType`, `sender`, `productOrigin`. Paketlere `installmentCharge`, `sellerId` ve mikro ihracat alanları `isMicroExport`, `invoiceLink`, `invoiceAt`, `etgbNo`, `etgbAt`, `hsCode` eklendi. Hepsi n11 tarafından dokümante ediliyor ve canlı bir mağazanın son sekiz haftalık siparişlerinin her satırında görüldü (yalnızca okuma, 14 Ekim 2026). Önceden yalnızca `raw` üzerinden erişilebiliyordu.
  -->

## 0.1.1

### Patch Changes

- [#217](https://github.com/zanaat-dev/lonca/pull/217) [`c17865c`](https://github.com/zanaat-dev/lonca/commit/c17865cc5c3dc87316fea4683d35babfc423646e) Thanks [@keparlak](https://github.com/keparlak)! - Documentation only. n11 serves no cargo label file over the API; the label is the package's `cargoTrackingNumber` printed as a CODE-128 barcode (n11 support, 2026-10-14). `products.update` notes that n11 does not store `productMainId` on a product it has matched to a catalogue product, although the task reports success.
  
  <!-- tr
  Yalnızca dokümantasyon. n11 API üzerinden kargo etiketi dosyası vermiyor; etiket, paketin `cargoTrackingNumber` değerinin CODE-128 barkod olarak basılmasıyla oluşuyor (n11 destek, 14 Ekim 2026). `products.update` için not: n11, kataloğa eşlediği bir üründe görev başarılı görünse de `productMainId` değerini kaydetmiyor.
  -->

## 0.1.0

### Minor Changes

- [#211](https://github.com/zanaat-dev/lonca/pull/211) [`d6a9340`](https://github.com/zanaat-dev/lonca/commit/d6a93409d6f6ae021a373dbe37c3c93094b9b865) Thanks [@keparlak](https://github.com/keparlak)! - First release of `@lonca/n11`, the SDK for the n11 seller API: one typed client for n11's REST services and the SOAP services it still runs, with no XML in your code. It covers products (list, create, update, delete, task results), price and stock (`inventory.updateAndWait`), orders (list, approve, split, collection request, labour costs, partial cancel, invoice link), categories, catalogue search, questions (list, answer), returns (list, approve, deny, postpone) and shipment companies, plus `normalizeStatus` and a fake client in `@lonca/n11/testing`. Reads are verified against a live seller account and product writes against n11's test store.
  
  <!-- tr
  `@lonca/n11`'in ilk sürümü: n11 satıcı API'si için SDK. n11'in REST servislerini ve hâlâ SOAP ile çalışan servislerini tek bir tipli istemcide topluyor; kodunuzda XML yok. Ürünler (listeleme, oluşturma, güncelleme, silme, task sonuçları), fiyat ve stok (`inventory.updateAndWait`), siparişler (listeleme, onay, paket bölme, toplama talebi, işçilik bedeli, parçalı iptal, fatura linki), kategoriler, katalog arama, sorular (listeleme, cevaplama), iadeler (listeleme, onay, ret, erteleme) ve kargo firmaları kapsamda; ayrıca `normalizeStatus` ve `@lonca/n11/testing` içinde sahte bir istemci var. Okuma işlemleri canlı bir satıcı hesabında, ürün yazma işlemleri n11'in test mağazasında doğrulandı.
  -->
