---
"@ifc-lite/create": minor
"@bimvoice/ifcsheet": minor
---

A door or window type can take a DXF block as its plan symbol. The catalogue entry keeps the block's strokes (`planBlock`), read from a DXF with the existing DXF reader (LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE and inserts of those; units from $INSUNITS, millimetres when the file states none; anything else is counted in a report, not drawn). Plans, sheets and the PDF draw it fitted to the opening width, mirrored for a right-hand type, in place of the generated symbol. Entries without a block draw as before.
