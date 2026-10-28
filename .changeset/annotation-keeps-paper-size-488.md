---
"@ifc-lite/viewer": patch
---

Changing a viewport's scale no longer makes the text and dimension text drawn on its view grow: their stored sizes follow the new scale, so they keep the paper height they were drawn at on the sheet, in the PDF and in the DXF.
