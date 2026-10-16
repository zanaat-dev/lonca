---
'@lonca/n11': minor
---

New `locations` resource for n11 address data (SOAP `CityService`), verified on n11's test store (2026-10-16): `getCities()` (the 81 Turkish cities), `getCity(plateCode)`, `getDistricts(plateCode)` and `getNeighborhoods(districtId)`. Districts are looked up by plate code (`N11City.code`), not by n11's `cityId`.

<!-- tr
n11 adres verileri için yeni `locations` kaynağı (SOAP `CityService`), n11 test mağazasında doğrulandı (16 Ekim 2026): `getCities()` (Türkiye'nin 81 ili), `getCity(plakaKodu)`, `getDistricts(plakaKodu)` ve `getNeighborhoods(ilçeId)`. İlçeler n11'in `cityId` değeriyle değil plaka koduyla (`N11City.code`) aranıyor.
-->
