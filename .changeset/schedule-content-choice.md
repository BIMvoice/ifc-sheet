---
"@ifc-lite/viewer": patch
"@bimvoice/ifcsheet": patch
---

A joinery schedule's content can be chosen on the Wall: which rows it shows and in which order, how its type columns are sorted (mark, size, kind, count) and how types and elements are numbered. The choice is kept on the schedule (`content`), applied by the engine (`applyContent`, `scheduleOf`) so the sheet, the exports and the checks print the same table, and inherited by a schedule's sub-reports. A change of numbering moves the Tag of elements that carried their old mark, so plan tags follow. Writing numbers into the Tag now works in the documentation edition.
