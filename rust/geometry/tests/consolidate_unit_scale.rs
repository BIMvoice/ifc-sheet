// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! #4744: Boolean operands are consolidated in file units, before router scaling.
//! The same physical opening must meet the same ring-width gate in m and mm.

use ifc_lite_core::{build_entity_index, EntityDecoder};
use ifc_lite_geometry::{GeometryRouter, Mesh};
use nalgebra::Vector3;

fn cut_wall(unit_scale: f64, opening_width: f64, opening_height: f64) -> Mesh {
    let prefix = if unit_scale == 1.0 { "$" } else { ".MILLI." };
    let u = |metres: f64| metres / unit_scale;
    let content = format!(
        "ISO-10303-21; HEADER; FILE_SCHEMA(('IFC4')); ENDSEC; DATA;
#1=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#3,$);
#2=IFCCARTESIANPOINT((0.,0.,0.));
#3=IFCAXIS2PLACEMENT3D(#2,$,$);
#100=IFCPROJECT('0000000000000000000001',$,'Unit test',$,$,$,$,(#1),#101);
#101=IFCUNITASSIGNMENT((#102));
#102=IFCSIUNIT(*,.LENGTHUNIT.,{prefix},.METRE.);
#200=IFCBLOCK(#3,{width},{thickness},{height});
#203=IFCAXIS2PLACEMENT3D(#204,$,$);
#204=IFCCARTESIANPOINT(({cx},{cy},{cz}));
#206=IFCBLOCK(#203,{opening_width},{depth},{opening_height});
#207=IFCBOOLEANRESULT(.DIFFERENCE.,#200,#206);
#208=IFCCSGSOLID(#207);
#223=IFCSHAPEREPRESENTATION(#1,'Body','CSG',(#208));
#224=IFCPRODUCTDEFINITIONSHAPE($,$,(#223));
#225=IFCWALL('0000000000000000000002',$,'Wall',$,$,#227,#224,$,.NOTDEFINED.);
#227=IFCLOCALPLACEMENT($,#3);
ENDSEC; END-ISO-10303-21;",
        width = u(20.0),
        thickness = u(0.2),
        height = u(10.0),
        cx = u(10.0 - opening_width / 2.0),
        cy = u(-0.5),
        cz = u(5.0 - opening_height / 2.0),
        depth = u(1.2),
        opening_width = u(opening_width),
        opening_height = u(opening_height),
    );
    let mut decoder = EntityDecoder::with_index(&content, build_entity_index(&content));
    let router = GeometryRouter::with_units(&content, &mut decoder);
    let wall = decoder.decode_by_id(225).expect("decode wall");
    router.process_element(&wall, &mut decoder).expect("mesh Boolean wall")
}

fn front_area(mesh: &Mesh) -> f64 {
    let p = |i: u32| {
        let i = i as usize * 3;
        Vector3::new(
            mesh.positions[i] as f64,
            mesh.positions[i + 1] as f64,
            mesh.positions[i + 2] as f64,
        )
    };
    mesh.indices
        .chunks_exact(3)
        .map(|t| {
            let cross = (p(t[1]) - p(t[0])).cross(&(p(t[2]) - p(t[0])));
            if cross.y < 0.0 && cross.x.abs() < 1e-8 && cross.z.abs() < 1e-8 {
                cross.norm() * 0.5
            } else {
                0.0
            }
        })
        .sum()
}

#[test]
fn boolean_ring_width_is_physical_in_metres_and_millimetres_4744() {
    for unit_scale in [1.0, 0.001] {
        for (width, height, expected) in [(50e-6, 1.0, 200.0), (0.1, 0.1, 199.99)] {
            let actual = front_area(&cut_wall(unit_scale, width, height));
            assert!(
                (actual - expected).abs() < 1e-5,
                "unit scale {unit_scale}, opening {width} x {height} m: \
                 front {actual}, expected {expected} m²"
            );
        }
    }
}
