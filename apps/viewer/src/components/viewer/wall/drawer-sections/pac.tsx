/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useState } from 'react';
import { PAC_INTERVENTIONS, PAC_RURAL_ITEMS, pacCoverage, type PacKind } from '@bimvoice/ifcsheet';
import { deliver, runIssue } from '@/issue/run';
import { useTranslation, type TranslationKey } from '@/i18n';
import { permitPackOf, setPacIntervention, useProjectStore } from '@/project/project-store';
import { ruralScopeFindings } from '@/check/rural-scope';
import { describeMissing } from '@/check/readiness-say';
import { useUrbanIndicators } from '../../urban/useUrban';
import type { DrawerSection } from './types';

const KINDS: readonly PacKind[] = ['drawing', 'written', 'existingBuilding'];

/** 25000 reads "25.000" in Romanian and "25,000" in English; the list is joined with a slash as the text does. */
const scaleList = (scales: readonly number[], locale: string): string => scales.map((s) => s.toLocaleString(locale)).join(', 1:');

/** The contents of the permit project (PAC, Legea 169/2026 Anexa 2) as a checklist: what the set draws, and what the person supplies. */
function Pac() {
  const { t, locale } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const pack = useProjectStore((s) => permitPackOf(s));
  const rural = pack === 'pacRural';
  const views = useProjectStore((s) => s.views);
  const intervention = useProjectStore((s) => s.pacIntervention) ?? 'new';
  const rows = rural ? pacCoverage(sheets, { views, intervention }, PAC_RURAL_ITEMS) : pacCoverage(sheets, { views, intervention });
  // Anexa 3's scope (P + M, 150 m² Sd) against the model: measured only in that mode, read again as the model changes. The same findings are in the readiness list.
  const urban = useUrbanIndicators(rural);
  const outside = rural && urban ? ruralScopeFindings(urban.result) : [];
  const [status, setStatus] = useState<string | null>(null);
  const submit = () => {
    setStatus(t('pac.submit.working'));
    void runIssue({ format: 'pdf', pac: { locale } }).then((result) => {
      setStatus(result.lines.map((l) => t(l.key, l.params)).join(' '));
      if (result.pdf) deliver(result, 'pdf');
    }, (err: unknown) => setStatus(err instanceof Error ? err.message : String(err)));
  };
  return (
    <section className="border-t border-sky-300/10 px-4 py-3" aria-label={t('pac.title')}>
      <h3 className="m-0 mb-1.5 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('pac.title')}</h3>
      {outside.length > 0 ? (
        <ul aria-live="polite" data-pac-scope="" className="m-0 mb-2 list-none p-0 text-xs text-amber-200">
          {outside.map((f) => <li key={f.kind}>{describeMissing(f)}</li>)}
        </ul>
      ) : null}
      <p className="m-0 mb-2 text-xs text-sky-100/80">{t(rural ? 'pac.rural.intro' : 'pac.intro')}</p>
      <label className="mb-2 flex flex-col gap-1 text-xs text-sky-100">
        <span className="font-medium text-white">{t('pac.intervention')}</span>
        <select value={intervention} onChange={(e) => setPacIntervention(PAC_INTERVENTIONS.find((i) => i === e.target.value) ?? 'new')} className="rounded border border-sky-300/30 bg-transparent px-1 py-0.5 text-xs text-white">
          {PAC_INTERVENTIONS.map((i) => <option key={i} value={i} className="text-black">{t(`pac.intervention.${i}` as TranslationKey)}</option>)}
        </select>
      </label>
      {KINDS.map((kind) => (
        <div key={kind}>
          <h4 className="m-0 mt-2 text-xs font-medium text-white">{t(`pac.kind.${kind}` as TranslationKey)}</h4>
          <ul className="m-0 list-none p-0">
            {rows.filter((r) => r.item.kind === kind).map(({ item, state, drawn, missingStoreys }) => (
              <li key={item.id} className="mt-1 text-xs text-sky-100" data-pac-item={item.id} data-pac-drawn={drawn} data-pac-state={state}>
                <span>{t(`pac.item.${item.id}` as TranslationKey)}</span>
                <span className="ml-1 text-2xs text-sky-100/60">
                  {t(rural ? 'pac.rural.point' : 'pac.point', { point: item.point })}
                  {kind === 'drawing' && (item.scales || !rural) ? `; ${item.scales ? t(rural ? 'pac.rural.scales' : 'pac.scales', { list: scaleList(item.scales, locale) }) : t('pac.scales.adequate')}` : ''}
                </span>
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-2xs ${drawn ? 'bg-emerald-400/20 text-emerald-200' : 'bg-sky-400/15 text-sky-100'}`}>{state === 'na' ? t('pac.na') : drawn ? t('pac.drawn') : t('pac.supply')}</span>
                {missingStoreys.length > 0 ? <span className="mt-0.5 block text-2xs text-amber-200" data-pac-missing>{t('pac.missingLevels', { list: missingStoreys.join(', ') })}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="m-0 mt-2 text-2xs text-sky-100/60">{t(rural ? 'pac.rural.notSet' : 'pac.notSet')}</p>
      {rural ? null : (
        <>
          <button type="button" data-pac-submit onClick={submit} className="mt-2 rounded border border-sky-300/30 px-2 py-1 text-xs text-white hover:bg-sky-400/15">{t('pac.submit')}</button>
          <p className="m-0 mt-1 text-2xs text-sky-100/60">{t('pac.submit.hint')}</p>
          {status ? <output className="m-0 mt-1 block text-2xs text-sky-100">{status}</output> : null}
        </>
      )}
    </section>
  );
}

/** The permit-project checklist (#364). */
export const pacSection: DrawerSection = { id: 'pac', slot: 'body', order: 160, component: Pac };
