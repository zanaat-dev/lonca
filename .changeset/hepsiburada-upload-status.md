---
'@lonca/hepsiburada': patch
---

`UploadStatus` lists the values Hepsiburada actually returns for listing uploads: `Ready` while the upload is queued and `Done` once it is applied (stock and price uploads on SIT, 2026-10-14: `Ready` right away, `Done` seconds later, the listing changing only then). The README and the 30-minute guide told callers to poll while the status is `PROCESSING`, a value Hepsiburada never sends, so that loop stopped at `Ready` before the change had landed; they now poll while it is `Ready`. The old upper-case values stay in the type for compatibility.

<!-- tr
`UploadStatus` artık Hepsiburada'nın listing yüklemeleri için gerçekte döndürdüğü değerleri listeliyor: yükleme kuyruktayken `Ready`, uygulandığında `Done` (SIT'te stok ve fiyat yüklemeleri, 14 Ekim 2026: hemen `Ready`, birkaç saniye sonra `Done`; listing ancak o zaman değişiyor). README ve 30 dakikalık rehber, durum `PROCESSING` olduğu sürece beklemeyi söylüyordu; Hepsiburada bu değeri hiç göndermediği için döngü, değişiklik daha uygulanmadan `Ready`'de duruyordu. Artık durum `Ready` olduğu sürece bekleniyor. Eski büyük harfli değerler uyumluluk için tipte kaldı.
-->
