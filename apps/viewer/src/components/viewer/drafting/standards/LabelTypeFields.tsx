/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The fields of a parametric label type: the template, its frame, its leader,
 * the leader's end and the clear space round it, and the placeholder for a missing value, with a picker that lists what the selected
 * model element actually has (attributes, property sets, quantity sets, its
 * type's) so nothing is typed from memory, and a preview of the result.
 */

import { useMemo, useRef } from 'react';
import { useTranslation, type TranslationKey } from '@/i18n';
import type { LabelSpec } from '@/catalogue/types';
import { TEXT_FRAMES, asTextFrame } from '@/drafting/text-block';
import { FRAMED_CLASSES, type FramedClass } from '@bimvoice/ifcsheet';
import { listFields } from '@/labels/label-fields';
import { DEFAULT_LEADER, LABEL_GAP_MAX_MM, LABEL_GAP_MM, LEADER_ENDS, LEADER_MODES, type LeaderEnd, type LeaderMode } from '@bimvoice/ifcsheet';
import { labelElementOf } from '@/labels/label-element';
import { MISSING_MODES, resolveTemplate } from '@bimvoice/ifcsheet';
import { parseTemplate } from '@bimvoice/ifcsheet';
import { useViewerStore } from '@/store';

const INPUT = 'h-7 w-40 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';

/** The gap typed (paper millimetres), held between 0 and the largest; the standard one is none. Not a number keeps what was there. */
function gapOf(typed: string, was: number | undefined): number | undefined {
  const n = Number(typed.replace(',', '.'));
  if (typed.trim() === '' || !Number.isFinite(n)) return was;
  const gap = Math.min(LABEL_GAP_MAX_MM, Math.max(0, n));
  return gap === LABEL_GAP_MM ? undefined : gap;
}

/** `label` with a door's or a window's own frame set to `chosen` ('' clears it); a label left with no class frame stores none. */
function withClassFrame(label: LabelSpec, c: FramedClass, chosen: string): LabelSpec {
  const { classFrames: was, ...rest } = label;
  const { [c]: _old, ...others } = was ?? {};
  const frame = chosen === 'none' ? 'none' : asTextFrame(chosen);
  const next: NonNullable<LabelSpec['classFrames']> = frame ? { ...others, [c]: frame } : others;
  return Object.keys(next).length ? { ...rest, classFrames: next } : rest;
}

export function LabelTypeFields({ label, onChange }: { label: LabelSpec; onChange: (next: LabelSpec) => void }) {
  const { t, locale } = useTranslation();
  const area = useRef<HTMLTextAreaElement>(null);
  const selected = useViewerStore((s) => s.selectedEntity);
  // Re-read when the model changes, so an edited property shows its new value here too.
  const version = useViewerStore((s) => s.mutationVersion);
  const element = useMemo(() => (selected ? labelElementOf(selected.modelId, selected.expressId) : null), [selected, version]);
  const groups = useMemo(() => (element ? listFields(element) : []), [element]);
  const parsed = useMemo(() => parseTemplate(label.template), [label.template]);
  const preview = element ? resolveTemplate(parsed, element, locale, label.missing) : null;

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
        <select aria-label={t('label.frame')} className={INPUT} value={label.frame ?? ''} onChange={(e) => { const { frame: _old, ...rest } = label; onChange({ ...rest, ...(e.target.value ? { frame: e.target.value as (typeof TEXT_FRAMES)[number] } : {}) }); }}>
          <option value="">{t('label.frame.none')}</option>
          {TEXT_FRAMES.map((f) => <option key={f} value={f}>{t(`label.frame.${f}` as TranslationKey)}</option>)}
        </select>
      </div>
      {/* A door's and a window's own frame (#924): absent, the frame above, so a type that never chose draws what it drew. */}
      {FRAMED_CLASSES.map((c) => (
        <div key={c} className="flex min-h-8 items-center justify-between gap-3">
          <span className="text-zinc-500" title={t('label.classFrame.hint')}>{t(`label.classFrame.${c}`)}</span>
          <select aria-label={t(`label.classFrame.${c}`)} title={t('label.classFrame.hint')} className={INPUT} value={label.classFrames?.[c] ?? ''} onChange={(e) => onChange(withClassFrame(label, c, e.target.value))}>
            <option value="">{t('label.classFrame.same')}</option>
            <option value="none">{t('label.frame.none')}</option>
            {TEXT_FRAMES.map((f) => <option key={f} value={f}>{t(`label.frame.${f}` as TranslationKey)}</option>)}
          </select>
        </div>
      ))}
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span className="text-zinc-500">{t('label.leader')}</span>
        <select aria-label={t('label.leader')} className={INPUT} value={label.leader ?? DEFAULT_LEADER} onChange={(e) => onChange({ ...label, leader: e.target.value as LeaderMode })}>
          {LEADER_MODES.map((m) => <option key={m} value={m}>{t(`label.leader.${m}` as TranslationKey)}</option>)}
        </select>
      </div>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span className="text-zinc-500">{t('label.leaderEnd')}</span>
        {/* The arrow is the absence of the field (#842), so a type that never chose keeps drawing what it drew. */}
        <select aria-label={t('label.leaderEnd')} className={INPUT} value={label.leaderEnd ?? 'arrow'} onChange={(e) => { const { leaderEnd: _old, ...rest } = label; const end = e.target.value as LeaderEnd; onChange(end === 'arrow' ? rest : { ...rest, leaderEnd: end }); }}>
          {LEADER_ENDS.map((m) => <option key={m} value={m}>{t(`label.leaderEnd.${m}` as TranslationKey)}</option>)}
        </select>
      </div>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span className="text-zinc-500" title={t('label.gap.hint')}>{t('label.gap')}</span>
        {/* The standard gap is the absence of the field (#842), so a type that never chose keeps its spacing. Taken on leaving the field. */}
        <input
          type="number" aria-label={t('label.gap')} title={t('label.gap.hint')} className={`${INPUT} text-right tabular-nums`} min={0} max={LABEL_GAP_MAX_MM} step={0.5}
          key={label.gap ?? LABEL_GAP_MM} defaultValue={label.gap ?? LABEL_GAP_MM}
          onBlur={(e) => { const next = gapOf(e.target.value, label.gap); e.target.value = String(next ?? LABEL_GAP_MM); if (next !== label.gap) { const { gap: _old, ...rest } = label; onChange(next === undefined ? rest : { ...rest, gap: next }); } }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
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
