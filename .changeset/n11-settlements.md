---
'@lonca/n11': minor
---

New `finance` resource for n11 settlements (SOAP `SettlementService`), verified on n11's test store (2026-10-16):

- `finance.listSettlements({ startDate, endDate })` lists settlement days with their status, remittance date, paid, deducted and settled amounts.
- `finance.getSettlementDetail(date)` opens one day: its totals, the order lines behind it (commission rate, ad and service fees, seller discounts, VAT, deferments; paged with `paginate()`) and the deferred amounts.
- Dates are `YYYY-MM-DD` for this service; a `Date` is sent as its Turkish calendar day. Both calls page by `limit`, at most 100.

<!-- tr
n11 hakedişleri için yeni `finance` kaynağı (SOAP `SettlementService`), n11 test mağazasında doğrulandı (16 Ekim 2026):

- `finance.listSettlements({ startDate, endDate })` hakediş günlerini durum, havale tarihi, tahsil edilen, kesilen ve ödenecek tutarlarla listeliyor.
- `finance.getSettlementDetail(date)` bir günü açıyor: gün toplamları, arkasındaki sipariş kalemleri (komisyon oranı, reklam ve hizmet bedelleri, satıcı indirimleri, KDV, ertelemeler; `paginate()` ile sayfalanır) ve ertelenen tutarlar.
- Bu serviste tarihler `YYYY-MM-DD` biçiminde; `Date` verilirse Türkiye takvim günü gönderiliyor. İki çağrı da `limit` ile sayfalanıyor, en fazla 100.
-->
