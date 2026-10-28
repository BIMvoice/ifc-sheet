---
"@ifc-lite/viewer": patch
---

Undo: the drawing set built when a model opens is the start of the history, so Ctrl+Z at the bottom no longer removes it and sends the Wall back to the intro. Adding, deleting, scaling and resizing a drawing, a schedule's scale, the paper, and the title block fields are each one undo step.
