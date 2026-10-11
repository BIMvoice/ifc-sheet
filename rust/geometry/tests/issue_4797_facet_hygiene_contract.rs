// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Regression contract for #4797: the ordinary element router owns two source-
//! triangle cleanup choke points.
//!
//! This deliberately does not claim that every `facet_weld` caller receives a
//! clean mesh. Boolean cuts create new candidates, and `clean_degenerate`
//! removes indices without compacting positions. The cut path therefore keeps
//! its separate cleanup and topology audit.

use ifc_lite_core::EntityDecoder;
use ifc_lite_geometry::GeometryRouter;

const SOURCE: &str = r#"
#1=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.),(0.,1.,0.),(0.,0.,1.),(1.,0.,1.),(0.5,0.00001,1.)));
#2=IFCTRIANGULATEDFACESET(#1,$,.F.,((1,2,3),(4,5,6)),$);
#3=IFCSHAPEREPRESENTATION($,'Body','Tessellation',(#2));
#4=IFCPRODUCTDEFINITIONSHAPE($,$,(#3));
#5=IFCWALL('issue-4797',$,$,$,$,$,#4,$);
"#;

fn assert_valid_face_survives(mesh: &ifc_lite_geometry::Mesh, path: &str) {
    assert_eq!(mesh.indices.len(), 3, "{path} kept the wrong face count");
    let indexed: Vec<[f32; 3]> = mesh
        .indices
        .iter()
        .map(|&index| {
            let base = index as usize * 3;
            [
                mesh.positions[base],
                mesh.positions[base + 1],
                mesh.positions[base + 2],
            ]
        })
        .collect();
    assert_eq!(
        indexed,
        [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        "{path} must retain the authored ordinary triangle"
    );
}

#[test]
fn issue_4797_router_cleanup_choke_points_remove_source_sliver() {
    // Prove the real representation-item processor emits both authored faces.
    // The second is finite and nonzero-area, but its 10 µm height is below the
    // exact-kernel reconcile grid and is therefore router-level hygiene work.
    let mut item_decoder = EntityDecoder::new(SOURCE);
    let item = item_decoder.decode_by_id(2).expect("decode face set");
    let item_mesh = GeometryRouter::new()
        .process_representation_item(&item, &mut item_decoder)
        .expect("process face set");
    assert_eq!(
        item_mesh.indices.len(),
        6,
        "tessellation must emit both faces"
    );
    assert!(item_mesh.positions.iter().all(|value| value.is_finite()));

    let mut cleanup_probe = item_mesh.clone();
    cleanup_probe.clean_degenerate();
    assert_valid_face_survives(&cleanup_probe, "cleanup probe");
    assert_eq!(
        cleanup_probe.positions.len(),
        item_mesh.positions.len(),
        "cleanup is index-only; facet passes may still see orphan positions"
    );

    // Fresh router/decoder instances keep the two public element paths
    // independent. Removing either cleanup choke point makes its assertion fail.
    let mut merged_decoder = EntityDecoder::new(SOURCE);
    let merged_element = merged_decoder.decode_by_id(5).expect("decode merged wall");
    let merged = GeometryRouter::new()
        .process_element(&merged_element, &mut merged_decoder)
        .expect("process merged element");
    assert_valid_face_survives(&merged, "merged path");

    let mut split_decoder = EntityDecoder::new(SOURCE);
    let split_element = split_decoder.decode_by_id(5).expect("decode split wall");
    let split = GeometryRouter::new()
        .process_element_with_submeshes(&split_element, &mut split_decoder)
        .expect("process element with submeshes");
    assert_eq!(split.sub_meshes.len(), 1);
    assert_valid_face_survives(&split.sub_meshes[0].mesh, "submesh path");
}
