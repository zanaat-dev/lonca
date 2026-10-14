---
'@lonca/hepsiburada': patch
---

Fixes found by an end-to-end run against Hepsiburada SIT:

- `claims.list()` / `listByStatus()` fill `claimNumber` and `createdAt` from the wire's `number` and `claimDate`; they were always empty, so `claims.accept(claim.claimNumber)` could not be called.
- `orders.listShippedPackages()` / `listDeliveredPackages()` / `listUndeliveredPackages()` read the PascalCase `PackageNumber` / `OrderNumber` these lists send.
- `orders.getPackage()` reads the one-element array the endpoint returns; every field was empty before.
- `orders.getChangeableCargoCompaniesFor*()` fill `code` (the short name `update*CargoCompany` takes) and `name` from the wire's `ShortName` / `Name`.
- `categories.getAttributeValues()` reads the bare `[{ id, value }]` array the endpoint returns instead of throwing `request rejected (code=0)`, and maps `value` to `name`.
- `shipping.createProfile()` / `updateProfile()` send the merchant id in the body (Hepsiburada answered `403 Auth Error` without it); `ShippingProfileInput` gains `id` and `name` (the stored field; `profileName` is deprecated, Hepsiburada ignores it) and `listProfiles()` fills `profileName` from `name`.
- A `403 "MerchantHasNoLine"` (an order number the merchant does not have) is a `NotFoundError`, not an `AuthError`.
- `UploadStatus` includes `InProgress`, which uploads report between `Ready` and `Done`; poll while it is `Ready` or `InProgress`.

<!-- tr
Hepsiburada SIT üzerinde uçtan uca çalıştırmada bulunan düzeltmeler:

- `claims.list()` / `listByStatus()`, `claimNumber` ve `createdAt` alanlarını yanıttaki `number` ve `claimDate` alanlarından dolduruyor; önceden hep boştu, bu yüzden `claims.accept(claim.claimNumber)` çağrılamıyordu.
- `orders.listShippedPackages()` / `listDeliveredPackages()` / `listUndeliveredPackages()`, bu listelerin gönderdiği PascalCase `PackageNumber` / `OrderNumber` alanlarını okuyor.
- `orders.getPackage()`, uç noktanın döndürdüğü tek elemanlı diziyi okuyor; önceden tüm alanlar boştu.
- `orders.getChangeableCargoCompaniesFor*()`, `code` (`update*CargoCompany` için kısa ad) ve `name` alanlarını yanıttaki `ShortName` / `Name` alanlarından dolduruyor.
- `categories.getAttributeValues()`, `request rejected (code=0)` hatası atmak yerine uç noktanın döndürdüğü düz `[{ id, value }]` dizisini okuyor ve `value` alanını `name` alanına eşliyor.
- `shipping.createProfile()` / `updateProfile()`, satıcı kimliğini gövdede gönderiyor (Hepsiburada onsuz `403 Auth Error` dönüyordu); `ShippingProfileInput` tipine `id` ve `name` (saklanan alan; Hepsiburada'nın yok saydığı `profileName` artık önerilmiyor) eklendi ve `listProfiles()`, `profileName` alanını `name` alanından dolduruyor.
- `403 "MerchantHasNoLine"` (satıcıya ait olmayan sipariş numarası) artık `AuthError` değil `NotFoundError`.
- `UploadStatus`, yüklemelerin `Ready` ile `Done` arasında bildirdiği `InProgress` değerini içeriyor; durum `Ready` veya `InProgress` olduğu sürece sorgulamaya devam edin.
-->
