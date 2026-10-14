---
'@lonca/trendyol': patch
---

Request fixes found by the new request check (`pnpm drift:requests`), against Trendyol's references:

- `exportCenter.updateStocks()` sends `{ stocks: [...] }`, the body "autoft-update-stocks" requires. It sent `{ items: [...] }`, a key the endpoint does not know.
- `testOrders.create()` and `testOrders.updateStatus()` send the `sellerID` header both references require (`createTestOrder` has no seller id in its path at all).
- Docs: `updateStatus` needs `options.lines` (the two-argument form stays for compatibility but sends a body the reference does not allow); the Export Center price and stock row fields are `{ barcode, buyingPrice, rrp? }` and `{ barcode, stock }`; the README's `videos.create` input is `{ title, videoUrl, productContentIds }`.

<!-- tr
Yeni istek kontrolünün (`pnpm drift:requests`) Trendyol referanslarına karşı bulduğu düzeltmeler:

- `exportCenter.updateStocks()` artık "autoft-update-stocks"un zorunlu tuttuğu `{ stocks: [...] }` gövdesini gönderiyor. Önceden uç noktanın tanımadığı `{ items: [...] }` gönderiyordu.
- `testOrders.create()` ve `testOrders.updateStatus()` iki referansın da zorunlu tuttuğu `sellerID` header'ını gönderiyor (`createTestOrder` yolunda satıcı id'si hiç yok).
- Dokümantasyon: `updateStatus` için `options.lines` gerekli (iki argümanlı kullanım uyumluluk için duruyor ama referansın izin vermediği bir gövde gönderiyor); Export Center fiyat ve stok satırı alanları `{ barcode, buyingPrice, rrp? }` ve `{ barcode, stock }`; README'deki `videos.create` girdisi `{ title, videoUrl, productContentIds }`.
-->
