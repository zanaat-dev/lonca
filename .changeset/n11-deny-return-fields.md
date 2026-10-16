---
'@lonca/n11': patch
---

`claims.denyReturn()` always sends `returnShipmentType`, `shipmentCompanyId`, `trackingNumber` and `deliveryReceiptNumber`, as empty elements when unset. n11 refused a `CAMPAIGN` denial without them ("trackingNumber alanı geçersizdir"), although its docs say to leave them empty; with the empty elements it was accepted (test store, 2026-10-16). Docs: `claims.listReturns()` lists a `REQUESTED` claim only once its return shipment has reached the seller.

<!-- tr
`claims.denyReturn()` artık `returnShipmentType`, `shipmentCompanyId`, `trackingNumber` ve `deliveryReceiptNumber` alanlarını her zaman gönderiyor; verilmediklerinde boş öğe olarak. n11, dokümanı bu alanların boş bırakılmasını söylese de onlarsız gönderilen bir `CAMPAIGN` reddini kabul etmiyordu ("trackingNumber alanı geçersizdir"); boş öğelerle kabul etti (test mağazası, 16 Ekim 2026). Dokümantasyon: `claims.listReturns()` `REQUESTED` durumundaki bir talebi ancak iade kargosu satıcıya ulaştıktan sonra listeliyor.
-->
