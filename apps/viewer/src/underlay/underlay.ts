/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A page of a scanned PDF, or an image, laid under a view to trace over (#457). Pure data and geometry; the
 * project field is `fields/underlays.ts`, the commands are `underlay-actions.ts`, the picture is drawn by
 * `UnderlayLayer.tsx` (on screen) and `SheetPaper.tsx` (on a sheet).
 *
 * The bitmap is stored in the project as a data URL, like the title block's logo, already reduced to
 * `UNDERLAY_MAX_BYTES` (`underlay-import.ts`). Its place is in the view's drawing coordinates (metres): `at` is
 * where the picture's centre lies, `mPerPx` how many metres one pixel is, `rotation` the turn in radians
 * counter-clockwise in drawing space. A PDF page starts at its paper size (1:1), a picture at 96 dpi; the
 * person then sets the scale from a distance they know (`scaleByTwoPoints`).
 */

import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import type { Pt } from '@/drafting/types';
import { underlayMatrix as sharedUnderlayMatrix, type UnderlayMatrix, type ViewUnderlay } from '@bimvoice/ifcsheet/underlay';

// The data, the picture-to-plane geometry, the choice of sheets and the DXF note are the engine's (`packages/ifcsheet/src/underlay.ts`), so a headless build prints the same.
export {
  UNDERLAY_MAX_BYTES, drawingToPixel, isUnderlayHref, matrixText, omittedUnderlayViewNames, pixelToDrawing, printedUnderlays, printsOnSheet, underlaysOfView,
  type UnderlayMatrix, type ViewUnderlay,
} from '@bimvoice/ifcsheet/underlay';
import { drawingToPixel, pixelToDrawing } from '@bimvoice/ifcsheet/underlay';

/** The longest side, in pixels, an underlay is rendered or reduced to first. */
export const UNDERLAY_MAX_SIDE_PX = 3000;
/** The shortest side the reduction goes down to before the import is refused. */
export const UNDERLAY_MIN_SIDE_PX = 800;

/**
 * The affine map [a, b, c, d, e, f] (the SVG / CSS `matrix`) from the picture's pixels to the plane it is drawn
 * on: a screen or a sheet's paper, as `transform` takes drawing points there. Right for every view axis, since
 * it goes through `drawingToScreen`.
 */
export function underlayMatrix(u: ViewUnderlay, transform: ViewTransform, axis: SectionAxisName): UnderlayMatrix {
  return sharedUnderlayMatrix(u, (p) => drawingToScreen(p, transform, axis));
}

/**
 * The underlay scaled so that two points picked on the picture are `distance` metres apart, the first staying
 * where it is. Null when the points coincide or the distance is not a positive number.
 */
export function scaleByTwoPoints(u: ViewUnderlay, a: Pt, b: Pt, distance: number): ViewUnderlay | null {
  if (!(distance > 0) || !Number.isFinite(distance)) return null;
  const pa = drawingToPixel(u, a);
  const pb = drawingToPixel(u, b);
  const px = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  if (!(px > 1e-9)) return null;
  const scaled = { ...u, mPerPx: distance / px };
  // Keep `a` fixed: the picture's pixel `pa` must land on `a` again.
  const now = pixelToDrawing(scaled, pa);
  return { ...scaled, at: { x: u.at.x + (a.x - now.x), y: u.at.y + (a.y - now.y) } };
}

/**
 * The next side length to try when a render is over the byte cap: three quarters of the last, or null when that
 * would go below `UNDERLAY_MIN_SIDE_PX` (the import is then refused rather than stored unreadable).
 */
export function reducedSide(side: number): number | null {
  const next = Math.floor(side * 0.75);
  return next >= UNDERLAY_MIN_SIDE_PX ? next : null;
}
