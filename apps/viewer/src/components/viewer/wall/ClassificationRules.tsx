/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rules of one classification mapping (#89), in the project drawer: the classes, types and materials of the loaded models with the code the
 * office gives each, the ones with no code marked, and one code for every type of a class at once. A code typed here is the office's; the model's
 * own IfcClassificationReference still wins where an element carries one (`classificationOf`).
 */

import { useMemo, useState } from 'react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { assignClassificationCode, classificationRuleOf, setClassificationRule } from '@/classification/classification-actions';
import { modelItems } from '@/classification/classification-items';
import { useViewerStore } from '@/store';
import { matchKey, type ClassificationBy, type ClassificationMapping } from '@bimvoice/ifcsheet';
import { libraryAction } from './library-style';
import { WALL_FIELD } from './wall-type';

const KIND_KEYS = { class: 'class.by.class', type: 'class.by.type', material: 'class.by.material' } as const satisfies Record<ClassificationBy, TranslationKey>;
const SMALL = `${WALL_FIELD} !mt-0 !py-0.5 !text-xs`;

/** The names a kind lists: what the models hold, then the rules whose target the models no longer hold. */
function namesOf(mapping: ClassificationMapping, by: ClassificationBy, present: string[]): { name: string; inModel: boolean }[] {
  const seen = new Set(present.map((n) => matchKey(by, n)));
  const extra = mapping.rules.filter((r) => r.by === by && !seen.has(matchKey(by, r.match))).map((r) => r.match);
  return [...present.map((name) => ({ name, inModel: true })), ...extra.map((name) => ({ name, inModel: false }))];
}

function RuleRow({ mapping, by, name, inModel }: { mapping: ClassificationMapping; by: ClassificationBy; name: string; inModel: boolean }) {
  const { t } = useTranslation();
  const rule = classificationRuleOf(mapping, by, name);
  const set = (code: string, title: string) => setClassificationRule(mapping.id, by, name, code, title);
  const unmapped = !rule && inModel;
  return (
    <li data-unmapped={unmapped ? '' : undefined} className={`border-l-2 py-1.5 pl-2 ${unmapped ? 'border-amber-300 bg-amber-300/10' : 'border-transparent'}`}>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-sky-50" title={name}>{name}</span>
        {unmapped ? <span className="shrink-0 text-2xs uppercase tracking-wider text-amber-200">{t('class.unmapped')}</span> : null}
      </div>
      <div className="mt-1 flex gap-1.5">
        <input
          key={`${mapping.id}:${by}:${name}:code:${rule?.code ?? ''}`} aria-label={t('class.codeOf', { name })} defaultValue={rule?.code ?? ''} placeholder={t('class.code')} className={`${SMALL} !w-32 shrink-0`}
          onBlur={(e) => { if (e.target.value.trim() !== (rule?.code ?? '')) set(e.target.value, rule?.title ?? ''); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <input
          key={`${mapping.id}:${by}:${name}:title:${rule?.title ?? ''}`} aria-label={t('class.titleOf', { name })} defaultValue={rule?.title ?? ''} placeholder={t('class.titleField')} disabled={!rule} className={`${SMALL} min-w-0 flex-1`}
          onBlur={(e) => { if (rule && e.target.value.trim() !== rule.title) set(rule.code, e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </div>
    </li>
  );
}

/** One code for every type of an IFC class. */
function BulkByClass({ mapping, types }: { mapping: ClassificationMapping; types: { name: string; className: string }[] }) {
  const { t } = useTranslation();
  const classes = [...new Set(types.map((x) => x.className))].sort((a, b) => a.localeCompare(b));
  const [className, setClassName] = useState('');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const chosen = classes.includes(className) ? className : classes[0] ?? '';
  const names = types.filter((x) => x.className === chosen).map((x) => x.name);
  if (classes.length === 0) return null;
  return (
    <div className="mt-2 rounded border border-sky-300/20 p-2">
      <p className="m-0 text-xs text-sky-100">{t('class.bulk.title')}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <select aria-label={t('class.bulk.class')} className={SMALL} value={chosen} onChange={(e) => setClassName(e.target.value)}>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input aria-label={t('class.bulk.code')} placeholder={t('class.code')} value={code} onChange={(e) => setCode(e.target.value)} className={`${SMALL} !w-32 shrink-0`} />
        <input aria-label={t('class.bulk.titleField')} placeholder={t('class.titleField')} value={title} onChange={(e) => setTitle(e.target.value)} className={`${SMALL} min-w-0 flex-1`} />
      </div>
      <div className="mt-1.5">
        <button type="button" className={libraryAction} disabled={code.trim() === '' || names.length === 0} onClick={() => { assignClassificationCode(mapping.id, 'type', names, code, title); setCode(''); setTitle(''); }}>
          {t('class.bulk.apply', { count: names.length })}
        </button>
      </div>
    </div>
  );
}

export function ClassificationRules({ mapping }: { mapping: ClassificationMapping }) {
  const { t } = useTranslation();
  const models = useViewerStore((s) => s.models);
  const items = useMemo(() => modelItems(), [models]); // eslint-disable-line react-hooks/exhaustive-deps
  const [by, setBy] = useState<ClassificationBy>('type');
  const present = by === 'class' ? items.classes : by === 'type' ? items.types.map((x) => x.name) : items.materials;
  const rows = namesOf(mapping, by, present);
  const missing = rows.filter((r) => r.inModel && !classificationRuleOf(mapping, by, r.name)).length;
  const empty = items.classes.length + items.types.length + items.materials.length === 0;
  return (
    <div className="mt-2">
      <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
        <legend className="sr-only">{t('class.by')}</legend>
        {(['class', 'type', 'material'] as const).map((k) => <button key={k} type="button" className={libraryAction} aria-pressed={by === k} onClick={() => setBy(k)}>{t(KIND_KEYS[k])}</button>)}
      </fieldset>
      {empty ? <p className="m-0 mt-2 text-xs text-sky-200">{t('class.noModel')}</p> : (
        <p className="m-0 mt-2 text-xs text-sky-200">{missing === 0 ? t('class.allMapped') : t('class.someUnmapped', { count: missing, total: present.length })}</p>
      )}
      {by === 'type' ? <BulkByClass mapping={mapping} types={items.types} /> : null}
      <ul className="m-0 mt-2 max-h-96 list-none overflow-y-auto p-0">
        {rows.map((r) => <RuleRow key={`${by}:${r.name}`} mapping={mapping} by={by} name={r.name} inModel={r.inModel} />)}
      </ul>
    </div>
  );
}
