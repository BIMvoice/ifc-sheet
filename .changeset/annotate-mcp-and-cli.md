---
"@bimvoice/ifcsheet": minor
"@ifc-lite/mcp": minor
---

"Annotate the set" from the command line and the MCP server (#707). `ifcsheet build --annotate[=<all|dimension,tag,level|preset>]` drafts the dimension strings, tags and level marks on the views before the PDF and DXFs are written. The new MCP tool `ifcsheet_annotate` does the same on the session's set, with chosen commands, tag kinds and views, one undo step, and says per view what was added and what was left out and why. The engine gains `annotateSetHeadless` (in `@bimvoice/ifcsheet/headless`) and `readAnnotateSpec`.
