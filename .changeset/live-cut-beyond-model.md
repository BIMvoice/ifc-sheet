---
"@ifc-lite/viewer": patch
---

The floor-plan command and the Section bar's storey menu now place the live cut at the storey's real plan-cut height even when it stands above or below the model, so on the top storey the 3D view shows nothing cut, like the sheet plan, instead of cutting through the top slab. The Section slider widens to include such a plane and still clamps a drag to that span, and reopening the Section tool or an alignment station keeps the plane where it was.
