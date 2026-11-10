---
"@bimvoice/ifcsheet": minor
---

A new plan is drawn square to the building (Revit's project north), in the engine and the app alike: its drawing is turned by the IfcSite's rotation reduced to a quarter turn, so walls a site turns 48 degrees run along the sheet's axes while north stays within 45 degrees of up, and the north arrow and the elevation marks turn with it. A plan view carries `orientation: 'building' | 'true-north'`; a plan saved without it is read as true north and draws exactly as before. A rotation within half a degree of a quarter turn counts as none, so a building already square to the world does not move. Site plans, elevations and sections stay on the world's axes. `planTurn`, `turnDrawing`, `turnedPlane`, `turnOf`, `withSquareFrame` and the `DrawingPlane` type are exported for the app.
