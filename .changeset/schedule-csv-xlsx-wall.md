---
"@ifc-lite/viewer": minor
---

Every schedule on the Wall (joinery, material takeoff, room finishes, quantities by type, urban indicators, drawing register) exports to CSV and XLSX from its viewport card and from the drawer's list. One writer per format reads the table the sheet draws, so the file has the same rows, order, numbering, text rows, sub-report part and row choice. Text cells pass the formula guard; figures stay plain numbers (numeric cells in XLSX). The CSV is UTF-8 with a byte order mark and uses `;` between columns when the interface language writes a decimal comma (Romanian), `,` otherwise.
