---
'@bimvoice/ifcsheet': minor
---

The headless build draws the door and window symbols of elevations and sections as the app does: the opening lines of a door that states its operation, and a configured or mapped type's frame, panels, opening lines, glazing bars, arched head and transom row, over the drawing (`elevationOpeningSymbols`, `viewOpeningSymbols`, `typedElevationSymbol`, `statedDoorElevationSymbol`), on the same `SYMBOLS` pens as a plan's. The project's opening-line convention (`openingLines`) is read from the project file and from `--standard`. A section on a custom plane has no symbols, in the app or here.
