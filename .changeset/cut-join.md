---
"@ifc-lite/viewer": minor
---

2D views join like cut faces where they meet: walls with walls, slabs with slabs, each of one material, so no line is drawn at a wall's corner, T or end-to-end joint. The cut faces become their union and the cut lines are trimmed to it (the drafting view, sheets and exports alike), the joined elements' own projected edges under the cut are hidden, and a click still picks the one element under it. On by default; a view turns it off from its card. Also: a section and its plan symbol are now reconciled only when one of them changed, so an unrelated edit no longer moves a symbol's labels.
