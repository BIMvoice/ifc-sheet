---
"@bimvoice/ifcsheet": patch
"@ifc-lite/viewer": patch
---

The sheets that `ifcsheet build` draws cut elevations and sections as the app does: hidden edges classified and the Rust outline of non-extruded geometry, so their projection lines match the app on roofs and other non-box geometry (#627).
