/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One material of the project drawer's Materials section (#90): its swatch, and its hatch, scale, fill, pen and membrane
 * as the project's table holds them. Every control is one `setMaterial`, so one undo step; reset takes the row away.
 */

import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { CategoryLineWeight } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import { resetMaterial, setMaterial, type MaterialGraphics } from '@/project/materials';
import { ColourInput } from './ColourSchemeCard';
import { MaterialSwatchGraphic } from './MaterialSwatchGraphic';
import { WALL_FIELD } from './wall-type';

const field = WALL_FIELD;
const PENS: readonly CategoryLineWeight[] = ['hairline', 'light', 'medium', 'heavy'];
type FillMode = 'ifc' | 'none' | 'own';
const OWN_FILL = '#e8d9b0';

const fillModeOf = (fill: string | null | undefined): FillMode => (fill === undefined ? 'ifc' : fill === null ? 'none' : 'own');

/** A number that is committed when the hand leaves the field or presses Enter, so typing "1.5" is one undo step, not three. */
function ScaleInput({ value, label, onCommit }: { value: number; label: string; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (): void => {
    const v = Number(draft);
    if (Number.isFinite(v) && v > 0) { if (v !== value) onCommit(v); } else setDraft(String(value));
  };
  return (
    <input
      aria-label={label} className={field} type="number" min={0.05} step={0.05} value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
    />
  );
}

export function MaterialRow({ material, patterns, hatchNames }: { material: MaterialGraphics; patterns: readonly HatchPattern[]; hatchNames: readonly string[] }) {
  const { t } = useTranslation();
  const { name, auto } = material;
  const mode = fillModeOf(material.fill);
  const hatch = material.hatch ?? '';
  const names = hatch && !hatchNames.some((n) => n.toUpperCase() === hatch.toUpperCase()) ? [...hatchNames, hatch] : hatchNames;
  return (
    <li className="border-t border-sky-300/10 py-2" data-material={name}>
      <div className="flex items-center gap-2">
        <MaterialSwatchGraphic material={material} patterns={patterns} label={t('wall.materials.swatchOf', { name })} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm text-white" title={name}>{name}</p>
          <p className="m-0 text-2xs text-sky-300">{auto ? t('materials.auto') : t('wall.materials.edited')}</p>
        </div>
        <button
          type="button" disabled={auto} title={t('materials.reset')} aria-label={t('wall.materials.resetOf', { name })} onClick={() => resetMaterial(name)}
          className="rounded p-1 text-sky-200 hover:bg-sky-400/20 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-sky-200">
        <label>
          {t('materials.col.hatch')}
          <select aria-label={t('materials.hatchOf', { name })} className={field} value={hatch} onChange={(e) => setMaterial(name, { hatch: e.target.value || null })}>
            <option value="">{t('materials.noHatch')}</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          {t('materials.col.scale')}
          <ScaleInput value={material.hatchScale ?? 1} label={t('materials.scaleOf', { name })} onCommit={(v) => setMaterial(name, { hatchScale: v })} />
        </label>
        <label>
          {t('materials.col.fill')}
          <div className="flex items-center gap-1">
            <select
              aria-label={t('materials.fillModeOf', { name })} className={field} value={mode}
              onChange={(e) => {
                const next = e.target.value as FillMode;
                setMaterial(name, { fill: next === 'ifc' ? undefined : next === 'none' ? null : typeof material.fill === 'string' ? material.fill : OWN_FILL });
              }}
            >
              <option value="ifc">{t('materials.fill.ifc')}</option>
              <option value="none">{t('materials.fill.none')}</option>
              <option value="own">{t('materials.fill.own')}</option>
            </select>
            {mode === 'own' ? <ColourInput value={material.fill ?? OWN_FILL} label={t('materials.fillOf', { name })} onCommit={(hex) => setMaterial(name, { fill: hex.toLowerCase() })} /> : null}
          </div>
        </label>
        <label>
          {t('materials.col.pen')}
          <select aria-label={t('materials.penOf', { name })} className={field} value={material.hatchPen ?? 'hairline'} onChange={(e) => setMaterial(name, { hatchPen: e.target.value as CategoryLineWeight })}>
            {PENS.map((p) => <option key={p} value={p}>{t(`materials.pen.${p}` as TranslationKey)}</option>)}
          </select>
        </label>
        <label className="col-span-2 flex items-center gap-2">
          <input type="checkbox" aria-label={t('materials.membraneOf', { name })} checked={material.membrane === true} onChange={(e) => setMaterial(name, { membrane: e.target.checked ? true : undefined })} />
          {t('materials.col.membrane')}
        </label>
      </div>
    </li>
  );
}
