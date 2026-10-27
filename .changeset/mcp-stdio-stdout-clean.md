---
"@ifc-lite/mcp": patch
---

The stdio server no longer writes the geometry engine's `[IFC-LITE] ...` log lines to stdout, where a client that parses stdout strictly could fail on them. `console.log`, `console.info` and `console.debug` now go to stderr once the stdio transport owns the process's stdout, so both `ifc-lite-mcp` and `ifc-lite mcp` are covered and the text stays available on stderr. The HTTP transport is unchanged.
