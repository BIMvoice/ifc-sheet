---
"@ifc-lite/viewer": patch
---

Opening an IFC file whose IfcProject GlobalId is the one of the model the open project is drawn from now offers to update that project to the new version, so its sheets, views, annotations and settings stay and what changed is listed, instead of starting a new project. Tags and labels of elements the new version moved go with them (#50).
