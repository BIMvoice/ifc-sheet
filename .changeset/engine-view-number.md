---
"@bimvoice/ifcsheet": minor
---

A view's title carries its drawing number in a ring, as the app's sheet does: `ifcsheet build`, the PDF and the DXF print the number at the start of the title on the VIEWPORT-LABELS layer, so the "1 / A-301" of a section or elevation mark names a number that is printed. The title now starts at the left edge of its drawing, as in the app, and `viewTitleLayout` places title and ring for both.
