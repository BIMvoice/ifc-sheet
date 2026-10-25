/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The part of a drawing's card for single elements (#32, #33): what the drawing hides one by one, with a way to bring each back or
 * all at once, and the selected elements to hide in it. What the drawing says about elements the model no longer has (after a reload
 * from another export) is kept and listed apart, as the schedule text of #186 is, until the person lets it go; it is not drawn.
 * Elements are known by GlobalId, so a reload of the same model changes nothing here.
 */

import { useMemo } from 'react';
import { hiddenElementIds, orphanElements } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { forgetElements, hideElements, showAllHidden, showElements } from '@/project/element-graphics-actions';
import { labelOfGlobalId, modelGlobalIds, selectedElements } from '@/project/model-guids';
import type { ProjectView } from '@/project/types';
import { WALL_PILL } from './wall-type';
import { CardSection } from './CardSection';

export function HiddenElementsSection({ view }: { view: ProjectView }) {
  const { t } = useTranslation();
  const models = useViewerStore((s) => s.models);
  const version = useViewerStore((s) => s.mutationVersion);
  const selectedIds = useViewerStore((s) => s.selectedEntityIds);
  const selectedId = useViewerStore((s) => s.selectedEntityId);
  const graphics = view.graphics;
  const hidden = hiddenElementIds(graphics);
  const lineCount = graphics?.hiddenLines?.length ?? 0;
  // Orphans only once a model is loaded: before that every GlobalId is unknown, and none of them is gone.
  const orphans = useMemo(() => {
    void models; void version;
    const known = modelGlobalIds();
    return known.size === 0 ? [] : orphanElements(graphics, (id) => known.has(id));
  }, [graphics, models, version]);
  const orphanIds = new Set(orphans.map((o) => o.globalId));
  const live = hidden.filter((id) => !orphanIds.has(id));
  const selected = useMemo(() => selectedElements(), [selectedIds, selectedId, models]).filter((e) => !hidden.includes(e.globalId));
  const total = live.length;
  const summary = total + lineCount === 0 ? t('wall.hidden.summaryNone') : t('wall.hidden.summary', { count: total });
  return (
    <CardSection id="hidden" title={t('wall.hidden.title')} summary={summary} defaultOpen={total + lineCount + orphans.length + selected.length > 0} warn={orphans.length > 0}>
      {total + lineCount === 0 ? <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.hidden.none')}</p> : null}
      {selected.length > 0 ? (
        <div className="mt-2">
          <button type="button" className={WALL_PILL} onClick={() => hideElements(view.id, selected.map((e) => e.globalId))}>{t('wall.hidden.hideSelected', { count: selected.length })}</button>
        </div>
      ) : null}
      {total > 0 ? (
        <ul className="m-0 mt-2 max-h-48 list-none overflow-y-auto p-0">
          {live.map((id) => {
            const name = labelOfGlobalId(id) ?? id;
            return (
              <li key={id} className="flex items-center justify-between gap-2 py-0.5 text-sm text-sky-100">
                <span className="min-w-0 truncate">{name}</span>
                <button type="button" aria-label={t('wall.hidden.show', { name })} className={WALL_PILL} onClick={() => showElements(view.id, [id])}>{t('wall.hidden.showLabel')}</button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {lineCount > 0 ? <p className="m-0 mt-2 text-xs text-sky-200">{t('wall.hidden.lines', { count: lineCount })}</p> : null}
      {total + lineCount > 0 ? (
        <div className="mt-2"><button type="button" className={WALL_PILL} onClick={() => showAllHidden(view.id)}>{t('wall.hidden.showAll')}</button></div>
      ) : null}
      {orphans.length > 0 ? (
        <div className="mt-4">
          <p className="m-0 text-xs font-medium text-amber-300">{t('wall.hidden.orphans')}</p>
          <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.hidden.orphanHint')}</p>
          <ul className="m-0 mt-1 list-none p-0">
            {orphans.map((o) => {
              const name = o.about ?? o.globalId;
              const what = [o.hidden ? t('wall.hidden.orphanHidden') : '', o.overridden ? t('wall.hidden.orphanOverride') : '', o.lines ? t('wall.hidden.orphanLines', { count: o.lines }) : ''].filter(Boolean).join(', ');
              return (
                <li key={o.globalId} className="flex items-center justify-between gap-2 py-0.5 text-sm text-sky-100">
                  <span className="min-w-0 truncate" title={o.globalId}>{name} · {what}</span>
                  <button type="button" aria-label={t('wall.hidden.orphanForgetLabel', { name })} className={WALL_PILL} onClick={() => forgetElements(view.id, [o.globalId])}>{t('wall.hidden.orphanForget')}</button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </CardSection>
  );
}
