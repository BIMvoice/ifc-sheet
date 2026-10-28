/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drafting layers this viewport hides on its own sheet (#44), over the layers its drawing hides itself: the same drawing in two
 * viewports can show different layers. A layer off everywhere else (its own switch, its group, the drawing) is listed greyed: the
 * viewport cannot bring back what its drawing hides. The rule is `layerShows` and `viewportHiddenLayers`, the sheet's.
 */

import { viewportHiddenLayers } from '@bimvoice/ifcsheet';
import { layerShows } from '@/drafting/styles';
import { useTranslation } from '@/i18n';
import { toggleViewportHiddenLayer } from '@/project/view-template-actions';
import { useProjectStore } from '@/project/project-store';
import type { ProjectView, SheetViewport } from '@/project/types';

export function ViewportHiddenLayers({ sheetId, viewport, view }: { sheetId: string; viewport: SheetViewport; view: ProjectView | undefined }) {
  const { t } = useTranslation();
  const layers = useProjectStore((s) => s.draftLayers);
  const groups = useProjectStore((s) => s.layerGroups) ?? [];
  if (layers.length === 0) return <p className="m-0 mt-2 text-xs text-sky-200">{t('wall.gfx.layersNone')}</p>;
  return (
    <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
      {layers.map((layer) => {
        // Shown by its own switch, its group's and its drawing's: only then can this viewport choose.
        const available = layerShows(layer, groups, { view: view?.hiddenLayers });
        const hereHidden = viewportHiddenLayers(undefined, viewport).includes(layer.id);
        return (
          <li key={layer.id} className={`flex items-center gap-2 text-sm text-white ${available ? '' : 'opacity-50'}`}>
            <input
              type="checkbox" aria-label={t('wall.gfx.layerShown', { layer: layer.name })} disabled={!available} checked={available && !hereHidden}
              onChange={() => toggleViewportHiddenLayer(sheetId, viewport.id, layer.id)}
            />
            <span className="inline-block size-2.5 shrink-0 rounded-sm border border-sky-300/40" style={{ background: layer.color }} />
            <span className="min-w-0 flex-1 truncate">{layer.name}</span>
            {available ? null : <span className="text-2xs text-sky-200">{t('wall.gfx.layerOffInDrawing')}</span>}
          </li>
        );
      })}
    </ul>
  );
}
