---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

Changing a drawing's scale on a sheet the program laid out now lays the sheet's other drawings out again by the generated set's own rule, as one undo step, so they no longer overlap or leave gaps. A drawing that does not fit the paper at the new scale is laid at the scale that fits, and the sheet says so. A sheet you arranged by hand (a drawing moved, cropped, panned or at another scale) is left alone, and the scale field offers to lay it out again.
