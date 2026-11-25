---
"@bimvoice/ifcsheet": patch
---

A door or window that fills an opening in a wall but is contained in no storey (as IfcOpenShell's `feature.add_filling` leaves it) is on its wall's storey: the plan cuts it and draws its symbol, the leaf and swing of a door and the frame and glazing of a window, also in a wall at an angle. It was left out of the building, so the plan showed an empty gap (Refs #831).
