/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drafted line's pen in the properties panel: the colour, weight and line
 * type its layer gives, each shown as drawn and marked when this element
 * overrides it, with its own reset. Same `o.<field>` overrides as annotations.
 */

import { useTranslation, type TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { setElementOverride } from '@/project/drafting-standards';
import { entityPen } from '@/drafting/styles';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import { Line } from './AnnotationStyleFields';

const WEIGHTS = [0.09, 0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4];
const BUILT_IN = ['continuous', 'dashed', 'dotted', 'dashdot'] as const;
const INPUT = 'h-6 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1';

/** `ids`: every element the edit applies to (a multi-selection); `entity` is the one whose pen is shown. */
export function LineStyleFields({ entity, layer, ids: all }: { entity: DraftEntity; layer: DraftLayer | undefined; ids?: ReadonlySet<string> }) {
  const { t } = useTranslation();
  const custom = useProjectStore((s) => s.lineTypes) ?? [];
  const pen = entityPen(layer, entity.params, custom);
  const ids = all ?? new Set([entity.id]);
  const weights = WEIGHTS.includes(pen.width) ? WEIGHTS : [...WEIGHTS, pen.width].sort((a, b) => a - b);
  return (
    <div className="space-y-1 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <span className="text-zinc-500">{t('standards.el.line')} · {t('standards.el.byLayer')}</span>
      <Line label={t('standards.el.color')} field="color" entity={entity} ids={ids}>
        <input type="color" aria-label={t('standards.el.color')} className="h-6 w-9 cursor-pointer rounded-sm border border-zinc-300 dark:border-zinc-700" value={pen.color} onChange={(e) => setElementOverride(ids, 'color', e.target.value)} />
      </Line>
      <Line label={t('standards.el.weight')} field="lineWeight" entity={entity} ids={ids}>
        <select aria-label={t('standards.el.weight')} className={INPUT} value={pen.width} onChange={(e) => setElementOverride(ids, 'lineWeight', Number(e.target.value))}>
          {weights.map((w) => <option key={w} value={w}>{w.toFixed(2)}</option>)}
        </select>
      </Line>
      <Line label={t('standards.el.lineType')} field="lineType" entity={entity} ids={ids}>
        <select aria-label={t('standards.el.lineType')} className={INPUT} value={pen.lineType} onChange={(e) => setElementOverride(ids, 'lineType', e.target.value)}>
          {BUILT_IN.map((k) => <option key={k} value={k}>{t(`standards.layer.type.${k}` as TranslationKey)}</option>)}
          {custom.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Line>
    </div>
  );
}
