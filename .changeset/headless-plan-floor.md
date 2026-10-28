---
"@bimvoice/ifcsheet": patch
---

The CLI and the headless engine now cut each plan at its storey's floor in the meshes' frame, as the web app does. A model that keeps its height in the site placement (IfcSite.RefElevation 131.2 m in the Skolebygg sample) used to get every plan cut 130 m below the building, so each plan sheet came out empty.
