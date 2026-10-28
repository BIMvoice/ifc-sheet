---
"@ifc-lite/mcp": patch
---

The project file schema lists `underlays`, the raster underlays placed under views, and `ifcsheet_load_project` reads them with the engine's own reader: an underlay with no point or no scale is refused with its path instead of failing at export.
