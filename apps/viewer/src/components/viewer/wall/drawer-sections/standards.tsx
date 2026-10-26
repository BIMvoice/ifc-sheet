/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useRef, useState } from 'react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { downloadFile, sanitizeFilename } from '@/lib/export/download.js';
import { CATALOGUE_FILE_SUFFIX } from '@/catalogue/catalogue-file';
import { useProjectStore } from '@/project/project-store';
import { PACK_NOT_SET, ROMANIA_PACK_ID, builtInPacks, partsOf, type StandardPack } from '@/standards/standard-pack';
import { parseStandardPack, serializeStandardPack } from '@/standards/standard-pack-file';
import { installStandard, isApplied, resetStandard } from '@/standards/standard-pack-install';
import { WALL_PILL } from '../wall-type';
import type { DrawerSection } from './types';

const PART_LABEL = { pens: 'standards.pack.part.pens', titleBlock: 'standards.pack.part.titleBlock', units: 'standards.pack.part.units', numbering: 'standards.pack.part.numbering' } as const;
const NOT_SET_LABEL: Record<(typeof PACK_NOT_SET)[number], TranslationKey> = {
  numbering: 'standards.pack.notSet.numbering', lengthUnit: 'standards.pack.notSet.lengthUnit', decimals: 'standards.pack.notSet.decimals',
  hatchPatterns: 'standards.pack.notSet.hatchPatterns', viewTemplates: 'standards.pack.notSet.viewTemplates',
};

function PackCard({ pack, description }: { pack: StandardPack; description: string }) {
  const { t } = useTranslation();
  // Follows every part the pack sets, so the button says "Installed" only while the project is as the pack leaves it.
  const applied = useProjectStore((s) => isApplied(pack, s));
  const notSet = pack.notSet.map((k) => t(NOT_SET_LABEL[k])).join(', ');
  return (
    <li className="mb-2 rounded-md border border-sky-300/20 p-2">
      <div className="text-sm font-medium text-white">{pack.name}</div>
      <p className="m-0 mt-1 text-xs text-sky-100/80">{description}</p>
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-1 p-0">
        {partsOf(pack).map((p) => <li key={p} className="rounded-full bg-sky-400/15 px-2 py-0.5 text-2xs text-sky-100">{t(PART_LABEL[p])}</li>)}
      </ul>
      {notSet ? <p className="m-0 mt-1 text-2xs text-sky-100/60">{t('standards.pack.notSet', { list: notSet })}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className={WALL_PILL} disabled={applied} onClick={() => installStandard(pack)}>{applied ? t('standards.pack.applied') : t('standards.pack.install')}</button>
        <button type="button" className={WALL_PILL} onClick={() => downloadFile(serializeStandardPack(pack), `${sanitizeFilename(pack.name, { fallback: 'standard' })}${CATALOGUE_FILE_SUFFIX}`, 'application/json')}>{t('standards.pack.export')}</button>
      </div>
    </li>
  );
}

function Standards() {
  const { t } = useTranslation();
  const installed = useProjectStore((s) => s.installedStandard);
  const [refused, setRefused] = useState<string | null>(null);
  const [fromFile, setFromFile] = useState<StandardPack | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const packs = builtInPacks(t);
  const named = [...packs, ...(fromFile ? [fromFile] : [])].find((p) => p.id === installed?.id);
  return (
    <section className="border-t border-sky-300/10 px-4 py-3">
      <h3 className="m-0 mb-1.5 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('standards.pack.title')}</h3>
      <p className="m-0 mb-2 text-xs text-sky-100/80">{t('standards.pack.intro')}</p>
      <ul className="m-0 list-none p-0">
        {packs.map((p) => <PackCard key={p.id} pack={p} description={p.id === ROMANIA_PACK_ID ? t('standards.pack.ro-stas.description') : p.description} />)}
        {fromFile ? <PackCard key={fromFile.id} pack={fromFile} description={fromFile.description} /> : null}
      </ul>
      {installed ? <p className="m-0 mb-1 text-xs text-sky-100">{t('standards.pack.current', { name: named?.name ?? installed.id })}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {installed ? <button type="button" className={WALL_PILL} onClick={() => resetStandard()}>{t('standards.pack.reset')}</button> : null}
        <button type="button" className={WALL_PILL} onClick={() => input.current?.click()}>{t('standards.pack.fromFile')}</button>
        <input
          ref={input} type="file" accept={CATALOGUE_FILE_SUFFIX} className="hidden" aria-label={t('standards.pack.fromFile.label')}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              setFromFile(parseStandardPack(await file.text()));
              setRefused(null);
            } catch (err) {
              setRefused(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      </div>
      {refused ? <p role="alert" className="m-0 mt-1 text-xs text-amber-300">{t('standards.pack.refused', { reason: refused })}</p> : null}
    </section>
  );
}

/** Standards packs (#365): an office drawing standard installed in one step. */
export const standardsSection: DrawerSection = { id: 'standards', slot: 'body', order: 150, component: Standards };
