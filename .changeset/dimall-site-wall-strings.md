---
"@bimvoice/ifcsheet": patch
---

DIMALL no longer stands a dimension string across a wall apart from the building, such as a site wall round the plot (#642). A string that would cross one moves out beyond it, 8 mm on paper clear of its far face, and the strings after it stack from there. A wall it could not clear within 30 mm on paper (one running out from the facade) leaves the string out, counted with the strings DIMALL reports as left out.
