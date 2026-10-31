---
"@bimvoice/ifcsheet": patch
---

A starter set draws all views of one kind at one scale: plans, elevations and sections each take the most detailed scale at which every view of the kind fits its sheet, so a building's north and south elevations no longer print at a different scale from its east and west ones (Closes #634). Saved sets and sheets whose scale somebody chose are not laid out again.
