---
'@lonca/hepsiburada': minor
---

Typed fields for what Hepsiburada sends on order lines and packages beyond its spec (found by the 2026-10-27 drift run; checked read-only on prod and on SIT):

- `Order` (the rows of `orders.list()` and the other line feeds) gains `deci` (volumetric weight of one unit), `totalDeci` (`deci` × `quantity`) and `hasInvoice` (`true` once an invoice link was sent for the line's package).
- `ShippingPackage` gains `totalDeci` (the sum of its lines' `deci` × `quantity`) and `warehouse` (`{ shippingAddressLabel, shippingModel }`, the new `PackageWarehouse` type) from `orders.listPackages()`, and `hasInvoice` from the `HasInvoice` of the delivered list.

<!-- tr
Hepsiburada'nın sipariş satırlarında ve paketlerde spec dışında gönderdiği alanlar artık tipli (27 Ekim 2026 drift koşusunda bulundu; prod'da salt okuma ve SIT'te doğrulandı):

- `Order` (`orders.list()` ve diğer satır akışlarının satırları) `deci` (bir birimin desisi), `totalDeci` (`deci` × `quantity`) ve `hasInvoice` (satırın paketi için fatura linki gönderildiğinde `true`) alanlarını kazandı.
- `ShippingPackage`, `orders.listPackages()` yanıtından `totalDeci` (satırların `deci` × `quantity` toplamı) ve `warehouse` (`{ shippingAddressLabel, shippingModel }`, yeni `PackageWarehouse` tipi), teslim edilenler listesindeki `HasInvoice` değerinden de `hasInvoice` alanını kazandı.
-->
