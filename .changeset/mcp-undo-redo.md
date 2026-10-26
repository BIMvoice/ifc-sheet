---
"@ifc-lite/mcp": minor
---

Add `ifcsheet_undo` and `ifcsheet_redo`: every edit made to a drawing set by `ifcsheet_add_view`, `ifcsheet_place_view`, `ifcsheet_set_title_block`, `ifcsheet_add_schedule` or `ifcsheet_renumber` can be taken back, the last 50 per set. Dry runs are not in the history and a new edit clears redo.
