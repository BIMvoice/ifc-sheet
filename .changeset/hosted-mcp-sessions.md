---
"@ifc-lite/mcp": minor
---

Hosted MCP: chain tool calls across requests (sessions held by the client). With `IFCSHEET_HOSTED_MCP_SECRET` set, every `ifcsheet_*` tool takes an optional `session_token` and returns a new one: the project (sets and schedules) and a hash reference to each model, signed with HMAC-SHA-256 and valid for an hour. The server stays stateless; the client resends the model as `ifc_base64` (checked against the hash) and the server keeps up to two parsed models per instance by content hash. Tampered, foreign or expired tokens are refused with a clear error; no file access is granted. The endpoint is still off unless `IFCSHEET_HOSTED_MCP=1`.
