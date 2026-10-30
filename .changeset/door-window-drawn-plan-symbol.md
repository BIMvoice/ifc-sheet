---
"@bimvoice/ifcsheet": minor
---

A door or window type's plan symbol can be drawn in IfcSheet. `blockFromDrafts` turns what the drafting tools made (lines, polylines, circles, arcs; a closed shape closed, a dashed layer dashed) into the same `planBlock` a DXF import keeps, `blockAsShapes` opens a block for editing again and `symbolCanvas` sizes the canvas to the opening. Plans, sheets, the PDF and the headless build draw a drawn symbol through the existing block path, mirrored for a right-hand type. Entries without a block draw as before.
