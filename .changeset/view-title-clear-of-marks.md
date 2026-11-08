---
"@bimvoice/ifcsheet": patch
---

A view's title no longer prints over the label of an elevation or section mark ("1 / A-201") on the app's sheet, `ifcsheet build`, the PDF and the DXF: `viewTitleLayout` moves the title down under the marks that stand below its drawing, and both the app and the engine place the title by it (#557).
