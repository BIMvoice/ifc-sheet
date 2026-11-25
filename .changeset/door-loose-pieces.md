---
"@bimvoice/ifcsheet": patch
---

A door modelled as several IfcDoors that no wall hosts (a lift door as its leaf set, panels and jamb posts) draws one symbol on a plan, not one per piece. The doors hosted in nothing whose footprints touch form a group; its door is the one the others are parts of (IfcRelAggregates, IfcRelNests), else the only one stating OverallWidth or OverallHeight, else the one tall enough to pass through whose width spans the group. The two leaves of a double door, each half the width, are both kept. New export `doorStatedOf` reads what a model states of a door for this.
