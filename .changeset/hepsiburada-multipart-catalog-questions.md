---
'@lonca/hepsiburada': minor
---

`catalog.uploadProductViaFile()` and `questions.answer()` now send `multipart/form-data`, as Hepsiburada documents them. Both sent a JSON body before, which Hepsiburada refuses (the upload with a 500, the answer with a 422 "Bu alan geçersizdir"), so neither worked; verified on SIT, 2026-10-14.

- `catalog.uploadProductViaFile()` sends the products as a JSON file in the `file` part, fills in `merchant` from the client when a row has none, and rejects a row without `categoryId` or `attributes.merchantSku` before sending. Rows are typed as the new `CatalogUploadProduct`; `UploadProductsInput` still compiles but is deprecated. The upload receipt now reads the `trackingId` from the `data` envelope the endpoint answers with (it came back empty before), and `getProductStatus()` also returns `success` and `code`.
- `questions.answer()` sends the `Answer` and `Files` parts (files as `Blob` / `File`), checks the answer is 1–2000 characters, and accepts the lower-case `answer` key the README used to show.

<!-- tr
`catalog.uploadProductViaFile()` ve `questions.answer()` artık Hepsiburada'nın dokümante ettiği gibi `multipart/form-data` gönderiyor. İkisi de önceden JSON gövde gönderiyordu; Hepsiburada bunu reddettiği için (yükleme 500, cevap 422 "Bu alan geçersizdir") ikisi de çalışmıyordu. SIT'te doğrulandı, 14 Ekim 2026.

- `catalog.uploadProductViaFile()` ürünleri `file` alanında bir JSON dosyası olarak gönderiyor; `merchant` alanı olmayan satırlara istemcinin merchant id'sini koyuyor; `categoryId` ya da `attributes.merchantSku` içermeyen satırı gönderilmeden reddediyor. Satırların tipi yeni `CatalogUploadProduct`; `UploadProductsInput` derlenmeye devam ediyor ama kullanımdan kaldırıldı. Yükleme makbuzu `trackingId`'yi uç noktanın döndürdüğü `data` zarfından okuyor (önceden boş dönüyordu); `getProductStatus()` ayrıca `success` ve `code` döndürüyor.
- `questions.answer()` `Answer` ve `Files` alanlarını gönderiyor (dosyalar `Blob` / `File` olarak), cevabın 1–2000 karakter olduğunu kontrol ediyor ve README'nin önceden gösterdiği küçük harfli `answer` anahtarını da kabul ediyor.
-->
