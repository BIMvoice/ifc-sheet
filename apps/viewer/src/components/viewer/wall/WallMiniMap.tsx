/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A small map of the whole Wall in a corner: every sheet's outline and the part
 * on screen. Shown only when the Wall is larger than the screen; click or drag
 * on it to move the screen there.
 */

import { useTranslation } from '@/i18n';
import { capturePointer } from '@/lib/pointer-capture';
import { mapToWall, miniMap, wallOverflows } from '@/wall/wall-geometry';
import { scrollWallTo, useWallView } from '@/wall/wall-view';

const BOX = { w: 168, h: 112 };

export function WallMiniMap() {
  const { t } = useTranslation();
  const layout = useWallView((s) => s.layout);
  const highlight = useWallView((s) => s.highlight);
  if (!layout || !wallOverflows({ w: layout.viewport.w, h: layout.viewport.h }, layout.content)) return null;
  const map = miniMap(layout.sheets, layout.viewport, layout.content, BOX);
  const pan = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    scrollWallTo(mapToWall({ x: e.clientX - box.left, y: e.clientY - box.top }, map));
  };
  return (
    <div data-wall-map className="absolute bottom-4 right-6 z-10 rounded-md border border-sky-300/30 bg-[#061a36]/90 p-2 shadow-lg">
      <svg
        width={map.size.w}
        height={map.size.h}
        aria-label={t('wall.map.label')}
        className="block cursor-pointer"
        onPointerDown={(e) => {
          capturePointer(e.currentTarget, e.pointerId);
          pan(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) pan(e);
        }}
      >
        <title>{t('wall.map.hint')}</title>
        {map.sheets.map((s) => (
          <rect
            key={s.id}
            data-map-sheet={s.id}
            x={s.rect.x}
            y={s.rect.y}
            width={s.rect.w}
            height={s.rect.h}
            className={s.id === highlight ? 'fill-sky-300/70 stroke-sky-300' : 'fill-sky-300/15 stroke-sky-300/50'}
          />
        ))}
        <rect data-map-view x={map.view.x} y={map.view.y} width={map.view.w} height={map.view.h} fill="none" className="stroke-white/90" strokeWidth={2} />
      </svg>
    </div>
  );
}
