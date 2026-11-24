---
"@bimvoice/ifcsheet": minor
---

A label type may keep a gap of its own round its labels (#842): `LabelSpec.gap`, paper millimetres from 0 to `LABEL_GAP_MAX_MM` (20), is the clear space its labels keep from their element, from each other and from what they avoid, in the layout LABELALL uses (`LayoutScene.gapMm`) and in TAGALL's door and window marks and room tags. Absent, a label keeps today's spacing (`LABEL_GAP_MM` from its element, `LABEL_CLEAR_MM` from the rest). `readLabelSpec` is the one reader of a stored label for the app and the engine, and `ifcsheet build --project --annotate` now runs TAGALL with the project's own mark and room types.
