---
"@ifc-lite/mcp": minor
---

`ifcsheet build --project` and the MCP export tools print the room and area schedule (with its area summary), the bill of quantities and the drawing register where a saved project placed them on its sheets (#479). Their table layouts moved from the app into `packages/ifcsheet`, so a sheet and its PDF draw the same table; the drawing register reads the project's issues and revisions with the app's own readers, and a sheet's title block now prints the revision those records name. Doors and windows, materials, finishes, types and urban indicators are still named on stderr as not printed.

The headings of the rooms schedule and the register follow `--locale` (`ro` or `en`, English when none is given), which `ifcsheet build` now accepts with `--project` as well as `--pac`; a project file saves no language of its own.
