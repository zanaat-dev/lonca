---
'@lonca/hepsiburada': patch
---

The order write input types and README examples now use the field names Hepsiburada reads, checked on SIT with test orders (2026-10-14). The SDK forwards these bodies unchanged, so code that already sends the right fields is unaffected; code that followed the old hints never worked:

- `createPackages`: `lineItemRequests: [{ id, quantity }]` (a `lineItems` list → `400 "Line items empty or null"`).
- `updateLineItemCargoCompany` / `updatePackageCargoCompany`: `CargoCompanyShortName` (a `cargoCompany` field → `400 CargoCompanyNotFound`).
- `markPackageUndelivered`: `undeliveredReason` + `undeliveredDate` (a `reason` field → `400 "incorrect undeliveredReason value"`); the in-transit and delivered fields are typed too.
- `splitPackage`: `packageDetails` / `cancelledItems`; `cancelLineItem`: `reasonId` (both per the spec; SIT could not get past its own package lookup to confirm).
- The order and package lists send `begindate` / `enddate` as documented, and `beginDate` / `endDate` are documented as `yyyy-MM-dd HH:mm`: other formats are not rejected, the list just comes back empty.

<!-- tr
Sipariş yazma metodlarının girdi tipleri ve README örnekleri artık Hepsiburada'nın okuduğu alan adlarını kullanıyor; SIT'te test siparişleriyle kontrol edildi (14 Ekim 2026). SDK bu gövdeleri olduğu gibi iletiyor; doğru alanları zaten gönderen kod etkilenmiyor, eski ipuçlarını izleyen kod ise hiç çalışmıyordu:

- `createPackages`: `lineItemRequests: [{ id, quantity }]` (`lineItems` listesi → `400 "Line items empty or null"`).
- `updateLineItemCargoCompany` / `updatePackageCargoCompany`: `CargoCompanyShortName` (`cargoCompany` alanı → `400 CargoCompanyNotFound`).
- `markPackageUndelivered`: `undeliveredReason` + `undeliveredDate` (`reason` alanı → `400 "incorrect undeliveredReason value"`); kargoda ve teslim edildi alanları da tiplendi.
- `splitPackage`: `packageDetails` / `cancelledItems`; `cancelLineItem`: `reasonId` (ikisi de spec'e göre; SIT kendi paket kaydı eksikliği yüzünden doğrulamaya izin vermedi).
- Sipariş ve paket listeleri dokümandaki gibi `begindate` / `enddate` gönderiyor; `beginDate` / `endDate` için format `yyyy-MM-dd HH:mm` olarak belgelendi: başka formatlar hata vermiyor, liste boş dönüyor.
-->
