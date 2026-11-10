/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A small card on the bare drawing (IfcSheet's face, which drops the toolbar
 * and the properties panel): what the selection's pen and layer are, and a
 * labelled button for the layers and line types editors. Colour, weight and
 * dash are `LineStyleFields`, the same fields as the properties panel; they
 * show when everything selected is geometry and apply to all of it.
 */

import { Layers } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { setDraftLayer } from '@/drafting/draft-store';
import { isGeometry, type DraftEntity, type DraftLayer } from '@/drafting/types';
import { openStandards } from '@/project/standards-dialog-store';
import { LineStyleFields } from './LineStyleFields';

export function SelectionStyleCard({ entities, layers }: { entities: DraftEntity[]; layers: DraftLayer[] }) {
  const { t } = useTranslation();
  if (entities.length === 0) return null;
  const ids = new Set(entities.map((e) => e.id));
  const layerId = entities.every((e) => e.layerId === entities[0].layerId) ? entities[0].layerId : '';
  const pen = entities.every((e) => isGeometry(e.shape));
  return (
    <section
      aria-label={t('drafting.card.title')}
      className="absolute bottom-2 left-2 z-10 w-60 cursor-auto space-y-2 rounded-md border border-zinc-200 bg-white/95 p-2 text-xs text-zinc-900 shadow-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label className="flex items-center justify-between gap-2">
        <span className="text-zinc-500">{t('drafting.card.layer')}</span>
        <select
          aria-label={t('drafting.card.layer')}
          className="h-6 min-w-0 flex-1 rounded-sm border border-zinc-300 bg-transparent"
          value={layerId}
          onChange={(e) => setDraftLayer(ids, e.target.value)}
        >
          {layerId === '' ? <option value="">{t('drafting.props.mixed')}</option> : null}
          {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {pen ? <LineStyleFields entity={entities[0]} ids={ids} layer={layers.find((l) => l.id === entities[0].layerId)} /> : null}
      <button type="button" className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-100" onClick={() => openStandards('layers')}>
        <Layers className="size-3.5" />{t('drafting.card.editors')}
      </button>
    </section>
  );
}
