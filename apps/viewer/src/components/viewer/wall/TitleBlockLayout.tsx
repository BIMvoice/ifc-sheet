/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Editing the title block's layout from the project drawer (#143): the lines,
 * rectangles, texts and logo frame as rows of numbers, in millimetres from
 * the block's top-left corner. A value that would draw nothing sensible is
 * refused and shown as such; the item keeps what it had.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { useGraphicStandard } from '@/project/graphic-standard-actions';
import { addTemplateItem, clearTemplateFit, customiseTitleBlock, removeTemplateItem, resetTitleBlockTemplate, setTemplateField, applyRomanianTitleBlock } from '@/project/title-block-template-actions';
import { standardTitleBlock, type TemplateItem } from '@/project/title-block-template';
import { romanianTitleBlock } from '@/project/title-block-ro';
import { TitleBlockImport } from './TitleBlockImport';
import { WALL_PILL } from './wall-type';

const quiet = WALL_PILL;
const small = 'w-full rounded border border-sky-300/30 bg-[#061a36] px-1.5 py-1 text-xs text-white';

const NUMBER_FIELDS: Record<TemplateItem['kind'], readonly string[]> = {
  line: ['x1', 'y1', 'x2', 'y2', 'weight'],
  rect: ['x', 'y', 'w', 'h', 'weight'],
  text: ['x', 'y', 'size'],
  logo: ['x', 'y', 'w', 'h'],
};
const KIND_LABEL: Record<TemplateItem['kind'], TranslationKey> = {
  line: 'tblayout.kind.line', rect: 'tblayout.kind.rect', text: 'tblayout.kind.text', logo: 'tblayout.kind.logo',
};
const FIELD_LABEL = (field: string): TranslationKey => `tblayout.field.${field}` as TranslationKey;

function ItemRow({ item, label }: { item: TemplateItem; label: string }) {
  const { t } = useTranslation();
  const [bad, setBad] = useState(false);
  const commit = (field: string, raw: string): void => setBad(!setTemplateField(item.id, field, raw));
  const value = (field: string): number => (item as unknown as Record<string, number>)[field] ?? 0;
  return (
    <li className="mt-2 rounded-lg border border-sky-300/15 p-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-sky-100">{label}</span>
        <button type="button" aria-label={t('tblayout.remove', { item: label })} onClick={() => removeTemplateItem(item.id)} className="rounded p-1 text-sky-200 hover:bg-sky-400/20">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {NUMBER_FIELDS[item.kind].map((field) => (
          <label key={field} className="block text-2xs text-sky-200">
            {t(FIELD_LABEL(field))}
            <input
              key={`${item.id}:${field}:${value(field)}`}
              aria-label={`${label}: ${t(FIELD_LABEL(field))}`}
              aria-invalid={bad ? true : undefined}
              inputMode="decimal"
              className={small}
              defaultValue={value(field)}
              data-owns-keys
              onBlur={(e) => commit(field, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </label>
        ))}
        {item.kind === 'text' ? (
          <label className="block text-2xs text-sky-200">
            {t('tblayout.field.fit')}
            <input
              key={`${item.id}:fit:${item.fit ?? ''}`}
              aria-label={`${label}: ${t('tblayout.field.fit')}`}
              aria-invalid={bad ? true : undefined}
              inputMode="decimal"
              className={small}
              defaultValue={item.fit ?? ''}
              data-owns-keys
              onBlur={(e) => { if (e.target.value.trim() === '') clearTemplateFit(item.id); else commit('fit', e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </label>
        ) : null}
      </div>
      {item.kind === 'text' ? (
        <>
          <label className="mt-1.5 block text-2xs text-sky-200">
            {t('tblayout.field.text')}
            <input
              key={`${item.id}:text:${item.text}`}
              aria-label={`${label}: ${t('tblayout.field.text')}`}
              className={small}
              defaultValue={item.text}
              data-owns-keys
              onBlur={(e) => { if (e.target.value !== item.text) commit('text', e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </label>
          <div className="mt-1.5 flex gap-3 text-2xs text-sky-200">
            {(['bold', 'muted'] as const).map((flag) => (
              <label key={flag} className="flex items-center gap-1">
                <input type="checkbox" checked={item[flag] === true} onChange={(e) => setTemplateField(item.id, flag, e.target.checked)} />
                {t(FIELD_LABEL(flag))}
              </label>
            ))}
          </div>
        </>
      ) : null}
      {bad ? <p role="alert" className="m-0 mt-1 text-xs text-amber-300">{t('tblayout.invalid')}</p> : null}
    </li>
  );
}

export function TitleBlockLayout() {
  const { t } = useTranslation();
  const standard = useGraphicStandard();
  const template = useProjectStore((s) => s.titleBlockTemplate);
  const [asking, setAsking] = useState(false);
  const counts: Partial<Record<TemplateItem['kind'], number>> = {};
  return (
    <section aria-label={t('tblayout.title')} className="mt-4 border-t border-sky-300/10 pt-3">
      <h4 className="m-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('tblayout.title')}</h4>
      <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('tblayout.intro')}</p>
      <button type="button" className={`${quiet} mt-2`} onClick={() => applyRomanianTitleBlock(romanianTitleBlock(t, standard))}>{t('tblayout.useRo')}</button>
      <p className="m-0 mt-1 text-xs leading-relaxed text-sky-200/80">{t('tblayout.roHint')}</p>
      <TitleBlockImport />
      {!template ? (
        <button type="button" className={`${quiet} mt-2`} onClick={() => customiseTitleBlock(standardTitleBlock(t, standard))}>{t('tblayout.edit')}</button>
      ) : (
        <>
          <p className="m-0 mt-1 text-xs text-sky-200/80">{t('tblayout.unit')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['line', 'rect', 'text', 'logo'] as const).map((kind) => (
              <button key={kind} type="button" className={quiet} onClick={() => addTemplateItem(kind)}>{t(`tblayout.add.${kind}` as TranslationKey)}</button>
            ))}
          </div>
          <ul className="m-0 list-none p-0">
            {template.items.map((item) => {
              counts[item.kind] = (counts[item.kind] ?? 0) + 1;
              return <ItemRow key={item.id} item={item} label={t('tblayout.item', { kind: t(KIND_LABEL[item.kind]), n: counts[item.kind] ?? 1 })} />;
            })}
          </ul>
          {asking ? (
            <fieldset className="m-0 mt-3 flex flex-wrap items-center gap-2 border-0 p-0 text-xs text-sky-100">
              <legend className="sr-only">{t('tblayout.resetSure')}</legend>
              {t('tblayout.resetSure')}
              <button type="button" className={quiet} onClick={() => { resetTitleBlockTemplate(); setAsking(false); }}>{t('tblayout.resetYes')}</button>
              <button type="button" className={quiet} onClick={() => setAsking(false)}>{t('tblayout.resetNo')}</button>
            </fieldset>
          ) : (
            <button type="button" className={`${quiet} mt-3`} onClick={() => setAsking(true)}>{t('tblayout.reset')}</button>
          )}
        </>
      )}
    </section>
  );
}
