---
"@ifc-lite/viewer": patch
---

The Romanian title block no longer loses part of a long value. A value longer than its cell wraps to two lines inside the cell, then shrinks step by step down to 2 mm, and only when even that does not hold it is it cut with an ellipsis and reported as a readiness finding naming the cell and the sheet. The app and the PDF share one fitting rule, so they wrap alike. The middle column's name and professional-title cells are wider, the signature boxes keep 20 mm.
