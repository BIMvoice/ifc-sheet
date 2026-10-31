---
"@bimvoice/ifcsheet": patch
---

The Wall and `ifcsheet build` lay a model out on the same paper and at the same scale. The building's elements now come from one function (`buildingElementIds`) that both read, and the Wall no longer starts a set before the model's data store is in, when only the box of everything (site and ground included) can be measured: FZK-Haus came out on A2 in the app and A3 on the command line, IfcOpenHouse at 1:100 against 1:50.
