---
"@ifc-lite/mcp": minor
---

`ifcsheet build --project` and the MCP exports print the symbols a project's views carry (#479): the built-in library and the project's own symbols, with the north arrow turned to the model's north, the scale bar laid out for the viewport's scale and the coordinate point printed in the model's local frame. The library, the project-symbol reader and the drawing now live in the engine and the app imports them. A coordinate point on a georeferenced model, a text's frame or leader and a dimension figure moved off its line are still named on stderr.
