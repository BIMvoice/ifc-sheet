/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The texts of a DXF underlay as SVG text (#547), for the plan view and the sheet: `toScreen` maps a drawing point to the SVG's own units. */

import { dxfUnderlayTexts, type ViewDxfUnderlay } from '@bimvoice/ifcsheet/underlay';

export function DxfUnderlayTexts({ underlay, toScreen }: { underlay: ViewDxfUnderlay; toScreen: (p: { x: number; y: number }) => { x: number; y: number } }) {
  return (
    <>
      {dxfUnderlayTexts(underlay).map((t, i) => {
        const p = toScreen(t.at);
        const along = toScreen({ x: t.at.x + t.dir.x, y: t.at.y + t.dir.y });
        const up = toScreen({ x: t.at.x - t.dir.y * t.height, y: t.at.y + t.dir.x * t.height });
        const size = Math.hypot(up.x - p.x, up.y - p.y);
        if (!(size > 0)) return null;
        const deg = (Math.atan2(along.y - p.y, along.x - p.x) * 180) / Math.PI;
        const anchor = t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start';
        return (
          <text key={i} data-dxf-layer={t.layer} x={p.x} y={p.y} fontSize={size} textAnchor={anchor} fill={t.colour} stroke="none" fontFamily="ui-sans-serif, system-ui, sans-serif" transform={deg ? `rotate(${deg} ${p.x} ${p.y})` : undefined}>{t.text}</text>
        );
      })}
    </>
  );
}
