/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The fields of a parametric label type: the template, its frame and the
 * placeholder for a missing value, with a picker that lists what the selected
 * model element actually has (attributes, property sets, quantity sets, its
 * type's) so nothing is typed from memory, and a preview of the result.
 */

import { useMemo, useRef } from 'react';
import { useTranslation, type TranslationKey } from '@/i18n';
import type { LabelSpec } from '@/catalogue/types';
import { TEXT_FRAMES } from '@/drafting/text-block';
import { listFields } from '@/labels/label-fields';
import { labelElementOf } from '@/labels/label-element';
import { MISSING_MODES, resolveTemplate } from '@/labels/label-resolve';
import { parseTemplate } from '@/labels/label-template';
import { useViewerStore } from '@/store';

const INPUT = 'h-7 w-40 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';

export function LabelTypeFields({ label, onChange }: { label: LabelSpec; onChange: (next: LabelSpec) => void }) {
  const { t } = useTranslation();
  const area = useRef<HTMLTextAreaElement>(null);
  const selected = useViewerStore((s) => s.selectedEntity);
  // Re-read when the model changes, so an edited property shows its new value here too.
  const version = useViewerStore((s) => s.mutationVersion);
  const element = useMemo(() => (selected ? labelElementOf(selected.modelId, selected.expressId) : null), [selected, version]);
  const groups = useMemo(() => (element ? listFields(element) : []), [element]);
  const parsed = useMemo(() => parseTemplate(label.template), [label.template]);
  const preview = element ? resolveTemplate(parsed, element, label.missing) : null;

  const insert = (token: string) => {
    const el = area.current;
    const [from, to] = el ? [el.selectionStart, el.selectionEnd] : [label.template.length, label.template.length];
    onChange({ ...label, template: label.template.slice(0, from) + token + label.template.slice(to) });
  };

  return (
    <div className="space-y-1">
      <label className="block text-zinc-500">{t('label.template')}</label>
      <textarea
        ref={area} aria-label={t('label.template')} rows={3} spellCheck={false} key={label.template}
        className="w-full rounded-sm border border-zinc-300 bg-transparent p-1 font-mono text-xs dark:border-zinc-700" defaultValue={label.template}
        onBlur={(e) => e.target.value !== label.template && onChange({ ...label, template: e.target.value })}
      />
      {parsed.issues.length > 0 ? <p role="alert" className="text-amber-600">{t('label.issues', { text: parsed.issues.map((i) => i.text).join(' ') })}</p> : null}
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span className="text-zinc-500">{t('label.frame')}</span>
        <select aria-label={t('label.frame')} className={INPUT} value={label.frame ?? ''} onChange={(e) => onChange({ template: label.template, missing: label.missing, ...(e.target.value ? { frame: e.target.value as (typeof TEXT_FRAMES)[number] } : {}) })}>
          <option value="">{t('label.frame.none')}</option>
          {TEXT_FRAMES.map((f) => <option key={f} value={f}>{t(`label.frame.${f}` as TranslationKey)}</option>)}
        </select>
      </div>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span className="text-zinc-500">{t('label.missing')}</span>
        <select aria-label={t('label.missing')} className={INPUT} value={label.missing} onChange={(e) => onChange({ ...label, missing: e.target.value as LabelSpec['missing'] })}>
          {MISSING_MODES.map((m) => <option key={m} value={m}>{t(`label.missing.${m}` as TranslationKey)}</option>)}
        </select>
      </div>
      <div className="rounded-sm border border-zinc-200 p-1 dark:border-zinc-800">
        <p className="mb-1 text-zinc-500">{t('label.fields')}</p>
        {!element ? <p className="text-zinc-500">{t('label.pickHint')}</p> : (
          <>
            <pre aria-label={t('label.preview')} className="mb-1 whitespace-pre-wrap rounded-sm bg-zinc-100 p-1 dark:bg-zinc-900">{preview}</pre>
            <div className="max-h-48 space-y-1 overflow-auto">
              {groups.map((g) => (
                <div key={`${g.id}:${g.title ?? ''}`}>
                  <p className="font-medium">{g.title ?? t('label.group.element')}{g.id === 'type' ? ` · ${t('label.group.type')}` : g.id === 'quantities' ? ` · ${t('label.group.quantities')}` : ''}</p>
                  <ul>
                    {g.fields.map((f) => (
                      <li key={f.token}>
                        <button type="button" className="flex w-full items-center justify-between gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-primary/10" title={f.token} onClick={() => insert(f.token)}>
                          <span className="truncate">{f.label}</span><span className="truncate text-zinc-500">{f.sample}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
