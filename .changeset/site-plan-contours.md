---
"@bimvoice/ifcsheet": minor
"@ifc-lite/viewer": minor
---

A terrain TIN (a LandXML surface, an IfcGeographicElement) on a site plan is drawn as contour lines at the view's contour interval (0.5 m unless the view says otherwise, 0 for none), every fifth one heavier, instead of one mesh cut at the plan's height. The app's sheets and drafting view, the PDF and DXF exports and `ifcsheet build` draw the same contours (`withContours`, `contourLines`).
