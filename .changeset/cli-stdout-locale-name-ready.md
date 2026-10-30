---
"@bimvoice/ifcsheet": patch
---

Four `ifcsheet` fixes. `--json` and `--csv` output is the payload alone: the geometry engine's "[IFC-LITE]" log lines now go to stderr while a model is opened (#600). `build --locale ro` prints the standard title block's captions in Romanian (#601). `check` reports a model with nothing to draw as not ready, by the same rule `build` refuses it with (#604). `build --name` is the Project value in the title blocks (#614).
