# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
"""IfcOpenShell's reading of an annotated copy (#82), as JSON on stdout.

usage: check-annotated.py <file.ifc> <highest express id of the source>

Opens the file, validates it against the schema (attribute types, cardinality, WHERE rules) and reports only the findings on
entities the copy ADDED (an id above the source's highest): a source that already has findings is not the copy's doing.
Also lists each IfcSheet plan annotation with the storey it is contained in, its text literals and its curve count.
"""
import json
import sys

import ifcopenshell
import ifcopenshell.util.element as element
import ifcopenshell.validate as validate

path, highest = sys.argv[1], int(sys.argv[2])
f = ifcopenshell.open(path)
log = validate.json_logger()
validate.validate(f, log, express_rules=True)

def instance_id(statement):
    inst = statement.get("instance")
    return inst.id() if inst is not None and hasattr(inst, "id") else None

new_findings = [str(s.get("message"))[:200] for s in log.statements if (instance_id(s) or 0) > highest]
out = {"schema": f.schema, "total_findings": len(log.statements), "new_findings": new_findings, "annotations": [], "marked": []}
for a in f.by_type("IfcAnnotation"):
    if a.ObjectType != "IfcSheet:PlanAnnotations":
        continue
    storey = [r for r in f.get_inverse(a) if r.is_a("IfcRelContainedInSpatialStructure")][0].RelatingStructure
    items = [i for rep in a.Representation.Representations for i in rep.Items]
    curves = sum(len(i.Elements) for i in items if i.is_a("IfcGeometricCurveSet"))
    out["annotations"].append({
        "name": a.Name, "storey": storey.Name, "storey_class": storey.is_a(),
        "literals": [i.Literal for i in items if i.is_a("IfcTextLiteral")], "curves": curves,
        "pset": element.get_psets(a).get("IfcSheet_Annotation", {}),
    })
for e in f.by_type("IfcElement"):
    pset = element.get_psets(e).get("IfcSheet_Annotation")
    if pset:
        out["marked"].append({"guid": e.GlobalId, "Mark": pset.get("Mark")})
print(json.dumps(out))
