---
"@ifc-lite/mcp": minor
---

`ifcsheet build --project` and the MCP exports print more of what the app drew on a project's views (#479): level marks, leaders, radial and angular dimensions, grid axes, hatches (the built-in patterns and the project's own), circles and arcs, drawn by the layout code the app uses. Symbols, a text's frame or leader and a dimension figure moved off its line are still named on stderr. Drafted lines, circles and arcs print with the pen the app draws them with (the element's own colour, weight and line type, and the project's line types), and drafted texts keep their text style: bold, face, italic and colour.
