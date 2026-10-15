/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Choosing what a library file carries and saving it as `<project name>.bvlib`.
 * Every kind is chosen to start with; the counts follow the project live.
 */

import { useState } from 'react';
import { CATALOGUE_KINDS, type CatalogueKind } from '@/catalogue/catalogue-file';
import { kindCounts } from '@/catalogue/catalogue-counts';
import { catalogueFileName, exportCatalogue, projectCatalogue } from '@/catalogue/catalogue-store';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { libraryAction } from './library-style';

export function LibraryExport() {
  const { t } = useTranslation();
  const name = useProjectStore((s) => s.name);
  // The counts as one string: stable while they do not change, live while the panel is open.
  const counts = useProjectStore((s) => kindCounts(projectCatalogue(s)).join(',')).split(',').map(Number);
  const [kinds, setKinds] = useState<ReadonlySet<CatalogueKind>>(new Set(CATALOGUE_KINDS));
  const [saved, setSaved] = useState<string | null>(null);
  const toggle = (k: CatalogueKind): void => {
    setSaved(null);
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  const file = catalogueFileName(name);
  return (
    <section aria-label={t('wall.lib.export')} className="mt-2 max-h-[50vh] overflow-y-auto rounded-lg border border-sky-300/20 bg-[#061a36]/60 p-3">
      <p className="m-0 text-xs text-sky-200">{t('wall.lib.exportHint')}</p>
      <ul className="m-0 mt-2 list-none space-y-1 p-0 text-sm text-sky-50">
        {CATALOGUE_KINDS.map((k, i) => (
          <li key={k}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={kinds.has(k)} onChange={() => toggle(k)} />
              <span className="min-w-0 flex-1">{t(`library.kind.${k}` as TranslationKey)}</span>
              <span className="tabular-nums text-sky-300">{counts[i]}</span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={kinds.size === 0}
        className={`${libraryAction} mt-3 border-cyan-400/60 text-cyan-300 disabled:opacity-40`}
        onClick={() => {
          exportCatalogue(kinds, name);
          setSaved(file);
        }}
      >
        {t('wall.lib.download', { file })}
      </button>
      {saved ? <output className="mt-2 block text-xs text-sky-200">{t('wall.lib.saved', { file: saved })}</output> : null}
    </section>
  );
}
