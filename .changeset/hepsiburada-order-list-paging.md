---
'@lonca/hepsiburada': patch
---

The order lists (`orders.list`, `listCancelled`, `listPaymentAwaiting`, …) always send `offset` and `limit` now, defaulting to `0` and `100`. Called without them, Hepsiburada answers `400 "limit and offset parameters are required"` (verified on SIT, 2026-10-14), so a bare `orders.list()` failed although the docs promised a default of 100.

<!-- tr
Sipariş listeleri (`orders.list`, `listCancelled`, `listPaymentAwaiting`, …) artık her zaman `offset` ve `limit` gönderiyor; varsayılanları `0` ve `100`. Bunlar olmadan Hepsiburada `400 "limit and offset parameters are required"` döndürüyor (SIT'te doğrulandı, 14 Ekim 2026). Bu yüzden dokümantasyon 100 varsayılanını söylese de parametresiz `orders.list()` hata veriyordu.
-->
