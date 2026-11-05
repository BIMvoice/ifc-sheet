---
"@bimvoice/ifcsheet": minor
---

"Annotate the set" is one function in the engine: `annotateViews` plans TAGALL and DIMALL on every plan and LEVELALL on every elevation and section, in the order the choices say, from the drawing of each view that the caller supplies (the app its open drawings, the CLI the ones `generateViewDrawings` makes), and returns the drafts per view and a summary. `runAnnotateCommand` is one command on one view.
