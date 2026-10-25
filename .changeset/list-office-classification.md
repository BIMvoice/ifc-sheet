---
"@ifc-lite/viewer": minor
"@bimvoice/ifcsheet": minor
"@ifc-lite/lists": minor
---

Custom (list) schedules: a column for the office classification code (#351). The builder offers "Classification code" and "Classification title" columns, resolved by `classificationOf` with the project's classification mapping (the first, or the one the column names), so a list, the quantities by type, tags and the command line agree; the model's own IfcClassificationReference still wins. Both columns can be grouped and are written to the CSV and XLSX. The Lists engine gains the column source `officeClassification` and the optional provider accessor `getOfficeClassification(expressId, mappingId?)`; `withOfficeClassification` in `@bimvoice/ifcsheet` makes it for any provider.
