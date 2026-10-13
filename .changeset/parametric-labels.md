---
"@ifc-lite/viewer": minor
---

Parametric labels. A label annotation type holds a template over a model element's data, such as `{Name}`, `{Pset_WallCommon.FireRating}`, `{Qto_WallBaseQuantities.Length:0.00 m}` or `{Type.Name}`, with literal text around the fields, line breaks, a frame (box, rounded, bubble) and a choice of what shows for a missing value. Fields read the element's attributes, property sets, quantity sets, its type's properties, material and storey. The Standards dialog lists the fields the selected element actually has and previews the result. LABEL places the current label type on an element and LABELALL labels every element of a class in the view that does not have it yet. Labels follow their element by GlobalId and update when a property changes or the element is renamed, and they are saved with the project, listed in legends and carried in `.bvlib` libraries.
