---
"@ifc-lite/mcp": minor
---

Hosted Streamable HTTP endpoint (#165): `handleHostedMcp`, a stateless `Request` to `Response` handler serving the `ifcsheet_*` tools, off (404) unless `IFCSHEET_HOSTED_MCP=1`. In hosted mode (`ServerConfig.hosted`) every file path is refused, a model comes in the request, and its size and the request's wall time are capped. `ifcsheet_generate_set` also takes `ifc_base64`, to open and lay out a set in one call.
