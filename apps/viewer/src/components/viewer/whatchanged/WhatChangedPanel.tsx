/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a new model version changed, by sheet: load the new version of the model, see "A-101: 3 changes"
 * for each sheet that shows something that changed, and step into one with its changes marked by revision
 * clouds. The comparison is `@/whatchanged/run`, the same one WHATCHANGED runs; this only starts it and lists
 * what it found. It is loaded when the panel opens, not with the Wall.
 */

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useIfcLoader } from '@/hooks/useIfcLoader';
import { useWhatChanged } from '@/whatchanged/baseline';
import { useProjectStore } from '@/project/project-store';
import { stepInto } from '../wall/wall-nav';
import { WALL_PILL } from '../wall/wall-type';

const action = `${WALL_PILL} disabled:opacity-40`;

export function WhatChangedPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { loadFile } = useIfcLoader();
  const { result, running, message } = useWhatChanged();
  const hasReference = useProjectStore((s) => s.modelState !== undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const busy = running || loading;

  const run = (mode: 'compare' | 'clear' | 'accept'): void => {
    setFailure(null);
    void import('@/whatchanged/run').then(({ runGuarded }) => runGuarded(mode, () => {}));
  };
  const openVersion = (file: File): void => {
    setFailure(null);
    setLoading(true);
    void import('@/whatchanged/version')
      .then(({ loadNewVersion }) => loadNewVersion(file, (f) => loadFile(f, { kind: 'primary' }), () => {}))
      .catch((err: unknown) => {
        console.warn('[whatchanged] the new version could not be loaded', err);
        setFailure(t('whatchanged.ui.versionFailed', { reason: err instanceof Error ? err.message : String(err) }));
      })
      .finally(() => setLoading(false));
  };
  const changed = result?.sheets.filter((s) => s.count > 0) ?? [];

  return (
    <aside aria-label={t('whatchanged.ui.title')} className="fixed right-4 top-16 z-30 flex max-h-[calc(100vh-5rem)] w-96 flex-col rounded-lg border border-sky-300/20 bg-[#08214a]/98 text-sky-50 shadow-2xl">
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <h2 className="m-0 min-w-0 flex-1 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('whatchanged.ui.title')}</h2>
        <button type="button" aria-label={t('whatchanged.ui.close')} onClick={onClose} className="rounded p-1 text-sky-200 hover:bg-sky-400/20"><X className="size-4" /></button>
      </header>
      <p className="m-0 px-4 pb-3 text-sm text-sky-200/80">{t('whatchanged.ui.intro')}</p>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        <button type="button" className={action} disabled={busy} onClick={() => picker.current?.click()}>{loading ? t('whatchanged.ui.loadingVersion') : t('whatchanged.ui.loadVersion')}</button>
        <button type="button" className={action} disabled={busy} onClick={() => run('compare')}>{t('whatchanged.ui.compare')}</button>
        <input ref={picker} type="file" accept=".ifc,.ifcx" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) openVersion(file);
        }} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3" aria-live="polite">
        {failure ? <p role="alert" className="m-0 text-sm text-red-300">{failure}</p> : null}
        {message && !failure ? <p className="m-0 mb-2 text-sm text-sky-100">{message}</p> : null}
        {result ? (
          <>
            <p className="m-0 mb-1.5 text-xs text-sky-200/80">{changed.length === 0 ? t('whatchanged.ui.unchanged') : t('whatchanged.ui.summary', { count: result.changed })}</p>
            <ul className="m-0 list-none p-0">
              {changed.map((s) => (
                <li key={s.sheetId}>
                  <button type="button" onClick={() => { stepInto(s.sheetId); onClose(); }} className="w-full rounded-md px-2 py-1.5 text-left text-sm text-sky-50 hover:bg-sky-400/10">
                    <span className="mr-2 font-semibold text-white">{t('whatchanged.ui.sheetRow', { number: s.number, count: s.count })}</span>
                    <span className="text-sky-200/80">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {changed.length > 0 && result.sheets.length > changed.length ? <p className="m-0 mt-1.5 text-xs text-sky-200/70">{t('whatchanged.ui.sheetsUnchanged', { count: result.sheets.length - changed.length })}</p> : null}
          </>
        ) : null}
      </div>
      <footer className="flex flex-wrap gap-1.5 border-t border-sky-300/10 px-4 py-3">
        <button type="button" className={action} disabled={busy || !result || result.clouds === 0} onClick={() => run('clear')}>{t('whatchanged.ui.clear')}</button>
        <button type="button" className={action} disabled={busy || !hasReference} onClick={() => run('accept')}>{t('whatchanged.ui.accept')}</button>
      </footer>
    </aside>
  );
}
