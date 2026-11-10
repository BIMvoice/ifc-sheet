---
"@bimvoice/ifcsheet": minor
---

TAGALL is a pure function in the engine: `planTagAll` plans the labels of a plan, section or elevation from plain inputs (the view's elements and rooms, the drafts there, the label types, a `LabelEnv` that reads elements, measures text, styles and numbers new drafts) and returns the labels to add and its messages as translation keys and parameters. The label pieces under it move with it: the leader, template resolution, extras, targets and room-label placement, the tag fields (`@bimvoice/ifcsheet/tag-fields`), the annotation type and `clipLoop`.
