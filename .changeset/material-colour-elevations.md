---
"@bimvoice/ifcsheet": minor
"@ifc-lite/mcp": patch
---

A building material whose Fill is set to "IFC colour" (or to a colour of its own) now colours the drawing: an elevation or section paints every visible face in its material's colour, nearest face on top, and a section's cut bands show each layer's colour. Materials with no Fill set draw as before, and a project that sets none is unchanged. The headless build and the MCP draw tool read the project's materials for the elevation and section faces. The PDF fills them with a hairline seam, the DXF keeps the lines only. Faces of the terrain and of type objects are no longer painted, and a very large model no longer overflows the stack when its faces are placed on the sheet.
