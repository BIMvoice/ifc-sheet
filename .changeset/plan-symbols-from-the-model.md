---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
---

A plan now draws the 2D plan symbol of an element or its type instead of cutting or projecting its 3D body. Bonsai and other tools keep the symbol as a second representation, a `FootPrint` or `Annotation` representation in a `Plan` context with the PLAN_VIEW target view, on the type's representation maps (mapped onto each occurrence) or on the element itself; polylines, indexed poly curves with arcs, circles, ellipses, trimmed curves, composite curves, fill-area outlines and mapped items are read, placed by the element's placement. An element without a symbol still draws its body. The drafting tab, the sheets, the PDF and the DXF, and the headless engine all take their drawing through the same two functions. The view's graphics have a switch, "Use plan symbols from the model" (on by default), that forces the 3D cut when it is off. Not read: trims of other curves, B-splines, swept-area solids, hatching of a fill area, doors and windows (they keep their opening symbols), and symbols of elements moved or created in the session.
