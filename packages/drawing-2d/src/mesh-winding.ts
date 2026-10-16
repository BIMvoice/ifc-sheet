/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Which way a closed mesh is wound: the orientation test the edge extractor applies before it classifies silhouettes. */

/**
 * Scale-relative floor for trusting the signed-volume winding test (issue
 * #2682).
 *
 * The silhouette test is NOT symmetric under a global winding flip: it keeps
 * an edge whose faces differ in "is front-facing", and the deadband lumps
 * perpendicular faces in with back-facing ones. For an outward-wound box in
 * plan that yields the TOP rim (the face pointing at the viewer against the
 * four perpendicular sides); flip the winding and the same test yields the
 * BOTTOM rim instead — the far side of the solid. Both project to the same
 * square, so the defect hides until the far rim falls outside the projection
 * band, at which point the line work is simply GONE (a blank sheet, produced
 * successfully). See `windingSign`.
 *
 * The fix orients the mesh by its signed volume before classifying, which is
 * only meaningful when the volume is decisively non-zero. An open shell or a
 * flat sheet integrates to ~0 and an inconsistently wound mesh to something
 * arbitrary, so the sign is only trusted when |V| clears this fraction of the
 * mesh's bounding-box volume (diagonal³). A closed box sits around 0.19 of
 * that; a 1 mm sheet spanning 4 m sits near 1e-4. 1e-6 is far below any real
 * solid and far above f32 integration noise.
 */
const WINDING_VOLUME_EPSILON = 1e-6;

/**
 * `-1` when the mesh is a closed solid wound INWARD, `+1` otherwise
 * (issue #2682).
 *
 * Six times the enclosed signed volume is `Σ v0 · (v1 × v2)`, positive for
 * outward winding. It is translation-invariant for a closed mesh, so the sum
 * is taken relative to the first vertex to keep the terms small and the
 * cancellation honest on RTC-shifted coordinates.
 *
 * `+1` is the deliberate answer whenever the test is inconclusive — an open
 * shell, a flat sheet, or an inconsistently wound mesh integrates to ~0 (or
 * to an arbitrary number) and gets the pre-existing behaviour rather than a
 * coin-flip reorientation. Positions are read directly rather than through
 * `getVertex` because the per-element `origin` is a pure translation and
 * therefore cannot change the result.
 */
export function windingSign(positions: Float32Array, indices: Uint32Array): 1 | -1 {
  const triangleCount = Math.floor(indices.length / 3);
  if (triangleCount === 0 || positions.length < 3) return 1;

  const rx = positions[indices[0] * 3];
  const ry = positions[indices[0] * 3 + 1];
  const rz = positions[indices[0] * 3 + 2];

  let volume6 = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const track = (x: number, y: number, z: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };

  for (let t = 0; t < triangleCount; t++) {
    const b0 = indices[t * 3] * 3;
    const b1 = indices[t * 3 + 1] * 3;
    const b2 = indices[t * 3 + 2] * 3;

    const ax = positions[b0] - rx, ay = positions[b0 + 1] - ry, az = positions[b0 + 2] - rz;
    const bx = positions[b1] - rx, by = positions[b1 + 1] - ry, bz = positions[b1 + 2] - rz;
    const cx = positions[b2] - rx, cy = positions[b2 + 1] - ry, cz = positions[b2 + 2] - rz;

    // a · (b × c)
    volume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);

    track(ax, ay, az);
    track(bx, by, bz);
    track(cx, cy, cz);
  }

  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
  const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const floor = WINDING_VOLUME_EPSILON * diagonal * diagonal * diagonal;

  return volume6 / 6 < -floor ? -1 : 1;
}
