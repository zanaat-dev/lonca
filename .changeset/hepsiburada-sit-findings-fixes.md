---
'@lonca/hepsiburada': patch
---

Claim and invoice fixes from the Hepsiburada SIT run (#270), checked on SIT on 2026-10-27:

- `claims.preApprovalConfirm()` sends `preApprovalReason: 'ProductInvestigation'` when the input has none. It is the only value Hepsiburada accepts (`400 "PreApprovalReason must be ProductInvestigation"`), and without it every call was refused with `400 "PreApprovalReason cannot be empty"`, including the README's `{ confirmed: true }` example. A reason you pass is sent unchanged.
- `claims.reject()` throws a `ValidationError` for an empty body before sending it; Hepsiburada refuses one with a bare `400`. A reject with `MerchantStatement` was accepted; send it with a `ClaimRejectionReason` from Hepsiburada's list.
- `claims.create()` throws a `ValidationError` (`status` 200, the body on `error.data.body`) when Hepsiburada reports a failed create inside a `200`: the failure text (`"Claim oluşturulamadı."`) sat where the claim number belongs, and the call resolved as if the claim had been created.
- Docs: `orders.sendInvoiceLink()` works with the plain `invoiceLink` form when the link is served as `application/pdf` or `text/html`; Hepsiburada downloads it and refuses any other content type (`400` code `2003`), even with `contentType` set. `invoices[]` entries need their `orderNumber`. The README and the guide use the documented claim, status and invoice bodies.

<!-- tr
Hepsiburada SIT çalıştırmasından (#270) talep ve fatura düzeltmeleri; SIT'te 27 Ekim 2026'da doğrulandı:

- `claims.preApprovalConfirm()`, girdide neden yoksa `preApprovalReason: 'ProductInvestigation'` gönderiyor. Hepsiburada'nın kabul ettiği tek değer bu (`400 "PreApprovalReason must be ProductInvestigation"`); onsuz her çağrı, README'deki `{ confirmed: true }` örneği de dahil, `400 "PreApprovalReason cannot be empty"` ile reddediliyordu. Sizin verdiğiniz neden değiştirilmeden gönderiliyor.
- `claims.reject()`, boş gövdeyi göndermeden `ValidationError` atıyor; Hepsiburada boş gövdeyi gövdesiz bir `400` ile reddediyor. `MerchantStatement` içeren bir red kabul edildi; Hepsiburada'nın listesinden bir `ClaimRejectionReason` ile birlikte gönderin.
- `claims.create()`, Hepsiburada başarısız bir oluşturmayı `200` içinde bildirdiğinde `ValidationError` atıyor (`status` 200, gövde `error.data.body` üzerinde): hata metni (`"Claim oluşturulamadı."`) talep numarasının yerinde duruyordu ve çağrı talep oluşturulmuş gibi sonuçlanıyordu.
- Dokümantasyon: `orders.sendInvoiceLink()`, bağlantı `application/pdf` veya `text/html` olarak sunulduğunda düz `invoiceLink` biçimiyle çalışıyor; Hepsiburada bağlantıyı indiriyor ve başka içerik tiplerini, `contentType` verilse bile, reddediyor (`400`, kod `2003`). `invoices[]` girdileri kendi `orderNumber` alanını istiyor. README ve rehber, dokümante edilmiş talep, durum ve fatura gövdelerini kullanıyor.
-->
