---
"@ifc-lite/mcp": patch
---

The `ifcsheet_*` MCP tools register through one `toolGroup` per file instead of a shared array. The tool list a client sees is unchanged and keeps its order.
