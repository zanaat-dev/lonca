---
'@lonca/n11': minor
---

`orders.list` lines carry the fee and discount fields n11 sends, so a seller can work out what an order nets: `marketplaceFeeRate`, `marketingFeeRate`, `taxDeductionRate`, `sellerCampaignCommissionDiscount` / `Rate`, `sellerDiscountedPrice`, `totalSellerDiscount`, `totalMallDiscount`, `installmentCharge`, `laborCostExcludingVat`, `deliveryFeeType`, `sender`, `productOrigin`. Packages add `installmentCharge`, `sellerId` and the micro-export fields `isMicroExport`, `invoiceLink`, `invoiceAt`, `etgbNo`, `etgbAt`, `hsCode`. All are documented by n11 and were seen on every line of a live store's last eight weeks of orders (read-only check, 2026-10-14). They used to be reachable only through `raw`.

<!-- tr
`orders.list` satırları artık n11'in gönderdiği kesinti ve indirim alanlarını taşıyor; böylece satıcı bir siparişten ne kazandığını hesaplayabiliyor: `marketplaceFeeRate`, `marketingFeeRate`, `taxDeductionRate`, `sellerCampaignCommissionDiscount` / `Rate`, `sellerDiscountedPrice`, `totalSellerDiscount`, `totalMallDiscount`, `installmentCharge`, `laborCostExcludingVat`, `deliveryFeeType`, `sender`, `productOrigin`. Paketlere `installmentCharge`, `sellerId` ve mikro ihracat alanları `isMicroExport`, `invoiceLink`, `invoiceAt`, `etgbNo`, `etgbAt`, `hsCode` eklendi. Hepsi n11 tarafından dokümante ediliyor ve canlı bir mağazanın son sekiz haftalık siparişlerinin her satırında görüldü (yalnızca okuma, 14 Ekim 2026). Önceden yalnızca `raw` üzerinden erişilebiliyordu.
-->
