---
"@ifc-lite/viewer": patch
---

Ceiling tags follow the language like the other sheet numbers: CEILTAG writes the height as "+2,70" in Română and "+2.70" in English through `sheetLevel`, and a tag already on the sheet is re-written when the language changes. A tag made before this release keeps its text until CEILTAG is run again on a new tag.
