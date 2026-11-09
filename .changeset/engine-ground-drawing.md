---
"@bimvoice/ifcsheet": minor
---

A section and a facade elevation that `ifcsheet build`, the MCP tools and the headless API make now draw the ground the way the app does: the terrain cut in an earth tone in a section, and one heavy ground line in an elevation. Since the terrain was left out of the building (#683) they showed no ground at all. `generateViewDrawings` takes the terrain meshes as a last argument (`terrainMeshesOf` finds them), and `drawingWithGround` (with `EARTH_TONE` and `GROUND_OVERHANG_M`) moved here from the app, so both draw one ground.
