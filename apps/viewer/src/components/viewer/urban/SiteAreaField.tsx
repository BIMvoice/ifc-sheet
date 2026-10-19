/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The site area POT and CUT are measured on, kept in the project. Empty
 * falls back to the model's IfcSite area, shown as the placeholder.
 */

import { useId } from 'react';
import { useTranslation } from '@/i18n';
import { setProjectSiteArea, useProjectStore } from '@/project/project-store';

/** The typed value as m², or null for empty or not a positive number. */
export function parseSiteArea(text: string): number | null {
  const v = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(v) && v > 0 ? v : null;
}

export function SiteAreaField({ modelSiteArea, className, inputClassName }: { modelSiteArea: number | null; className?: string; inputClassName?: string }) {
  const { t } = useTranslation();
  const id = useId();
  const siteArea = useProjectStore((s) => s.siteArea);
  return (
    <span className={className ?? 'flex items-center gap-1.5'}>
      <label htmlFor={id}>{t('urban.siteArea')}</label>
      <input
        id={id}
        // Keyed on the stored value: opening another project puts the field back in step.
        key={siteArea ?? ''}
        type="text"
        inputMode="decimal"
        defaultValue={siteArea === undefined ? '' : String(siteArea)}
        placeholder={modelSiteArea === null ? t('urban.siteArea.none') : t('urban.siteArea.fromModel', { area: modelSiteArea.toFixed(2) })}
        title={t('urban.siteArea.help')}
        className={inputClassName ?? 'h-7 w-32 rounded-sm border border-zinc-300 bg-transparent px-1.5 text-xs dark:border-zinc-700'}
        onBlur={(e) => setProjectSiteArea(parseSiteArea(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </span>
  );
}
