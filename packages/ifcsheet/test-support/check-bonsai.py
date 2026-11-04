# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
"""Reads the drawings and sheets of an IfcSheet export the way Bonsai does (#548), as JSON on stdout.

Drawings of every TargetView (PLAN_VIEW, ELEVATION_VIEW, SECTION_VIEW) are listed with the camera's box and its place.

usage: check-bonsai.py <file.ifc> <highest express id of the source>

Each rule below is the one Bonsai's own code applies (v0.8.0), named in its comment, so the answer is what Bonsai would list:
`tool.Drawing.import_drawings`, `get_drawing_target_view`, `get_drawing_group`, `get_drawing_document`, `import_sheets`,
`get_sheet_references`, and the camera's extent from `tool.Loader.create_camera` (width/height/depth of the body's box).
Also validates the file against the schema and reports only the findings on entities the export ADDED.
Run it on a file you exported to check it without Blender:  python3 check-bonsai.py exported.ifc 0
"""
import json
import sys

import ifcopenshell
import ifcopenshell.util.element as element
import ifcopenshell.util.placement as placement
import ifcopenshell.validate as validate

path, highest = sys.argv[1], int(sys.argv[2])
f = ifcopenshell.open(path)
log = validate.json_logger()
validate.validate(f, log, express_rules=True)
new_findings = []
for s in log.statements:
    inst = s.get("instance")
    if inst is not None and hasattr(inst, "id") and inst.id() > highest:
        new_findings.append(str(s.get("message"))[:200])

ifc2x3 = f.schema == "IFC2X3"


def box(drawing):
    """Width, height and depth of the camera body, from its extruded rectangle (the box Bonsai turns into a camera)."""
    for rep in drawing.Representation.Representations:
        for item in rep.Items:
            if item.is_a("IfcExtrudedAreaSolid") and item.SweptArea.is_a("IfcRectangleProfileDef"):
                return [item.SweptArea.XDim, item.SweptArea.YDim, item.Depth, list(item.ExtrudedDirection.DirectionRatios)]
    return None


def frame(drawing):
    """The camera's place in the world as Bonsai's matrix_world: location and local X (right), Y (up) and Z (it looks along -Z)."""
    m = placement.get_local_placement(drawing.ObjectPlacement)
    return {"location": [round(float(v), 4) for v in m[:3, 3]], "x": [round(float(v), 4) for v in m[:3, 0]],
            "y": [round(float(v), 4) for v in m[:3, 1]], "z": [round(float(v), 4) for v in m[:3, 2]]}


drawings = []
# import_drawings: every IfcAnnotation whose ObjectType is DRAWING.
for e in f.by_type("IfcAnnotation"):
    if e.ObjectType != "DRAWING":
        continue
    pset = element.get_psets(e).get("EPset_Drawing", {})
    group = None
    for rel in e.HasAssignments or []:
        if rel.is_a("IfcRelAssignsToGroup") and rel.RelatingGroup.ObjectType == "DRAWING":
            group = rel.RelatingGroup
    members = []
    parent = None
    if group is not None:
        members = [m.Name for rel in group.IsGroupedBy or [] for m in rel.RelatedObjects if m != e]
        parent = [r.RelatingGroup.Name for r in group.HasAssignments or [] if r.is_a("IfcRelAssignsToGroup")]
    document = None
    for rel in e.HasAssociations or []:
        if rel.is_a("IfcRelAssociatesDocument"):
            document = rel.RelatingDocument
    info = document.ReferencedDocument if document is not None and not ifc2x3 else None
    drawings.append({
        "name": e.Name,
        "target_view": pset.get("TargetView", "MODEL_VIEW"),
        "scale": pset.get("Scale"),
        "human_scale": pset.get("HumanScale"),
        "flags": [pset.get(k) for k in ("HasUnderlay", "HasLinework", "HasAnnotation", "GlobalReferencing")],
        "group": group.Name if group is not None else None,
        "group_parents": parent,
        "grouped": members,
        "location": document.Location if document is not None else None,
        "document_scope": info.Scope if info is not None else None,
        "camera": box(e),
        "camera_frame": frame(e),
        "context": e.Representation.Representations[0].ContextOfItems.ContextType if e.Representation else None,
    })

sheets = []
# import_sheets: every IfcDocumentInformation whose Scope is SHEET; its references list what is on it.
for d in f.by_type("IfcDocumentInformation"):
    if d.Scope != "SHEET":
        continue
    refs = [(r.Description, r.Location, r.Identification) for r in d.HasDocumentReferences or []]
    # get_sheet_references: a drawing is on the sheet when a reference of the sheet has the drawing's own Location.
    on_sheet = [x["name"] for x in drawings if x["location"] in [loc for desc, loc, _ in refs if desc == "DRAWING"]]
    sheets.append({"identification": d.Identification, "name": d.Name, "references": refs, "drawings": on_sheet,
                   "project": [p.is_a() for rel in d.DocumentInfoForObjects or [] for p in rel.RelatedObjects]})

plans = [a.Name for a in f.by_type("IfcAnnotation") if a.ObjectType == "IfcSheet:PlanAnnotations"]
print(json.dumps({"schema": f.schema, "new_findings": new_findings, "drawings": drawings, "sheets": sheets, "plan_annotations": plans}))
