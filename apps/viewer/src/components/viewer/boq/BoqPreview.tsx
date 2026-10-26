/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The totals per article (#75), as the XLSX and the sheet print them: the engine's `boqTable`, Nr. crt., code, description, unit and quantity, with the
 * rows per type when the schedule asks and what was refused or left out under it.
 */

import { boqTable } from '@bimvoice/ifcsheet';
import { sheetNumber } from '@bimvoice/ifcsheet/names';
import { useTranslation } from '@/i18n';
import { useSheetLocale } from '@/project/units-and-numbers';
import type { ProjectSchedule } from '@/project/types';
import { useBoqResult, useBoqSay } from './useBoq';

export function BoqPreview({ schedule }: { schedule: ProjectSchedule | undefined }) {
  const { t } = useTranslation();
  // The language with the project's "Units and numbers" (#88): the figures are written as every other sheet's are.
  const locale = useSheetLocale();
  const say = useBoqSay();
  const result = useBoqResult();
  if (result.lines.length === 0) return <p className="m-0 text-sm text-sky-200">{t('boq.preview.empty')}</p>;
  const table = boqTable(result, say, { detail: schedule?.detail === true });
  const bold = new Set(table.bold);
  return (
    <section aria-label={t('boq.preview.title')}>
      <h3 className="m-0 mb-2 text-sm font-medium text-white">{t('boq.preview.title')}</h3>
      <table className="w-full border-collapse text-left text-sm text-sky-100">
        <thead>
          <tr className="border-b border-sky-300/30 text-xs text-sky-200">
            {table.header.map((h, c) => <th key={h} scope="col" className={`px-2 py-1 font-medium ${c === 0 || c === 4 ? 'text-right' : ''}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className={`border-b border-sky-300/10 ${bold.has(i) || !table.bold.length ? '' : 'text-sky-300'}`}>
              {row.map((v, c) => (
                <td key={c} className={`px-2 py-1 ${c === 0 || c === 4 ? 'text-right tabular-nums' : ''} ${bold.has(i) ? 'font-medium' : ''}`}>
                  {typeof v === 'number' && c === 4 ? sheetNumber(locale, v) : v === null ? '–' : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.notes.length > 0 ? <ul className="m-0 mt-2 list-none p-0 text-xs text-amber-200">{table.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
    </section>
  );
}
