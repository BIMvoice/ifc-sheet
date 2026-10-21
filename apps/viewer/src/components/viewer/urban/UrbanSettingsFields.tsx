/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The urban indicators' settings beside their table, kept in the project:
 * the terrain level and ±0.00 (`urban/indicators.ts` reads the basements and
 * Ac's storey against them), and per storey whether Ad for CUT counts it.
 */

import { useId } from 'react';
import { useTranslation } from '@/i18n';
import { setUrbanSettings, useProjectStore } from '@/project/project-store';
import type { UrbanIndicators, UrbanSettings } from '@/urban/indicators';

/**
 * A typed level in metres: `{ value: undefined }` for an empty field (the default applies), null for text that is not
 * a level. Reads a decimal comma or point, a sign (+, -, ±) and a trailing "m".
 */
export function parseLevel(text: string): { value: number | undefined } | null {
  const s = text.trim().replace(/\s*m$/i, '').replace(/^±/, '').replace(/−/g, '-').replace(',', '.');
  if (!s) return { value: undefined };
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? { value: v } : null;
}

function LevelField({ field, label, help, placeholder }: { field: 'terrainLevel' | 'zeroElevation'; label: string; help: string; placeholder: string }) {
  const id = useId();
  const stored = useProjectStore((s) => s.urbanSettings?.[field]);
  return (
    <span className="flex items-center gap-1.5">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        // Keyed on the stored value: opening another project puts the field back in step.
        key={stored ?? ''}
        type="text"
        inputMode="decimal"
        defaultValue={stored === undefined ? '' : String(stored)}
        placeholder={placeholder}
        title={help}
        className="h-7 w-20 rounded-sm border border-zinc-300 bg-transparent px-1.5 text-xs dark:border-zinc-700"
        onBlur={(e) => {
          const read = parseLevel(e.target.value);
          // Text that is not a level keeps the stored value rather than clearing it.
          if (read === null) e.target.value = stored === undefined ? '' : String(stored);
          else if (read.value !== stored) setUrbanSettings({ [field]: read.value } as Partial<UrbanSettings>);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </span>
  );
}

export function UrbanLevelFields({ result }: { result: UrbanIndicators | null }) {
  const { t } = useTranslation();
  return (
    <>
      <LevelField field="terrainLevel" label={t('urban.terrain')} help={t('urban.terrain.help')} placeholder="±0.00" />
      <LevelField field="zeroElevation" label={t('urban.zero')} help={t('urban.zero.help')} placeholder={result ? result.zero.elevation.toFixed(2) : ''} />
    </>
  );
}

/** One checkbox per storey: ticked, Ad for CUT counts it. A choice equal to the default is not stored. */
export function CutLevelToggles({ result }: { result: UrbanIndicators }) {
  const { t } = useTranslation();
  const chosen = useProjectStore((s) => s.urbanSettings?.cutExcluded);
  const toggle = (name: string, counted: boolean, byDefault: boolean) => {
    const next = { ...chosen };
    if (counted === byDefault) delete next[name];
    else next[name] = !counted;
    setUrbanSettings({ cutExcluded: Object.keys(next).length ? next : undefined });
  };
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-800" title={t('urban.cutLevel.help')}>
      <span>{t('urban.cutLevels')}</span>
      {result.storeys.map((s) => (
        <label key={s.name} className="flex items-center gap-1">
          <input type="checkbox" checked={s.inCut} onChange={(e) => toggle(s.name, e.target.checked, s.inCutByDefault)} />
          {s.name}
        </label>
      ))}
    </div>
  );
}
