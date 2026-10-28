/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The classification mappings of the project, in the drawer (#89): the systems the office works in (Uniclass, OmniClass, its own), the codes it gives
 * the model's classes, types and materials (`ClassificationRules`), and a CSV import for a table it already has. IfcSheet ships no code table:
 * Uniclass and OmniClass are licensed, so the codes are the office's. The panel keeps its keys (`data-owns-keys`) like the other drawer forms.
 */

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import {
  addClassificationMapping, importClassificationCsv, removeClassificationMapping, renameClassificationSystem, useClassificationOnTags, type ClassificationImportReport,
} from '@/classification/classification-actions';
import { useProjectStore } from '@/project/project-store';
import { systemLabel, type ClassificationProblem } from '@bimvoice/ifcsheet';
import { ClassificationRules } from './ClassificationRules';
import { libraryAction } from './library-style';
import { WALL_FIELD } from './wall-type';

/** Systems the name field suggests: names only, no codes. */
const SYSTEM_NAMES = ['Uniclass', 'OmniClass'];
const SMALL = `${WALL_FIELD} !mt-0 !py-0.5 !text-xs`;

/** A refused row in words: the row number and the reason. */
export function problemText(p: ClassificationProblem, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string {
  return p.row === 0 ? t(`class.problem.${p.kind}` as TranslationKey) : t('class.import.row', { row: p.row, reason: t(`class.problem.${p.kind}` as TranslationKey, { value: p.detail ?? '' }) });
}

function ImportCsv({ id }: { id: string }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<ClassificationImportReport | null>(null);
  return (
    <div className="mt-2">
      <button type="button" className={libraryAction} onClick={() => input.current?.click()}>{t('class.import')}</button>
      <input
        ref={input} type="file" accept=".csv,text/csv" className="hidden" aria-label={t('class.import.file')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void file.text().then((text) => setReport(importClassificationCsv(id, text)));
        }}
      />
      <p className="m-0 mt-1 text-2xs leading-relaxed text-sky-300">{t('class.import.hint')}</p>
      {report ? (
        <output className="mt-1 block text-xs">
          <p className="m-0 text-sky-100">{t('class.import.done', { count: report.imported })}</p>
          {report.problems.length > 0 ? (
            <>
              <p className="m-0 mt-1 text-amber-200">{t('class.import.skipped', { count: report.problems.length })}</p>
              <ul className="m-0 mt-0.5 list-disc pl-4 text-amber-100">{report.problems.map((p, i) => <li key={i}>{problemText(p, t)}</li>)}</ul>
            </>
          ) : null}
        </output>
      ) : null}
    </div>
  );
}

export function ClassificationPanel() {
  const { t } = useTranslation();
  const mappings = useProjectStore((s) => s.classificationMappings) ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [edition, setEdition] = useState('');
  const current = mappings.find((m) => m.id === chosen) ?? mappings[0];
  const add = () => {
    if (name.trim() === '') return;
    setChosen(addClassificationMapping(name, edition));
    setName('');
    setEdition('');
  };
  return (
    <details className="border-t border-sky-300/10 px-4 py-3" data-owns-keys>
      <summary className="cursor-pointer text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('class.title')}</summary>
      <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('class.hint')}</p>
      <p className="m-0 mt-1 text-xs leading-relaxed text-sky-300">{t('class.rule')}</p>
      <ul className="m-0 mt-2 list-none p-0">
        {mappings.map((m, i) => (
          <li key={m.id} className="flex items-center gap-1.5 py-0.5">
            <button type="button" className={libraryAction} aria-pressed={m.id === current?.id} onClick={() => setChosen(m.id)}>{systemLabel(m.system)}</button>
            <span className="text-2xs text-sky-300">{t('class.rules', { count: m.rules.length })}</span>
            {i === 0 ? <span className="text-2xs uppercase tracking-wider text-cyan-300">{t('class.onTags')}</span> : (
              <button type="button" className="text-2xs text-sky-200 underline hover:text-white" onClick={() => useClassificationOnTags(m.id)}>{t('class.useOnTags')}</button>
            )}
            <button type="button" aria-label={t('class.remove', { name: systemLabel(m.system) })} onClick={() => removeClassificationMapping(m.id)} className="ml-auto rounded p-1 text-sky-200 hover:bg-sky-400/20"><X className="size-3.5" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input aria-label={t('class.new')} list="class-system-names" placeholder={t('class.new')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} className={`${SMALL} !w-32`} />
        <datalist id="class-system-names">{SYSTEM_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}</datalist>
        <input aria-label={t('class.newEdition')} placeholder={t('class.edition')} value={edition} onChange={(e) => setEdition(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} className={`${SMALL} !w-20`} />
        <button type="button" className={libraryAction} disabled={name.trim() === ''} onClick={add}>{t('class.add')}</button>
      </div>
      {current ? (
        <div className="mt-3 border-t border-sky-300/10 pt-2" key={current.id}>
          <div className="flex flex-wrap items-center gap-1.5">
            <input aria-label={t('class.system')} defaultValue={current.system.name} className={`${SMALL} !w-32`} onBlur={(e) => renameClassificationSystem(current.id, e.target.value, current.system.edition ?? '')} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            <input aria-label={t('class.edition')} defaultValue={current.system.edition ?? ''} className={`${SMALL} !w-20`} onBlur={(e) => renameClassificationSystem(current.id, current.system.name, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          </div>
          <ClassificationRules mapping={current} />
          <ImportCsv id={current.id} />
        </div>
      ) : <p className="m-0 mt-2 text-xs text-sky-200">{t('class.empty')}</p>}
    </details>
  );
}
