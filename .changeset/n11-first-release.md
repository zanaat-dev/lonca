---
'@lonca/n11': minor
---

First release of `@lonca/n11`, the SDK for the n11 seller API: one typed client for n11's REST services and the SOAP services it still runs, with no XML in your code. It covers products (list, create, update, delete, task results), price and stock (`inventory.updateAndWait`), orders (list, approve, split, collection request, labour costs, partial cancel, invoice link), categories, catalogue search, questions (list, answer), returns (list, approve, deny, postpone) and shipment companies, plus `normalizeStatus` and a fake client in `@lonca/n11/testing`. Reads are verified against a live seller account and product writes against n11's test store.

<!-- tr
`@lonca/n11`'in ilk sürümü: n11 satıcı API'si için SDK. n11'in REST servislerini ve hâlâ SOAP ile çalışan servislerini tek bir tipli istemcide topluyor; kodunuzda XML yok. Ürünler (listeleme, oluşturma, güncelleme, silme, task sonuçları), fiyat ve stok (`inventory.updateAndWait`), siparişler (listeleme, onay, paket bölme, toplama talebi, işçilik bedeli, parçalı iptal, fatura linki), kategoriler, katalog arama, sorular (listeleme, cevaplama), iadeler (listeleme, onay, ret, erteleme) ve kargo firmaları kapsamda; ayrıca `normalizeStatus` ve `@lonca/n11/testing` içinde sahte bir istemci var. Okuma işlemleri canlı bir satıcı hesabında, ürün yazma işlemleri n11'in test mağazasında doğrulandı.
-->
