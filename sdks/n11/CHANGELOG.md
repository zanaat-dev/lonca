# @lonca/n11

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
