---
'@lonca/hepsiburada': minor
---

Types and inputs for the open findings of the Hepsiburada SIT run (#270), checked on SIT on 2026-10-27:

- `shipping.getCargoFirms()` returns one row per cargo firm: `id` and `name` come from the nested `cargoFirmId` / `cargoFirmName`, and the new `labelId`, `labelName` and `labelDisplayName` tell which label (`LowDeci`, `HighDeci`, `SpecialDelivery`, …) it is listed under. The rows were label groups, so `id` and `name` were always empty. `code` is deprecated: Hepsiburada sends no code here.
- `orders.getPackageLabel(packageNumber, { format })` takes the output format (`zpl`, `base64zpl`, `pdf`, `png`, `jpg`), and `PackageLabel` gains the spec's `data` and `hasMerchantMutualBarcode`. `url` and `base64` are deprecated; they are not in Hepsiburada's `BarcodeData`. SIT could not produce a label (shared labels are for HepsiJet and Aras, and stub packages have no delivery record), so the response shape follows the spec only.
- The date fields of `orders.markPackageInTransit()` / `markPackageDelivered()` / `markPackageUndelivered()` take a `Date` as well as a string; a `Date` is sent as an RFC 3339 string. The new `PackageStatusDate` type documents the string form Hepsiburada accepts (RFC 3339 with a zone, `…Z` or `…+03:00`; `yyyy-MM-dd HH:mm` and `yyyy-MM-dd` are refused).
- `UndeliveredReason` hints `CustomerUnreachable`, the one `undeliveredReason` value SIT accepts; Hepsiburada publishes no list.
- `ClaimActionInput` types the documented bodies of the claim actions: `FinalizedWith`, `AcceptionReason`, `InvoiceLink` (accept), `ClaimRejectionReason`, `MerchantStatement`, `Reports`, `UploadedReportsUrls` (reject) and `preApprovalReason` (pre-approval). `reasonCode` and `confirmed` are deprecated; Hepsiburada reads neither. `CreateClaimInput` types `type`, `reason` and `newSKU`; `lines` is deprecated.

<!-- tr
Hepsiburada SIT çalıştırmasında açık kalan bulgular (#270) için tipler ve girdiler; SIT'te 27 Ekim 2026'da doğrulandı:

- `shipping.getCargoFirms()` artık her kargo firması için bir satır döndürüyor: `id` ve `name` iç içe gelen `cargoFirmId` / `cargoFirmName` alanlarından geliyor; yeni `labelId`, `labelName` ve `labelDisplayName` alanları firmanın hangi etiket (`LowDeci`, `HighDeci`, `SpecialDelivery`, …) altında listelendiğini söylüyor. Satırlar etiket gruplarıydı, bu yüzden `id` ve `name` hep boştu. `code` artık önerilmiyor: Hepsiburada burada kod göndermiyor.
- `orders.getPackageLabel(packageNumber, { format })` çıktı biçimini (`zpl`, `base64zpl`, `pdf`, `png`, `jpg`) alıyor; `PackageLabel` tipine spec'teki `data` ve `hasMerchantMutualBarcode` alanları eklendi. `url` ve `base64` artık önerilmiyor; Hepsiburada'nın `BarcodeData` tipinde yoklar. SIT etiket üretemedi (ortak barkod HepsiJet ve Aras için, stub paketlerin teslimat kaydı yok), bu yüzden yanıt şekli yalnızca spec'e dayanıyor.
- `orders.markPackageInTransit()` / `markPackageDelivered()` / `markPackageUndelivered()` tarih alanları string'in yanında `Date` de alıyor; `Date` RFC 3339 string olarak gönderiliyor. Yeni `PackageStatusDate` tipi, Hepsiburada'nın kabul ettiği string biçimini belgeliyor (saat dilimli RFC 3339, `…Z` veya `…+03:00`; `yyyy-MM-dd HH:mm` ve `yyyy-MM-dd` reddediliyor).
- `UndeliveredReason`, SIT'in kabul ettiği tek `undeliveredReason` değeri olan `CustomerUnreachable` değerini öneriyor; Hepsiburada bir liste yayımlamıyor.
- `ClaimActionInput`, talep aksiyonlarının dokümante edilmiş gövdelerini tipliyor: `FinalizedWith`, `AcceptionReason`, `InvoiceLink` (kabul), `ClaimRejectionReason`, `MerchantStatement`, `Reports`, `UploadedReportsUrls` (red) ve `preApprovalReason` (ön onay). `reasonCode` ve `confirmed` artık önerilmiyor; Hepsiburada ikisini de okumuyor. `CreateClaimInput` tipine `type`, `reason` ve `newSKU` eklendi; `lines` artık önerilmiyor.
-->
