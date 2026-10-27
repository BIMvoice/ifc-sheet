---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

A door or window whose IFC states no OverallWidth or OverallHeight (a non-parametric window, as many Bonsai exports are) is no longer listed as 0 × 0 in the door and window schedule. Its width and height are measured from its geometry, in the element's own frame (the horizontal rectangle of least area around its body, so a window turned in the plan measures as one along an axis), and printed marked as measured (`≈ 1200 × 1500`); the viewport card says so. The engine measures the same way (`measureElementSize`, `joineryScheduleData` given `meshesOf`), and the element views are cut in the same frame. Every cell of the schedule can now be typed over from the sheet as a last resort, the sizes, the total and the count of each level included, with the same editor-only marker and "Reset to model value" as the other cells; a typed size or count reads as figures in the CSV and the XLSX when it is a number. The overrides are kept with the project and printed by the engine too.
