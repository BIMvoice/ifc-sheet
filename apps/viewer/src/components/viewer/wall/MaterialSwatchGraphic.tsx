/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A material's swatch (`project/material-swatch.ts`): the pens the sheet draws a cut band of it with, as the sheet's SVG (`SheetPaper`) writes them. */

import { useMemo } from 'react';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import { materialSwatch, SWATCH_MM } from '@/project/material-swatch';
import type { MaterialGraphics } from '@/project/materials';
import { OverlayPaths } from '../sheets/OverlayPaths';

/** The thinnest line the swatch shows, paper mm: a hairline at 1:100 is under a pixel at the swatch's size (the sheet's own pen widths are untouched). */
const MIN_LINE_MM = 0.2;

export function MaterialSwatchGraphic({ material, patterns, label }: { material: MaterialGraphics; patterns: readonly HatchPattern[]; label: string }) {
  const { hatch, hatchScale, fill, hatchPen, membrane } = material;
  const swatch = useMemo(
    () => materialSwatch(material, patterns),
    // The graphics, not the row's identity: an edit of any of these draws it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [material.name, hatch, hatchScale, fill, hatchPen, membrane, patterns],
  );
  return (
    <svg data-material-swatch viewBox={`0 0 ${SWATCH_MM.width} ${SWATCH_MM.height}`} className="h-9 w-16 shrink-0 rounded-sm bg-white" strokeLinecap="butt">
      <title>{label}</title>
      {swatch.pens.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ?? 'none'} fillRule="evenodd" stroke={p.stroke ?? 'none'} strokeWidth={p.stroke ? Math.max(p.width, MIN_LINE_MM) : p.width} strokeDasharray={p.dash} />
      ))}
      <OverlayPaths overlays={swatch.overlays} transform={swatch.transform} axis="down" />
    </svg>
  );
}
