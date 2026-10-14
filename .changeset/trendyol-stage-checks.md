---
'@lonca/trendyol': patch
---

Checked on Trendyol stage with test orders (2026-10-14). HTTP `400` and `422` answers (Trendyol's business rules, `TrendyolBusinessException`) are now a `ValidationError` whose message carries Trendyol's first message, e.g. `Trendyol rejected the request (400): Fatura numarası hatalıdır…`; they were a generic `LoncaError` with code `UNKNOWN` and the message `Trendyol unexpected response (400)`. Docs: `testOrders.updateStatus(id, status)` without `lines` works (stage moved the package), and `SendInvoiceLinkInput.invoiceNumber` takes the `LON2026000000001` shape.

<!-- tr
Trendyol stage'de test siparişleriyle kontrol edildi (14 Ekim 2026). HTTP `400` ve `422` cevapları (Trendyol'un iş kuralları, `TrendyolBusinessException`) artık mesajında Trendyol'un ilk mesajını taşıyan bir `ValidationError`, ör. `Trendyol rejected the request (400): Fatura numarası hatalıdır…`. Önceden `UNKNOWN` kodlu genel bir `LoncaError` ve `Trendyol unexpected response (400)` mesajıydılar. Dokümantasyon: `lines` olmadan `testOrders.updateStatus(id, status)` çalışıyor (stage paketi ilerletti); `SendInvoiceLinkInput.invoiceNumber` `LON2026000000001` biçiminde olmalı.
-->
