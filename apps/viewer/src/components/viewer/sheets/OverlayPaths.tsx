/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A plan's overlays (`project/plan-overlays.ts`) as SVG: one tagged path per pen, labels as text. */

import type { PlanOverlay } from '@/project/plan-overlays';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { shapePath } from '../drafting/DraftOverlay';
import { dashOf } from '@/drafting/styles';
import { penTags } from './dxf-tags';

/** Label size, paper millimetres. */
const LABEL_MM = 2.5;

export function OverlayPaths({ overlays, transform, axis, textScale = 1, ink = '#000' }: {
  overlays: readonly PlanOverlay[]; transform: ViewTransform; axis: SectionAxisName;
  /** Paper millimetres → the SVG's units for labels (1 on a sheet). */
  textScale?: number;
  /** Stroke and text colour (a sheet prints black; a live view takes its theme's ink). */
  ink?: string;
}) {
  return (
    <>
      {overlays.map((o, i) => {
        const lineType = o.lineType ?? (o.dashed ? 'dashed' : 'continuous');
        const dash = dashOf(lineType).map((d) => d * textScale).join(' ');
        return (
        <g key={i} {...penTags(o.layer, o.width, lineType)}>
          <path d={o.shapes.map((s) => shapePath(s, transform, axis)).join('')} stroke={ink} strokeWidth={o.width * textScale} strokeDasharray={dash || undefined} fill="none" />
          {o.texts?.map((l, k) => {
            const p = drawingToScreen(l.at, transform, axis);
            return <text key={k} x={p.x} y={p.y} fontSize={LABEL_MM * textScale} textAnchor="middle" dominantBaseline="middle" fill={ink} stroke="none" fontFamily="sans-serif">{l.text}</text>;
          })}
        </g>
        );
      })}
    </>
  );
}
