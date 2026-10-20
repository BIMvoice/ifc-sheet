/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reviewing and applying a library file: what is in it, the rule for names
 * the project already has (default: keep mine), what would come in under
 * that rule, and after "Import" what did. A refused file says why and
 * changes nothing.
 */

import { useMemo, useState } from 'react';
import { CATALOGUE_KINDS, parseCatalogue, type Catalogue } from '@/catalogue/catalogue-file';
import type { ClashPolicy, MergeReport } from '@/catalogue/catalogue-merge';
import { applyCatalogueImport, previewCatalogueImport } from '@/catalogue/catalogue-store';
import { useTranslation, type TranslationKey } from '@/i18n';
import { libraryAction } from './library-style';

export type ImportState =
  | { step: 'empty' }
  | { step: 'refused'; detail: string }
  | { step: 'review'; name: string; catalogue: Catalogue }
  | { step: 'done'; name: string; report: MergeReport };

/** A library file's text read into an import state: ready to review, or refused with the reader's own words. */
export function readLibraryText(text: string): ImportState {
  try {
    const { name, catalogue } = parseCatalogue(text);
    return { step: 'review', name, catalogue };
  } catch (err) {
    return { step: 'refused', detail: err instanceof Error ? err.message : String(err) };
  }
}

const POLICIES: readonly ClashPolicy[] = ['mine', 'theirs', 'both'];

/** The kinds a report says something about, with the report's numbers. */
function ReportRows({ report }: { report: MergeReport }) {
  const { t } = useTranslation();
  const rows = CATALOGUE_KINDS.filter((k) => report[k].added + report[k].kept + report[k].replaced + report[k].renamed > 0);
  if (rows.length === 0) return <p className="m-0 mt-2 text-xs text-sky-200">{t('wall.lib.nothing')}</p>;
  return (
    <ul className="m-0 mt-2 list-none space-y-1 p-0 text-xs text-sky-200" data-testid="wall-library-report">
      {rows.map((k) => (
        <li key={k}>
          <span className="font-medium text-white">{t(`library.kind.${k}` as TranslationKey)}</span>
          {' '}
          {t('library.report', { ...report[k] })}
        </li>
      ))}
    </ul>
  );
}

function Review({ name, catalogue, onState }: { name: string; catalogue: Catalogue; onState: (s: ImportState) => void }) {
  const { t } = useTranslation();
  const [policy, setPolicy] = useState<ClashPolicy>('mine');
  const report = useMemo(() => previewCatalogueImport(catalogue, policy), [catalogue, policy]);
  return (
    <>
      <p className="m-0 text-sm text-white">{name}</p>
      <fieldset className="m-0 mt-2 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
        <legend className="mb-1 p-0 text-xs text-sky-200">{t('wall.lib.clashRule')}</legend>
        {POLICIES.map((p) => (
          <button key={p} type="button" aria-pressed={policy === p} className={libraryAction} onClick={() => setPolicy(p)}>
            {t(`library.import.${p}` as TranslationKey)}
          </button>
        ))}
      </fieldset>
      <ReportRows report={report} />
      <button type="button" className={`${libraryAction} mt-3 border-cyan-400/60 text-cyan-300`} onClick={() => onState({ step: 'done', name, report: applyCatalogueImport(catalogue, policy) })}>
        {t('wall.lib.apply')}
      </button>
    </>
  );
}

export function LibraryImport({ state, onState, onChoose }: { state: ImportState; onState: (s: ImportState) => void; onChoose: () => void }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t('wall.lib.import')} className="mt-2 max-h-[50vh] overflow-y-auto rounded-lg border border-sky-300/20 bg-[#061a36]/60 p-3">
      {state.step === 'review' ? <Review key={state.name} name={state.name} catalogue={state.catalogue} onState={onState} /> : null}
      {state.step === 'done' ? (
        <div aria-live="polite">
          <p className="m-0 text-sm text-white">{t('library.import.done', { name: state.name })}</p>
          <ReportRows report={state.report} />
        </div>
      ) : null}
      {state.step === 'refused' ? <p role="alert" className="m-0 text-xs text-amber-300">{t('wall.lib.refused', { detail: state.detail })}</p> : null}
      {state.step === 'empty' ? <p className="m-0 text-xs text-sky-200">{t('library.import.hint')}</p> : null}
      <button type="button" className={`${libraryAction} mt-3`} onClick={onChoose}>{t('wall.lib.choose')}</button>
    </section>
  );
}
