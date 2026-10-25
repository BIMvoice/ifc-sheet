/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Show hidden" (#33): what the view hides, drawn in grey over the drawing so it can be seen and brought back one by one. Only on
 * screen, only while the toggle is on: it is not drawn on a sheet or in an export. A click on a ghost shows that element (or line)
 * again.
 */

import { memo } from 'react';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { useTranslation } from '@/i18n';
import type { HiddenGhosts } from '@/project/view-element-filter';

interface Props {
  ghosts: HiddenGhosts;
  transform: ViewTransform;
  axis: SectionAxisName;
  onShowElement: (globalId: string) => void;
  onShowLine: (entry: string) => void;
}

const GREY = '#9ca3af';

export const HiddenGhostLayer = memo(function HiddenGhostLayer({ ghosts, transform, axis, onShowElement, onShowLine }: Props) {
  const { t } = useTranslation();
  const pt = (p: { x: number; y: number }) => {
    const s = drawingToScreen(p, transform, axis);
    return `${s.x.toFixed(1)} ${s.y.toFixed(1)}`;
  };
  const ring = (pts: readonly { x: number; y: number }[]) => `M${pts.map(pt).join('L')}Z`;
  // A click on a ghost is for the ghost: the drawing's own pointer (pan, window select) never sees it.
  const own = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <svg data-hidden-ghosts className="absolute inset-0 h-full w-full" aria-label={t('elgfx.ghostHint')}>
      {[...ghosts.elements].map(([globalId, g]) => (
        <g key={globalId} data-ghost-element={globalId} className="cursor-pointer" onPointerDown={own} onClick={() => onShowElement(globalId)} aria-label={t('elgfx.ghostElement')}>
          <title>{t('elgfx.ghostElement')}</title>
          {g.rings.length ? <path d={g.rings.map(ring).join('')} fill={GREY} fillOpacity={0.25} stroke={GREY} strokeWidth={1.5} strokeDasharray="4 3" fillRule="evenodd" /> : null}
          {g.segments.length ? <path d={g.segments.map((s) => `M${pt(s.a)}L${pt(s.b)}`).join('')} fill="none" stroke={GREY} strokeWidth={1} strokeDasharray="4 3" /> : null}
        </g>
      ))}
      {ghosts.lines.map((l) => (
        <g key={l.entry} data-ghost-line={l.entry} className="cursor-pointer" onPointerDown={own} onClick={() => onShowLine(l.entry)} aria-label={t('elgfx.ghostLine')}>
          <title>{t('elgfx.ghostLine')}</title>
          <path d={`M${pt(l.a)}L${pt(l.b)}`} stroke="transparent" strokeWidth={10} fill="none" />
          <path d={`M${pt(l.a)}L${pt(l.b)}`} stroke={GREY} strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
        </g>
      ))}
    </svg>
  );
});
