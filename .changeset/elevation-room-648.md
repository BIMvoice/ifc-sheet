---
"@bimvoice/ifcsheet": patch
---

A starter set cuts each facade elevation to the room the layout reserved for it (#648). An elevation is drawn with the ground around the building, so on a model with a wide hill (IfcOpenHouse: 21 m of ground against a 5.8 m building) the two elevations of A-202 each took a box far wider than their share of the sheet, overlapped and ran past the frame. The viewport is now the building at its scale plus a margin, centred on the building in the drawing's own coordinates, as the engine's sheets already clipped it; the ground is cut at the box, the building and the scale are unchanged.
