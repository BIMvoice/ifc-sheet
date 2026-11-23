/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * IfcSheet's tool icons, drawn like drafting symbols: one 64 grid, one stroke
 * weight, one accent per icon (the concept's icon sheet, direction #20).
 * `currentColor` is the ink; `accent` the one coloured part.
 */

import type { ReactNode } from 'react';

export type ToolIconName = 'dimension' | 'tag' | 'note' | 'level' | 'section' | 'symbol' | 'plus' | 'dots' | 'trash' | 'cube';

/** Ink strokes, accent strokes and accent fills of each icon. */
const ICONS: Record<ToolIconName, { ink?: string; accent?: string; fill?: string; extra?: (accent: string) => ReactNode }> = {
  dimension: { ink: 'M14 12v34M50 12v34M24 26h16', accent: 'M6 36h52M9 41l10-10M45 41l10-10' },
  // Each is the mark the tool places, as it stands on a sheet: no speech bubbles and no arrows.
  // A tag is its label box, pointed at both ends, with the mark written in it.
  tag: { ink: 'M18 18h28l12 14-12 14H18L6 32z', accent: 'M22 32h20' },
  // A note is its text and the leader that ties it to what it describes, ending in a dot.
  note: {
    ink: 'M30 14h26M30 24h26M30 34h14', accent: 'M24 24h-6L10 48',
    extra: (accent) => <circle cx="10" cy="50" r="3.8" fill={accent} />,
  },
  // A level mark: the triangle standing on the level, half filled, and the height written on its shoulder.
  level: { ink: 'M6 46h52M42 28h16', accent: 'M20 28h22L31 46zM46 19h10', fill: 'M20 28h11v18z' },
  // A section head: the circle with the drawing's number over its sheet, the wedge showing which way it looks, and the cut line.
  section: {
    ink: 'M32 38v22M20 24h24', fill: 'M8 24L23.83 12.63A14 14 0 0 0 23.83 35.37z',
    extra: () => <circle cx="32" cy="24" r="14" fill="none" stroke="currentColor" strokeWidth={3} />,
  },
  symbol: {
    accent: 'M32 14l9 30-9-7-9 7z', fill: 'M32 14l9 30-9-7z',
    extra: () => <circle cx="32" cy="34" r="24" fill="none" stroke="currentColor" strokeWidth={3} />,
  },
  plus: { accent: 'M32 12v40M12 32h40' },
  trash: { ink: 'M12 18h40M24 18v-6h16v6M17 18l3 36h24l3-36', accent: 'M28 28v18M36 28v18' },
  cube: { ink: 'M32 8l20 11v22L32 52 12 41V19zM12 19l20 11 20-11', accent: 'M32 30v22' },
  dots: {
    extra: (accent) => (
      <>
        <circle cx="14" cy="32" r="4" fill={accent} />
        <circle cx="32" cy="32" r="4" fill={accent} />
        <circle cx="50" cy="32" r="4" fill={accent} />
      </>
    ),
  },
};

export function ToolIcon({ name, size = 40, accent = '#22d3ee' }: { name: ToolIconName; size?: number; accent?: string }) {
  const icon = ICONS[name];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {icon.extra?.(accent)}
      {icon.ink ? <path d={icon.ink} stroke="currentColor" strokeWidth={3} /> : null}
      {icon.accent ? <path d={icon.accent} stroke={accent} strokeWidth={3} /> : null}
      {icon.fill ? <path d={icon.fill} fill={accent} /> : null}
    </svg>
  );
}
