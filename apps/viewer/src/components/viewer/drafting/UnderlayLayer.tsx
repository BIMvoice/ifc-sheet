/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The PDF pages and images under a view, to trace over (#457): drawn over the generated drawing, multiplied into it so
 * the drawing's lines stay on top, and never taking a click (the tools draw through it). Placed with the same
 * transform the drawing and the drafted lines use, so a line drawn on a corner of the scan is on that corner at every zoom.
 * The DXF underlays' lines (#547) are drawn the same way, layer by layer, the layers that are on.
 */

import { memo } from 'react';
import { dxfUnderlayRuns, dxfUnderlaysOfView } from '@bimvoice/ifcsheet/underlay';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { useProjectStore } from '@/project/project-store';
import { matrixText, underlayMatrix, underlaysOfView } from '@/underlay/underlay';

export { useSnapReferences } from './useSnapReferences';

interface Props {
  viewId: string;
  transform: ViewTransform;
  axis: SectionAxisName;
}

export const UnderlayLayer = memo(function UnderlayLayer({ viewId, transform, axis }: Props) {
  const all = useProjectStore((s) => s.underlays);
  const dxf = useProjectStore((s) => s.dxfUnderlays);
  const underlays = underlaysOfView(all, viewId).filter((u) => u.opacity > 0);
  const dxfs = dxfUnderlaysOfView(dxf, viewId).filter((u) => u.opacity > 0);
  if (underlays.length === 0 && dxfs.length === 0) return null;
  return (
    <div data-underlay-layer className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {underlays.map((u) => (
        <img
          key={u.id}
          data-underlay-id={u.id}
          src={u.href}
          alt=""
          draggable={false}
          style={{ position: 'absolute', left: 0, top: 0, width: u.widthPx, height: u.heightPx, maxWidth: 'none', transformOrigin: '0 0', transform: matrixText(underlayMatrix(u, transform, axis)), opacity: u.opacity, mixBlendMode: 'multiply' }}
        />
      ))}
      {dxfs.map((u) => (
        <svg key={u.id} data-dxf-underlay-id={u.id} className="absolute inset-0 h-full w-full" style={{ opacity: u.opacity }}>
          {dxfUnderlayRuns(u).map((run, i) => (
            <polyline key={i} data-dxf-layer={run.layer} fill="none" stroke={run.colour} strokeWidth={1} vectorEffect="non-scaling-stroke" points={run.points.map((p) => { const s = drawingToScreen(p, transform, axis); return `${s.x},${s.y}`; }).join(' ')} />
          ))}
        </svg>
      ))}
    </div>
  );
});
