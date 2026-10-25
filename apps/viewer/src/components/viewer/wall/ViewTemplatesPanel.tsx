/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's view templates, in the drawer (#44): rename one, change what shows and the line weights in it once for every drawing
 * that follows it, or delete it. A deleted template leaves its drawings as they were drawn: each keeps the graphics it had.
 */

import { X } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { deleteViewTemplate, renameViewTemplate, setTemplateCategory, usersOf } from '@/project/view-template-actions';
import type { ViewTemplateKind } from '@bimvoice/ifcsheet';
import { CategoryGraphicsList } from './CategoryGraphicsList';
import { StyleRulesEditor } from './StyleRulesEditor';

const KIND_LABEL = { plan: 'wall.group.plans', section: 'wall.group.sections', elevation: 'wall.group.elevations' } as const satisfies Record<ViewTemplateKind, TranslationKey>;

export function ViewTemplatesPanel() {
  const { t } = useTranslation();
  const templates = useProjectStore((s) => s.viewTemplates) ?? [];
  const views = useProjectStore((s) => s.views);
  return (
    <details className="border-t border-sky-300/10 px-4 py-3">
      <summary className="cursor-pointer text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('wall.tpl.title')}</summary>
      <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('wall.tpl.hint')}</p>
      {templates.length === 0 ? <p className="m-0 mt-2 text-xs text-sky-200">{t('wall.tpl.empty')}</p> : null}
      <ul className="m-0 mt-2 list-none p-0">
        {templates.map((template) => (
          <li key={template.id} className="group border-t border-sky-300/10 py-2 first:border-t-0">
            <div className="flex items-center gap-1">
              <input
                key={`${template.id}:${template.name}`} aria-label={t('wall.tpl.name')} defaultValue={template.name}
                className="m-0 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-white hover:border-sky-300/30 focus:border-sky-300/60"
                onBlur={(e) => renameViewTemplate(template.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
              <button type="button" aria-label={t('wall.tpl.delete', { name: template.name })} onClick={() => deleteViewTemplate(template.id)} className="rounded p-1 text-sky-200 hover:bg-sky-400/20">
                <X className="size-3.5" />
              </button>
            </div>
            <p className="m-0 px-1.5 text-xs text-sky-200">{t(KIND_LABEL[template.kind])} · {t('wall.tpl.usedBy', { count: usersOf(template.id, views).length })}</p>
            <details className="mt-1 px-1.5">
              <summary className="cursor-pointer text-xs text-sky-100">{t('wall.tpl.edit', { name: template.name })}</summary>
              <CategoryGraphicsList graphics={template.graphics.categories} onChange={(category, patch) => setTemplateCategory(template.id, category, patch)} />
              <StyleRulesEditor template={template} />
            </details>
          </li>
        ))}
      </ul>
    </details>
  );
}
