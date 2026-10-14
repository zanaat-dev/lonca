---
'@lonca/hepsiburada': patch
---

`productUpdates.getUpdateStatus()` and `catalog.getTrackingIdHistory()` now read rows from the `data` array of Hepsiburada's response envelope (`{ success, code, message, data: [...] }`). Both used to look only for a bare array, `rows` or `items`, so for a response in the documented shape `getUpdateStatus()` left `rows` unset (the rows were only on `raw`) and `getTrackingIdHistory()` returned an empty list.
