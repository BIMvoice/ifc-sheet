---
"@bimvoice/ifcsheet": patch
"@ifc-lite/mcp": patch
---

The printed drawing set follows the app's sheet more closely (#479). A viewport's drafted texts are clipped to its box, as its lines are; a schedule's title, header and totals print in bold, and in the project's "Tables" text style (serif, mono or italic) when it has one; and the MCP export of a loaded project words its figures and "continued" in the project's recorded language, as `ifcsheet build --project` does, instead of always English.
