---
"@bimvoice/ifcsheet": minor
---

A text or a label can be framed in a circle or a hexagon (#924), and a label type can give a door's and a window's labels their own frame (`LabelSpec.classFrames`, keyed `IfcDoor` and `IfcWindow`; `labelFrameOf`, `framedClassOf`, `FRAMED_CLASSES`). The engine's TAGALL and `ifcsheet build --project` read it from the project, and the sheet the PDF, SVG and DXF are written from draws the circle round the text and the hexagon as one closed six-sided outline. A type that never chose keeps drawing its box.
