---
"@bimvoice/ifcsheet": patch
---

An elevation or a section that `ifcsheet build`, the MCP tools and the headless API make now has a viewport frame that holds the ground it draws, the ground line and the earth block, so the frame no longer cuts it. `openModel` puts the terrain's reach on the extent (`ModelExtent.ground`) and `viewExtent` reads it; plans are unchanged.
