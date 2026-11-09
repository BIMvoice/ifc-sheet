/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Where a line sample falls in the hidden-line raster, and where a line meets its own element's surface there. */

import type { DrawingLine, Point2D } from './types.js';
import { ownerKey, type DepthRaster } from './hidden-line-raster.js';

/** The pixel `rasterPixel` found last: column, row. */
export const PIXEL = new Int32Array(2);

/**
 * Put the pixel of `point` in `PIXEL`; false when the point is outside the raster. A sample outside the raster bounds
 * has no occluder information: the raster only covers where occluders rasterized (plus margin), so had it extended
 * here the pixels would read Infinity (visible). Clamping onto a border pixel instead can wrongly HIDE a line far from
 * any occluder, e.g. when a straddling occluder's self-computed bounds collapse to a sliver of in-window vertices.
 * Visible is the only safe default: it can at worst under-hide, never erase real geometry.
 */
export function rasterPixel(raster: DepthRaster, point: Point2D): boolean {
  const { bounds, width, height } = raster;
  if (point.x < bounds.min.x || point.x > bounds.max.x || point.y < bounds.min.y || point.y > bounds.max.y) return false;
  const px = ((point.x - bounds.min.x) / (bounds.max.x - bounds.min.x)) * (width - 1);
  const py = ((point.y - bounds.min.y) / (bounds.max.y - bounds.min.y)) * (height - 1);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
  // Clamp to guard the floating-point edge at bounds.max. A pixel holds the depth at its centre, half a pixel past its
  // corner, so the last column and row are centred outside the bounds and nothing inside them ever fills them: a point
  // on the far edge reads the pixel before (Refs #557, a purlin ending at the verge of FZK's roof showed through).
  PIXEL[0] = Math.max(0, Math.min(width - 2, Math.floor(px)));
  PIXEL[1] = Math.max(0, Math.min(height - 2, Math.floor(py)));
  return true;
}

/**
 * Whether a pixel next to (`ix`, `iy`) shows the line's own element (`owner`) at the line's depth (within `depthBias`): the
 * line is then on the edge of its own surface where that surface is seen, even though its own pixel is covered by something
 * in front. A gable wall's top edge lies on the bottom of the edge-on verge of its roof; a point sample landed in a verge
 * pixel about half the time and the edge printed as dashes along the roof of an elevation. A neighbour that is merely
 * deeper does not count: above a wall top tucked under a roof that slopes away from the viewer every pixel is deeper than
 * the wall, and the wall top stays hidden. Nor does another element's surface at the same depth: the top of a wall under a
 * cut wall is level with the floor beside it, and with any surface counting its edge was drawn along every cut wall's foot.
 */
export function ownSurfaceBeside(raster: DepthRaster, ix: number, iy: number, lineDepth: number, owner: number, depthBias: number): boolean {
  const { buffer, owners, width, height } = raster;
  for (let y = Math.max(0, iy - 1); y <= Math.min(height - 1, iy + 1); y++) {
    for (let x = Math.max(0, ix - 1); x <= Math.min(width - 1, ix + 1); x++) {
      const i = y * width + x;
      if (owners[i] === owner && Math.abs(buffer[i] - lineDepth) <= depthBias) return true;
    }
  }
  return false;
}

/**
 * Whether one of `samples + 1` even samples along `line` is covered at its raw depth while its own element shows in
 * the pixel or one beside it. Only there can the depth of its own surface (`outline-depth.ts`) change what the line
 * shows: a line covered only by other elements stays hidden however near its own surface is, so the generator skips
 * reading that depth for it (#557: a large model's thin rails and pipes, each a few pixels, cost a third more time).
 */
export function hiddenByItself(raster: DepthRaster, line: DrawingLine, samples: number, depthBias: number): boolean {
  const { buffer, owners, width, height } = raster;
  const owner = ownerKey(line.entityId, line.modelIndex ?? 0);
  const { start, end } = line.line;
  const d0 = line.depth, d1 = line.depthEnd ?? line.depth;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    if (!rasterPixel(raster, i === samples ? end : { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t })) continue;
    const ix = PIXEL[0], iy = PIXEL[1];
    if (d0 + (d1 - d0) * t <= buffer[iy * width + ix] + depthBias) continue;
    for (let y = Math.max(0, iy - 1); y <= Math.min(height - 1, iy + 1); y++) {
      for (let x = Math.max(0, ix - 1); x <= Math.min(width - 1, ix + 1); x++) if (owners[y * width + x] === owner) return true;
    }
  }
  return false;
}
