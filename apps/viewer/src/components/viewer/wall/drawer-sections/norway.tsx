/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { norwayCoverage } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { setNorwayPermit, useProjectStore } from '@/project/project-store';
import type { DrawerSection } from './types';

/**
 * The Norwegian building application (byggesak, SAK10 § 5-4) as an opt-in mode: the switch is a project field, and with it on the
 * drawer lists the drawings with where each comes from and whether the research read it in the official text (#372).
 */
function Norway() {
  const { t } = useTranslation();
  const on = useProjectStore((s) => s.norwayPermit) === true;
  const sheets = useProjectStore((s) => s.sheets);
  const views = useProjectStore((s) => s.views);
  const rows = on ? norwayCoverage(sheets, views) : [];
  return (
    <section className="border-t border-sky-300/10 px-4 py-3" aria-label={t('norway.title')}>
      <h3 className="m-0 mb-1.5 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('norway.title')}</h3>
      <label className="flex items-center gap-2 text-xs text-white">
        <input type="checkbox" data-norway-switch checked={on} onChange={(e) => setNorwayPermit(e.target.checked)} />
        <span className="font-medium">{t('norway.switch')}</span>
      </label>
      {on ? (
        <>
          <p className="m-0 mt-2 text-xs text-sky-100/80">{t('norway.intro')}</p>
          <ul className="m-0 mt-1 list-none p-0">
            {rows.map(({ item, state, drawn, missingStoreys }) => (
              <li key={item.id} className="mt-1 text-xs text-sky-100" data-norway-item={item.id} data-norway-drawn={drawn} data-norway-state={state} data-norway-status={item.status}>
                <span>{t(`norway.item.${item.id}` as TranslationKey)}</span>
                <span className="ml-1 text-2xs text-sky-100/60">{t('norway.source', { source: item.source })}{item.scale === null ? '' : `; ${t('norway.scale', { scale: item.scale })}`}</span>
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-2xs ${item.status === 'read' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-400/20 text-amber-200'}`}>{t(item.status === 'read' ? 'norway.read' : 'norway.unverified')}</span>
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-2xs ${drawn ? 'bg-emerald-400/20 text-emerald-200' : 'bg-sky-400/15 text-sky-100'}`}>{drawn ? t('norway.drawn') : t('norway.supply')}</span>
                {missingStoreys.length > 0 ? <span className="mt-0.5 block text-2xs text-amber-200" data-norway-missing>{t('norway.missingLevels', { list: missingStoreys.join(', ') })}</span> : null}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-2xs text-sky-100/60">{t('norway.siteNote')}</p>
        </>
      ) : null}
    </section>
  );
}

/** The Norwegian permit mode (#372). */
export const norwaySection: DrawerSection = { id: 'norway', slot: 'body', order: 165, component: Norway };
