/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's "Units and numbers" in the drawer (#88): the length unit of dimensions, the decimal separator, the decimals of
 * each kind of figure and whether thousands are grouped. It writes `unitsAndNumbers` in the project and nothing else; every
 * figure on a sheet, in an export and on the command line reads it from there (`project/units-and-numbers.ts`).
 */

import { useTranslation, type TranslationKey } from '@/i18n';
import { formatDimension } from '@/drafting/styles';
import { formatLevel } from '@/drafting/annotation';
import { setUnitsAndNumbers, useProjectStore } from '@/project/project-store';
import { useSheetLocale } from '@/project/units-and-numbers';
import { LENGTH_UNITS, MAX_DECIMALS, NUMBER_KINDS, sheetNumber, type NumberKind, type UnitsAndNumbers } from '@bimvoice/ifcsheet/names';
import { WALL_FIELD, WALL_PILL } from './wall-type';

const field = WALL_FIELD;
const KIND_LABEL: Record<NumberKind, TranslationKey> = {
  length: 'wall.units.decimals.length', area: 'wall.units.decimals.area', volume: 'wall.units.decimals.volume', level: 'wall.units.decimals.level',
};
const SEPARATORS = ['language', 'comma', 'point'] as const;

export function UnitsAndNumbersForm() {
  const { t } = useTranslation();
  const units = useProjectStore((s) => s.unitsAndNumbers);
  const locale = useSheetLocale();
  const decimals = units?.decimals ?? {};
  const setDecimals = (kind: NumberKind, value: string): void => setUnitsAndNumbers({ decimals: { ...decimals, [kind]: value === '' ? undefined : Number(value) } });
  return (
    <div data-owns-keys>
      <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('wall.units.intro')}</p>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <label className="block text-xs text-sky-200">
          {t('wall.units.lengthUnit')}
          <select data-owns-keys className={field} value={units?.lengthUnit ?? ''} onChange={(e) => setUnitsAndNumbers({ lengthUnit: (e.target.value || undefined) as UnitsAndNumbers['lengthUnit'] })}>
            <option value="">{t('wall.units.lengthUnit.style')}</option>
            {LENGTH_UNITS.map((u) => <option key={u} value={u}>{t(`wall.units.lengthUnit.${u}`)}</option>)}
          </select>
        </label>
        <label className="block text-xs text-sky-200">
          {t('wall.units.separator')}
          <select data-owns-keys className={field} value={units?.separator ?? 'language'} onChange={(e) => setUnitsAndNumbers({ separator: e.target.value === 'language' ? undefined : (e.target.value as 'comma' | 'point') })}>
            {SEPARATORS.map((s) => <option key={s} value={s}>{t(`wall.units.separator.${s}`)}</option>)}
          </select>
        </label>
      </div>
      <h4 className="m-0 mt-3 text-xs font-medium text-sky-100">{t('wall.units.decimals')}</h4>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {NUMBER_KINDS.map((kind) => (
          <label key={kind} className="block text-xs text-sky-200">
            {t(KIND_LABEL[kind])}
            <select data-owns-keys className={field} value={decimals[kind] ?? ''} onChange={(e) => setDecimals(kind, e.target.value)}>
              <option value="">{t('wall.units.decimals.default')}</option>
              {Array.from({ length: MAX_DECIMALS + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-sky-200">
        <input data-owns-keys type="checkbox" checked={units?.group !== false} onChange={(e) => setUnitsAndNumbers({ group: e.target.checked ? undefined : false })} />
        {t('wall.units.group')}
      </label>
      <p className="m-0 mt-2 text-xs text-sky-200">{t('wall.units.fixed')}</p>
      <p className="m-0 mt-1 text-xs tabular-nums text-sky-100">
        {t('wall.units.example', {
          length: formatDimension(locale, 3.5, { unit: 'mm', precision: 0 }),
          area: sheetNumber(locale, 1234.5, 2, { kind: 'area' }),
          level: formatLevel(locale, 2.7),
        })}
      </p>
      <p className="m-0 mt-2 text-xs leading-relaxed text-sky-300">{t('wall.units.exports')}</p>
      <button type="button" className={`${WALL_PILL} mt-2 disabled:opacity-40`} disabled={units === undefined} onClick={() => setUnitsAndNumbers({ lengthUnit: undefined, decimals: undefined, separator: undefined, group: undefined })}>{t('wall.units.reset')}</button>
    </div>
  );
}
