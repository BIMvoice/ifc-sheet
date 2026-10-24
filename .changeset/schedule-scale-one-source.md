---
"@ifc-lite/viewer": patch
---

Schedules: the scale field on a schedule's card now sets the schedule's own scale, so the layout, the paging and the fit follow it (it only changed the viewport's copy before, which the layout never read). The split offer counts the pages the sheet draws: the schedule's scale and content, its first sheet's box and the element views.
