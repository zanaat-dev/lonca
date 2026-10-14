---
'@lonca/hepsiburada': patch
---

`productUpdates.getUpdateStatus()` and `catalog.getTrackingIdHistory()` now read rows from the `data` array of Hepsiburada's response envelope (`{ success, code, message, data: [...] }`). Both used to look only for a bare array, `rows` or `items`, so for a response in the documented shape `getUpdateStatus()` left `rows` unset (the rows were only on `raw`) and `getTrackingIdHistory()` returned an empty list.

<!-- tr
`productUpdates.getUpdateStatus()` ve `catalog.getTrackingIdHistory()` artık satırları Hepsiburada yanıt zarfının `data` dizisinden okuyor (`{ success, code, message, data: [...] }`). İkisi de yalnızca düz diziye, `rows` ya da `items` alanına bakıyordu; bu yüzden dokümandaki biçimde gelen bir yanıtta `getUpdateStatus()` `rows` alanını boş bırakıyor (satırlar yalnızca `raw` içindeydi), `getTrackingIdHistory()` ise hep boş liste dönüyordu.
-->
