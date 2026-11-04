/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import type { TrackingView } from './useDraftingPointer';

/** Far enough to leave any screen, in px. */
const REACH_PX = 20000;

/** The acquired points as small crosses and the tracking lines near the cursor, dashed, through them (#667). Editor only: never on a sheet. */
export function TrackingMarks({ tracking, t, axis }: { tracking: TrackingView; t: ViewTransform; axis: SectionAxisName }) {
  if (tracking.acquired.length === 0) return null;
  const reach = REACH_PX / t.scale;
  return (
    <g data-testid="tracking-marks" fill="none" stroke="#16a34a" strokeWidth={1}>
      {tracking.lines.map((l, i) => {
        const a = drawingToScreen(l.dir === 'h' ? { x: l.from.x - reach, y: l.from.y } : { x: l.from.x, y: l.from.y - reach }, t, axis);
        const b = drawingToScreen(l.dir === 'h' ? { x: l.from.x + reach, y: l.from.y } : { x: l.from.x, y: l.from.y + reach }, t, axis);
        return <line key={`${l.dir}${i}`} data-testid="tracking-line" data-dir={l.dir} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray="6 4" />;
      })}
      {tracking.acquired.map((p, i) => {
        const s = drawingToScreen(p, t, axis);
        return <path key={i} d={`M${s.x - 5} ${s.y}L${s.x + 5} ${s.y}M${s.x} ${s.y - 5}L${s.x} ${s.y + 5}`} strokeWidth={2} />;
      })}
    </g>
  );
}
