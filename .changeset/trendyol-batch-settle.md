---
'@lonca/trendyol': patch
---

`inventory.updateAndWait()` and `pollBatchStatus()` treat a batch as done once every one of its `itemCount` items is `SUCCESS` or `FAILED`, not only when the batch status reads `COMPLETED` / `FAILED`. On Trendyol stage a stock-and-price batch kept the status `PROCESSING` for good although its item was `SUCCESS` and the stock had changed (2026-10-14), so `updateAndWait` waited for the full timeout and threw `TimeoutError`. The check is exported as `isBatchSettled(result)`.

<!-- tr
`inventory.updateAndWait()` ve `pollBatchStatus()` artık bir batch'i, `itemCount` kadar kaleminin hepsi `SUCCESS` ya da `FAILED` olduğunda tamamlanmış sayıyor; yalnızca batch durumu `COMPLETED` / `FAILED` olduğunda değil. Trendyol stage'de bir stok ve fiyat batch'i, kalemi `SUCCESS` olduğu ve stok değiştiği halde durumunu hep `PROCESSING` olarak bıraktı (14 Ekim 2026); bu yüzden `updateAndWait` zaman aşımı dolana kadar bekleyip `TimeoutError` fırlatıyordu. Kontrol `isBatchSettled(result)` olarak dışa açıldı.
-->
