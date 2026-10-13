/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How far the selected section looks: a soft band on its viewing side and one
 * handle on the far edge. While the handle is dragged the band follows it and
 * the depth in metres is written large beside the handle.
 */

import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { depthBandPolygon, depthFromPoint, depthHandle, type SectionCut } from '@/drafting/section-depth';
import type { Grip } from '@/drafting/grips';
import type { Pt } from '@/drafting/types';

export function SectionDepthBand({ band, gripDrag, t, axis }: {
  band: { cut: SectionCut; depth: number };
  gripDrag?: { grip: Grip; at: Pt } | null;
  t: ViewTransform;
  axis: SectionAxisName;
}) {
  const dragging = gripDrag?.grip.key === 'depth' && gripDrag.grip.id === band.cut.id;
  const depth = (dragging ? depthFromPoint(band.cut, gripDrag.at) : null) ?? band.depth;
  const poly = depthBandPolygon(band.cut, depth).map((p) => drawingToScreen(p, t, axis));
  const handleAt = depthHandle(band.cut, depth);
  if (poly.length === 0 || !handleAt) return null;
  const h = drawingToScreen(handleAt, t, axis);
  return (
    <g pointerEvents="none">
      <polygon points={poly.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(37,99,235,0.10)" stroke="#2563eb" strokeWidth={1} strokeDasharray="6 4" />
      <rect x={h.x - 5} y={h.y - 5} width={10} height={10} fill={dragging ? '#2563eb' : '#fff'} stroke="#2563eb" strokeWidth={2} />
      {dragging ? (
        <text x={h.x + 14} y={h.y - 12} fontSize={24} fontWeight={600} fill="#1d4ed8" stroke="#fff" strokeWidth={4} paintOrder="stroke">
          {`${depth.toFixed(2)} m`}
        </text>
      ) : null}
    </g>
  );
}
