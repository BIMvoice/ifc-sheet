/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One model in the navigator's Models folder (#96): its name, whether it is
 * the host or linked, and how it draws in the views (`project/model-styles.ts`).
 */

import { FileBox } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { setHostModel, setModelDrawStyle, type ModelDrawing, type ModelDrawStyle } from '@/project/model-styles';
import type { ProjectModelRef } from '@/project/types';

export function ProjectModelRow({ model, drawing }: { model: ProjectModelRef; drawing: ModelDrawing }) {
  const { t } = useTranslation();
  const host = drawing.role === 'host';
  return (
    <div className="flex items-center gap-1.5 h-7 pl-8 pr-2 text-xs text-zinc-600 dark:text-zinc-400">
      <FileBox className="size-3.5 shrink-0" />
      <span className="truncate flex-1">{model.name}</span>
      {host ? (
        <span className="shrink-0 rounded-sm bg-zinc-200 dark:bg-zinc-800 px-1">{t('projectNavigator.model.host')}</span>
      ) : (
        <button
          type="button"
          className="shrink-0 rounded-sm border border-zinc-300 dark:border-zinc-700 px-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          title={t('projectNavigator.model.makeHost', { name: model.name })}
          aria-label={t('projectNavigator.model.makeHost', { name: model.name })}
          onClick={() => setHostModel(model.key)}
        >
          {t('projectNavigator.model.linked')}
        </button>
      )}
      <select
        aria-label={t('projectNavigator.model.style', { name: model.name })}
        className="h-5 shrink-0 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent"
        value={drawing.style}
        onChange={(e) => setModelDrawStyle(model.key, e.target.value as ModelDrawStyle)}
      >
        <option value="normal">{t('projectNavigator.model.style.normal')}</option>
        <option value="halftone">{t('projectNavigator.model.style.halftone')}</option>
      </select>
    </div>
  );
}
