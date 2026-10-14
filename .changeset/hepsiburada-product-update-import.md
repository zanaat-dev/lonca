---
'@lonca/hepsiburada': minor
---

`productUpdates.importUpdates()` now sends the batch the way Hepsiburada takes it: a `{ merchantId, items }` JSON file in the multipart field `file`. It used to send the rows as a JSON body, which Hepsiburada answers with a 500, so the method never worked (verified on SIT, 2026-10-14; fixes #220). Rows are typed as the new `ProductUpdateItem` (`hbSku`, `productName`, `productDescription`, `image1`–`image10`, `video`, `attributes`) and a row without `hbSku` is rejected before sending; `ProductUpdateInput` still compiles but is deprecated. `getUpdateStatus()` also returns `success` and `code` (e.g. `4009` "Variant is not found."), and `getUpdateHistory()` rows carry `createdAt`. The fake client now hands a multipart body to the handler as its `FormData`.

<!-- tr
`productUpdates.importUpdates()` artık toplu güncellemeyi Hepsiburada'nın beklediği biçimde gönderiyor: multipart `file` alanında `{ merchantId, items }` içeren bir JSON dosyası. Önceden satırları JSON gövdesi olarak gönderiyordu; Hepsiburada buna 500 döndüğü için metot hiç çalışmıyordu (SIT'te doğrulandı, 14 Ekim 2026; #220'yi kapatır). Satırların tipi artık yeni `ProductUpdateItem` (`hbSku`, `productName`, `productDescription`, `image1`–`image10`, `video`, `attributes`); `hbSku` içermeyen satır gönderilmeden reddediliyor. `ProductUpdateInput` derlenmeye devam ediyor ama kullanımdan kaldırıldı. `getUpdateStatus()` ayrıca `success` ve `code` alanlarını döndürüyor (ör. `4009` "Variant is not found."), `getUpdateHistory()` satırlarında `createdAt` var. Sahte istemci multipart gövdeyi handler'a `FormData` olarak veriyor.
-->
