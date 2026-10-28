---
"@ifc-lite/viewer": minor
"@ifc-lite/create": minor
---

Export IFC with annotations (#82): a copy of the open IFC, as loaded, with the plans' annotations written into it. One IfcAnnotation per plan, contained in the plan's storey, its lines and leaders as IfcPolyline curves and its text as IfcTextLiteralWithExtent in the file's Annotation / Plan subcontext; an element's mark as the IfcSheet_Annotation property set where the file's own Tag does not already say it. Written in the file's own schema (IFC2X3 or IFC4), appended after the existing entities so nothing existing is renumbered or changed; the opened file is never written. Sections and elevations are named, not written.
