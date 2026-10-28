---
"@ifc-lite/mcp": minor
---

`project_json`, a project file and `template_json` are held to the size limit a server gives a model (`maxModelBytes`, 25 MB on the hosted endpoint; none on a local server). A larger input is refused with the limit and its size in the message, before it is parsed. `ifcsheet_list` returns `missing` and `notes` when a total leaves rows out.
