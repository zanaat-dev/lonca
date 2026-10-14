---
'@lonca/hepsiburada': patch
---

`catalog.deleteByMerchantSkuList()` sends the array of `{ merchant, merchantSku }` Hepsiburada documents, filling in `merchant` from the client. It sent `{ merchantSkuList: [...] }`, which Hepsiburada answers with a 500 (verified on SIT, 2026-10-14), so the method never worked. The older input is still accepted and converted, so existing calls now work as written.

<!-- tr
`catalog.deleteByMerchantSkuList()` artık Hepsiburada'nın dokümante ettiği `{ merchant, merchantSku }` dizisini gönderiyor; `merchant` alanını istemciden dolduruyor. Önceden `{ merchantSkuList: [...] }` gönderiyordu; Hepsiburada buna 500 döndüğü için (SIT'te doğrulandı, 14 Ekim 2026) metot hiç çalışmıyordu. Eski girdi biçimi de kabul edilip diziye çevriliyor, yani mevcut çağrılar yazıldıkları gibi çalışmaya başlıyor.
-->
