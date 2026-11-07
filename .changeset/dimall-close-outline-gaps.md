---
"@bimvoice/ifcsheet": patch
---

DIMALL closes small gaps in the building outline (a wall that stops short of the next, an open corner, up to the walls' thickness) before it reads the facades, so a string stands outside the building or is counted as left out instead of running through a room (#642).
