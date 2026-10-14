---
'@lonca/trendyol': minor
---

Fixes and additions from an end-to-end run of every method on Trendyol stage (2026-10-14):

- `claims.list()` returns an empty page when nothing matches; Trendyol answers that case with 404 `order.not.found`, which was thrown as `NotFoundError`. It also takes the documented `orderNumber` and `claimIds` filters.
- `claims.create()` takes `shipmentCompanyId` (Trendyol refuses a claim without it, "ShipmentCompanyId: 0 hatalıdır"; `17` is Trendyol Express) and resolves to `{ claimId, claimItemIds, cargoTrackingNumber, raw }`.
- `testOrders.setClaimsWaitingInAction()` sends the `sellerID` header; stage refused it without one.
- `inventory.updateAndWait()` / `pollBatchStatus()` wait for every item of the batch: a product-create batch read `COMPLETED` a few seconds before its item result appeared, so a wait could return without the per-item outcome. A batch that is still `COMPLETED` with missing items at the timeout is returned instead of thrown.
- Docs: `claims.createIssue()` needs at least one file in practice; `products.updateUnapproved()` needs the full product.

<!-- tr
Trendyol stage'de her metodun uçtan uca çalıştırılmasından çıkan düzeltmeler ve eklemeler (14 Ekim 2026):

- `claims.list()` eşleşme olmadığında boş sayfa döndürüyor; Trendyol bu durumda 404 `order.not.found` dönüyordu ve SDK bunu `NotFoundError` olarak fırlatıyordu. Dokümandaki `orderNumber` ve `claimIds` filtreleri de eklendi.
- `claims.create()` artık `shipmentCompanyId` alıyor (Trendyol bu alan olmadan iade talebini reddediyor, "ShipmentCompanyId: 0 hatalıdır"; Trendyol Express için `17`) ve `{ claimId, claimItemIds, cargoTrackingNumber, raw }` döndürüyor.
- `testOrders.setClaimsWaitingInAction()` `sellerID` header'ını gönderiyor; stage bu header olmadan isteği reddediyordu.
- `inventory.updateAndWait()` / `pollBatchStatus()` batch'in her kalemini bekliyor: ürün oluşturma batch'i kalem sonucu gelmeden birkaç saniye önce `COMPLETED` oluyordu, bu yüzden bekleme kalem sonucu olmadan dönebiliyordu. Zaman aşımında hâlâ eksik kalemli `COMPLETED` bir batch hata yerine döndürülüyor.
- Dokümantasyon: `claims.createIssue()` pratikte en az bir dosya istiyor; `products.updateUnapproved()` ürünün tamamını istiyor.
-->
