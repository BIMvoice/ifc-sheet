/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { pacCoverage, type PacKind } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import type { DrawerSection } from './types';

const KINDS: readonly PacKind[] = ['drawing', 'written', 'existingBuilding'];

/** 25000 reads "25.000" in Romanian and "25,000" in English; the list is joined with a slash as the text does. */
const scaleList = (scales: readonly number[], locale: string): string => scales.map((s) => s.toLocaleString(locale)).join(', 1:');

/** The contents of the permit project (PAC, Legea 169/2026 Anexa 2) as a checklist: what the set draws, and what the person supplies. */
function Pac() {
  const { t, locale } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const rows = pacCoverage(sheets);
  return (
    <section className="border-t border-sky-300/10 px-4 py-3" aria-label={t('pac.title')}>
      <h3 className="m-0 mb-1.5 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('pac.title')}</h3>
      <p className="m-0 mb-2 text-xs text-sky-100/80">{t('pac.intro')}</p>
      {KINDS.map((kind) => (
        <div key={kind}>
          <h4 className="m-0 mt-2 text-xs font-medium text-white">{t(`pac.kind.${kind}` as TranslationKey)}</h4>
          <ul className="m-0 list-none p-0">
            {rows.filter((r) => r.item.kind === kind).map(({ item, drawn }) => (
              <li key={item.id} className="mt-1 text-xs text-sky-100" data-pac-item={item.id} data-pac-drawn={drawn}>
                <span>{t(`pac.item.${item.id}` as TranslationKey)}</span>
                <span className="ml-1 text-2xs text-sky-100/60">
                  {t('pac.point', { point: item.point })}
                  {kind === 'drawing' ? `; ${item.scales ? t('pac.scales', { list: scaleList(item.scales, locale) }) : t('pac.scales.adequate')}` : ''}
                </span>
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-2xs ${drawn ? 'bg-emerald-400/20 text-emerald-200' : 'bg-sky-400/15 text-sky-100'}`}>{drawn ? t('pac.drawn') : t('pac.supply')}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="m-0 mt-2 text-2xs text-sky-100/60">{t('pac.notSet')}</p>
    </section>
  );
}

/** The permit-project checklist (#364). */
export const pacSection: DrawerSection = { id: 'pac', slot: 'body', order: 160, component: Pac };
