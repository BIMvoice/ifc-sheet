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
  tag: {
    ink: 'M31 34L16 48', accent: 'M30 17h22M30 25h14',
    extra: (accent) => (
      <>
        <rect x="22" y="8" width="38" height="26" rx="8" fill="none" stroke="currentColor" strokeWidth={3} />
        <circle cx="12" cy="52" r="3.8" fill={accent} />
      </>
    ),
  },
  note: { ink: 'M30 12h26M30 22h26M30 32h14', accent: 'M36 38L21 47', fill: 'M10 54l14.8-2.6-5.8-9.4z' },
  level: { ink: 'M8 36h48M24 48h16M28 55h8', accent: 'M21 20h22L32 36z' },
  section: {
    ink: 'M32 29v31', accent: 'M27.5 23L32 11l4.5 12M29 19.5h6M32 38h17L32 54z',
    extra: () => <circle cx="32" cy="17" r="12" fill="none" stroke="currentColor" strokeWidth={3} />,
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
