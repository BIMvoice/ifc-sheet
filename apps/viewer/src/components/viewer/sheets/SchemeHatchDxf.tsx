/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the DXF reads of a colour scheme's hatch (#493). The pen's strokes draw the pattern on the sheet and are skipped by the DXF
 * (`dxfIgnore`); this invisible path holds the rooms they fill, tagged with the pattern, so the DXF writes them as a real HATCH of
 * that pattern (`sheet-dxf.ts`), which a CAD program can edit, instead of thousands of lines.
 */

import type { Pen } from './viewport-pens';

/** The attribute that keeps a scheme hatch's strokes out of the DXF. */
export const dxfIgnore = (pen: Pen): { 'data-export-ignore-dxf'?: 'true' } => (pen.schemeHatch || pen.surface ? { 'data-export-ignore-dxf': 'true' } : {});

export function SchemeHatchDxf({ pen }: { pen: Pen }) {
  if (!pen.schemeHatch) return null;
  const { name, outline, unit } = pen.schemeHatch;
  return <path data-dxf-pattern={name} data-dxf-pattern-unit={unit} data-dxf-layer={pen.layer} data-dxf-color={pen.stroke ?? '#000000'} d={outline} fill="none" stroke="none" />;
}
