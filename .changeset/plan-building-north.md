---
"@bimvoice/ifcsheet": minor
"@ifc-lite/mcp": minor
---

A plan the engine makes is drawn square to the building (Revit's project north): its drawing is turned by the IfcSite's rotation, so walls a site turns 48 degrees run along the sheet's axes, and the north arrow turns with it to point to real north. A plan view carries `orientation: 'building' | 'true-north'`; a plan saved without it is read as true north and draws exactly as before. A rotation within half a degree of a quarter turn counts as none, so a building already square to the world does not move. Site plans, elevations and sections stay on the world's axes.
