---
"@bimvoice/ifcsheet": minor
---

The style book with its defaults, the paper unit of a view or sheet, and the style a new annotation takes (`styleBookOf`, `paperUnitFor`, `isSizedShape`, `styledParamsIn`) are now engine functions that take the styles and the views as input, so planners no longer need the project store (Refs #707).
