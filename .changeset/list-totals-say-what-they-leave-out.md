---
'@bimvoice/ifcsheet': minor
---

A list schedule whose total leaves rows out (they state no quantity) now says so, like the bill of quantities does: a line under the table ("The total of NetVolume (m³) leaves out 5 of 18 rows with no value", also in Romanian), in the sheet, `ifcsheet list` (text, CSV, JSON as `missing` and `notes`). The rooms schedule sums areas through `SumTally`, the one rule for a missing quantity; its numbers do not change. The `./cli-*` subpaths of the package have a pinned export surface (`cli-exports.snapshot.json`). `ListScheduleTable` has `missing` and `notes`; `ListSourceWords` has `missing`; new type export `ListMissing`.
