/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A section of the viewport card: the graphics of the drawing (#44). What shows (categories) and at which line weight, the view
 * template the drawing follows (pick one, name this drawing's graphics as a new one, detach, reset its overrides), and the layers it
 * hides on this sheet. A drawing that follows a template writes its changes as overrides over it; changing the template itself for
 * every drawing that uses it is in the project drawer's View templates. The rules are the engine's (`resolveViewGraphics`).
 */

import { useState } from 'react';
import { resolveViewGraphics, templateKindOf } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { applyViewTemplate, detachViewTemplate, overrideCount, resetViewOverrides, saveViewAsTemplate, setViewCategory, templatesFor, usersOf } from '@/project/view-template-actions';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { CardSection } from './CardSection';
import { CategoryGraphicsList } from './CategoryGraphicsList';
import { ViewportHiddenLayers } from './ViewportHiddenLayers';
import { WALL_FIELD, WALL_PILL } from './wall-type';

const NO_TEMPLATE = '';

function SaveAsTemplate({ view }: { view: ProjectView }) {
  const { t } = useTranslation();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const save = (): void => {
    if (saveViewAsTemplate(view.id, name)) { setNaming(false); setName(''); }
  };
  if (!naming) return <button type="button" className={WALL_PILL} onClick={() => setNaming(true)}>{t('wall.gfx.saveAs')}</button>;
  return (
    <div className="mt-2 w-full">
      <label className="block text-xs text-sky-200">
        {t('wall.gfx.saveAsName')}
        <input
          // The person asked to name it: the field takes the keys at once.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus className={WALL_FIELD} value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(false); }}
        />
      </label>
      <div className="mt-2 flex gap-2">
        <button type="button" className={WALL_PILL} disabled={!name.trim()} onClick={save}>{t('wall.gfx.save')}</button>
        <button type="button" className={WALL_PILL} onClick={() => setNaming(false)}>{t('wall.gfx.cancel')}</button>
      </div>
    </div>
  );
}

export function GraphicsCard({ sheet, slot, view }: { sheet: ProjectSheet; slot: SheetViewport; view: ProjectView }) {
  const { t } = useTranslation();
  const templates = useProjectStore((s) => s.viewTemplates) ?? [];
  const views = useProjectStore((s) => s.views);
  const hasCategories = templateKindOf(view) !== null;
  const template = templates.find((x) => x.id === view.templateId);
  const effective = resolveViewGraphics(view, templates);
  const overrides = overrideCount(view, templates);
  const followers = template ? usersOf(template.id, views).length : 0;
  const summary = template ? t('wall.gfx.summaryTemplate', { name: template.name }) : t('wall.gfx.summaryOwn');
  return (
    <CardSection id="graphics" title={t('wall.gfx.title')} summary={summary} defaultOpen={false}>
      <div data-owns-keys>
        {hasCategories ? (
          <>
            <label className="mt-3 block text-xs text-sky-200">
              {t('wall.gfx.template')}
              <select
                className={WALL_FIELD} value={template?.id ?? NO_TEMPLATE}
                onChange={(e) => (e.target.value === NO_TEMPLATE ? detachViewTemplate(view.id) : applyViewTemplate([view.id], e.target.value))}
              >
                <option value={NO_TEMPLATE}>{t('wall.gfx.templateNone')}</option>
                {templatesFor(view, templates).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            {template ? <p className="m-0 mt-2 text-xs text-sky-200">{t('wall.gfx.followers', { name: template.name, count: followers })}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <SaveAsTemplate view={view} />
              {template ? <button type="button" className={WALL_PILL} onClick={() => detachViewTemplate(view.id)}>{t('wall.gfx.detach')}</button> : null}
              {template && overrides > 0 ? <button type="button" className={WALL_PILL} onClick={() => resetViewOverrides(view.id)}>{t('wall.gfx.resetOverrides', { count: overrides })}</button> : null}
            </div>
            <p className="m-0 mt-4 text-2xs font-medium uppercase tracking-widest text-sky-200/70">{t('wall.gfx.categories')}</p>
            <CategoryGraphicsList graphics={effective?.categories} overridden={template ? view.graphics?.categories : undefined} onChange={(category, patch) => setViewCategory(view.id, category, patch)} />
          </>
        ) : null}
        <p className="m-0 mt-4 text-2xs font-medium uppercase tracking-widest text-sky-200/70">{t('wall.gfx.layers')}</p>
        <ViewportHiddenLayers sheetId={sheet.id} viewport={slot} view={view} />
      </div>
    </CardSection>
  );
}
