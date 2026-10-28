/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the editor adds over a list schedule on the sheet (#446): a corner mark on each cell whose value was typed over the model's, and an
 * outline on the cell picked. Both are `data-export-ignore`: they are for the person editing, and neither the PDF, the SVG nor the DXF
 * carries them.
 */

import { useCellPick } from '@/joinery/list-cell-pick';
import type { ScheduleLayout } from '@/joinery/schedule-layout';

const MARK = 1.6;

export function CellMarks({ layout, scheduleId, x, y }: { layout: ScheduleLayout; scheduleId: string; x: number; y: number }) {
  const pick = useCellPick((s) => s.pick);
  if (!layout.cells) return null;
  return (
    <g data-export-ignore="true" data-cell-marks="" transform={`translate(${x} ${y})`} pointerEvents="none">
      {layout.cells.filter((c) => c.overridden).map((c) => (
        <path key={`${c.guid}:${c.column}`} data-overridden-cell="" d={`M${c.x + c.w - MARK} ${c.y} L${c.x + c.w} ${c.y} L${c.x + c.w} ${c.y + MARK} Z`} fill="#d97706" />
      ))}
      {layout.cells.filter((c) => pick?.scheduleId === scheduleId && pick.guid === c.guid && pick.column === c.column).map((c) => (
        <rect key={`pick:${c.guid}:${c.column}`} data-picked-cell="" x={c.x} y={c.y} width={c.w} height={c.h} fill="none" stroke="#2563eb" strokeWidth={0.4} />
      ))}
    </g>
  );
}
