/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The site area POT and CUT are measured on, kept in the project. Empty
 * falls back to the model's IfcSite area, shown as the placeholder; text that
 * is not an area is refused and the stored value shown again.
 */

import { useId } from 'react';
import { useTranslation } from '@/i18n';
import { setProjectSiteArea, useProjectStore } from '@/project/project-store';

/**
 * The typed value as m²: `{ area: null }` for an empty field (the model's area is used), null for text that is not a
 * positive area. Reads a decimal comma or point, thousands separators (point, comma or space: "1.250,5", "1,250.5",
 * "1 250,5") and a trailing "m²" or "m2". A lone separator is the decimal one ("1.250" is 1.25).
 */
export function parseSiteArea(text: string): { area: number | null } | null {
  const trimmed = text.trim();
  if (!trimmed) return { area: null };
  const s = trimmed.replace(/\s*m[²2]$/i, '').replace(/[\s\u00a0\u202f]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  const one = (sep: string) => s.split(sep).length - 1;
  // The decimal separator: the later of the two when both are used, else a separator used once.
  const decimal = last < 0 ? null : s.includes('.') && s.includes(',') ? s[last] : one(s[last]) === 1 ? s[last] : null;
  if (decimal !== null && one(decimal) > 1) return null;
  const [whole, fraction = ''] = decimal === null ? [s] : s.split(decimal);
  const grouped = /[.,]/.test(whole);
  if (grouped && !/^\d{1,3}([.,]\d{3})*$/.test(whole)) return null;
  if (grouped && new Set(whole.replace(/\d/g, '')).size > 1) return null;
  const v = Number(`${whole.replace(/[.,]/g, '')}${fraction ? `.${fraction}` : ''}`);
  return Number.isFinite(v) && v > 0 ? { area: v } : null;
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
        onBlur={(e) => {
          const read = parseSiteArea(e.target.value);
          // Text that is not an area keeps the stored value rather than clearing it.
          if (read === null) e.target.value = siteArea === undefined ? '' : String(siteArea);
          else setProjectSiteArea(read.area);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </span>
  );
}
