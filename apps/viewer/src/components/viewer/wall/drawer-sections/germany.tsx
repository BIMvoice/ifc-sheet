/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GERMANY_LANDS, germanyCoverage, type GermanyLand } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import type { ModelExtent } from '@/project/drawing-set';
import { permitPackOf, useProjectStore } from '@/project/project-store';
import { chooseGermanyLand } from '../germany-land';
import type { DrawerContext, DrawerSection } from './types';

/** The Land choice: the same control in the drawer and on the empty Wall, both writing the project's one `germanyLand`; the sheets follow it (`chooseGermanyLand`). */
export function GermanyLandSelect({ className, extent = null }: { className?: string; extent?: ModelExtent | null }) {
  const { t } = useTranslation();
  const land = useProjectStore((s) => s.germanyLand);
  return (
    <label className={className ?? 'flex items-center gap-2 text-xs text-white'}>
      <span>{t('germany.land.label')}</span>
      <select data-germany-land value={land ?? ''} onChange={(e) => chooseGermanyLand(GERMANY_LANDS.find((l) => l === e.target.value), t, extent)} className="rounded border border-sky-300/20 bg-transparent px-1 py-0.5 text-xs text-white">
        <option value="" className="text-black">{t('germany.land.none')}</option>
        {GERMANY_LANDS.map((l) => <option key={l} value={l} className="text-black">{t(`germany.land.${l}` as TranslationKey)}</option>)}
      </select>
    </label>
  );
}

/**
 * The German building application (Bauantrag), shown while it is the project's permit pack (chosen in the permit pack section): the
 * drawer asks for the Land and lists the drawings with where each comes from and whether the research read it in the official text (#372).
 */
function Germany({ extent }: DrawerContext) {
  const { t } = useTranslation();
  const on = useProjectStore((s) => permitPackOf(s)) === 'germany';
  const land: GermanyLand | undefined = useProjectStore((s) => s.germanyLand);
  const sheets = useProjectStore((s) => s.sheets);
  const views = useProjectStore((s) => s.views);
  if (!on) return null;
  const rows = germanyCoverage(sheets, views, land);
  return (
    <section className="border-t border-sky-300/10 px-4 py-3" aria-label={t('germany.title')}>
      <h3 className="m-0 mb-1.5 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('germany.title')}</h3>
      <p className="m-0 mt-2 text-xs text-sky-100/80">{t('germany.intro')}</p>
      <div className="mt-2"><GermanyLandSelect extent={extent} /></div>
      {land === undefined ? <p className="m-0 mt-1 text-2xs text-amber-200" data-germany-land-note>{t('germany.land.noneNote')}</p> : land === 'other' ? <p className="m-0 mt-1 text-2xs text-amber-200" data-germany-land-note>{t('germany.land.otherNote')}</p> : null}
      <ul className="m-0 mt-1 list-none p-0">
        {rows.map(({ item, state, drawn, sheetMade, missingStoreys }) => (
          <li key={item.id} className="mt-1 text-xs text-sky-100" data-germany-item={item.id} data-germany-drawn={drawn} data-germany-sheet={sheetMade} data-germany-state={state} data-germany-status={item.status}>
            <span>{t(`germany.item.${item.id}` as TranslationKey)}</span>
            <span className="ml-1 text-2xs text-sky-100/60">{t('germany.source', { source: item.source })}{item.scale === null ? '' : `; ${t(item.scaleStatus === 'unverified' ? 'germany.scaleUnverified' : 'germany.scale', { scale: item.scale })}`}</span>
            <span className={`ml-1 rounded-full px-1.5 py-0.5 text-2xs ${item.status === 'read' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-400/20 text-amber-200'}`}>{t(item.status === 'read' ? 'germany.read' : 'germany.unverified')}</span>
            <span className={`ml-1 rounded-full px-1.5 py-0.5 text-2xs ${drawn ? 'bg-emerald-400/20 text-emerald-200' : 'bg-sky-400/15 text-sky-100'}`}>{drawn ? t('germany.drawn') : t('germany.supply')}</span>
            {sheetMade ? <span className="ml-1 text-2xs text-sky-100/60" data-germany-sheet-made>{t('germany.sheetMade')}</span> : null}
            {missingStoreys.length > 0 ? <span className="mt-0.5 block text-2xs text-amber-200" data-germany-missing>{t('germany.missingLevels', { list: missingStoreys.join(', ') })}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The German permit mode (#372). */
export const germanySection: DrawerSection = { id: 'germany', slot: 'body', order: 166, component: Germany, useVisible: () => useProjectStore((s) => permitPackOf(s)) === 'germany' };
