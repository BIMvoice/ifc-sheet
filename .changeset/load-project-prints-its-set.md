---
"@ifc-lite/mcp": minor
---

`ifcsheet_load_project` reads a project's views, sheets and drafts with the reader the app and `ifcsheet build --project` use (#479), and `ifcsheet_export_pdf`, `ifcsheet_export_dxf` and `ifcsheet_issue_set` print a loaded project's dimensions, texts and drafted lines, and the list schedules the app placed on its sheets, as `ifcsheet build --project` does. A viewport may now show a schedule of the file (the app places schedules that way). A view, sheet or draft the app would refuse the file for is refused here too, with the app's message naming its path (`/views/0.kind must be one of ...`); before, a malformed draft was carried through unread.
