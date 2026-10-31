---
"@bimvoice/ifcsheet": patch
---

A door or window carries one mark on the plan and in the schedule (#631). `elementMark` gives it: the user's typed mark of its type, else the element's own IFC Tag, else the mark the schedule gives its type (D1, W1), and never its Name or a class word. The schedule's Mark cell lists each mark the elements of a type are found under (`D01, D02` for two doors of one type with different Tags); its counts do not change.
