/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The area a detail will show once a crop grip is let go, outlined while it is dragged. */

import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { moveDetailGrip } from '@/drafting/detail-mark';
import type { Grip } from '@/drafting/grips';
import type { Pt } from '@/drafting/types';

export function DetailCropPreview({ gripDrag, t, axis }: {
  gripDrag: { grip: Grip & { detail: NonNullable<Grip['detail']> }; at: Pt };
  t: ViewTransform;
  axis: SectionAxisName;
}) {
  const rect = moveDetailGrip(gripDrag.grip.detail.rect, gripDrag.grip.key, gripDrag.at);
  if (!rect) return null;
  const corners = [rect.min, { x: rect.max.x, y: rect.min.y }, rect.max, { x: rect.min.x, y: rect.max.y }].map((p) => drawingToScreen(p, t, axis));
  return (
    <polygon pointerEvents="none" points={corners.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="6 4" />
  );
}
