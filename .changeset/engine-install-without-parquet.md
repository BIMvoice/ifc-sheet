---
"@bimvoice/ifcsheet": patch
"@ifc-lite/export": patch
---

Installing the engine no longer fetches `apache-arrow` and `parquet-wasm`: only the Parquet export loads them, so they are optional peer dependencies now, and the install is 115 MB instead of 143 MB. Whoever writes Parquet installs both (`npm install apache-arrow parquet-wasm`); without them the export fails with that command.
