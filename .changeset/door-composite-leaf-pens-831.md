---
"@bimvoice/ifcsheet": patch
---

A door drawn from its own plan representation takes its pens per segment, not per stroke: when one curve holds both the leaf's line and the swing (Bonsai's composite curve), the leaf's line from the hinge is drawn heavy and the swing thin, in the app, the PDF and the DXF alike (Refs #831).
