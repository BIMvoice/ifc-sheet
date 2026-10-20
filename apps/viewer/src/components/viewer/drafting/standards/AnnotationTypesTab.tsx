/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotation types: named presets of the annotation tools. The list on the
 * left (draw with it, duplicate, delete), the selected type's fields on the
 * right; a new type is captured from the settings in force now.
 */

import { useState } from 'react';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { addAnnotationTypeFromCurrent, duplicateAnnotationType, removeAnnotationType, updateAnnotationType, useAnnotationType } from '@/catalogue/annotation-type-actions';
import { ANNOTATION_TOOLS, DEFAULT_LABEL, TAG_FIELDS, type AnnotationTool, type AnnotationType } from '@/catalogue/types';
import { builtInPatterns } from '@/drafting/hatch/library';
import { parsePat } from '@/drafting/hatch/pattern';
import { useProjectStore } from '@/project/project-store';
import { closeStandards } from '@/project/standards-dialog-store';
import { LabelTypeFields } from './LabelTypeFields';

const INPUT = 'h-7 w-40 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

function Num({ label, value, step = 0.1, min = 0, onCommit }: { label: string; value: number; step?: number; min?: number; onCommit: (v: number) => void }) {
  return (
    <input type="number" aria-label={label} className={`${INPUT} text-right tabular-nums`} min={min} step={step} defaultValue={value} key={value}
      onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= min && v !== value) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

function Editor({ type }: { type: AnnotationType }) {
  const { t } = useTranslation();
  const textStyles = useProjectStore((s) => s.textStyles) ?? [];
  const dimStyles = useProjectStore((s) => s.dimStyles) ?? [];
  const layers = useProjectStore((s) => s.draftLayers);
  const patterns = [...builtInPatterns(), ...parsePat(useProjectStore((s) => s.hatchPatterns) ?? '').patterns].map((p) => p.name);
  const set = (patch: Partial<Omit<AnnotationType, 'id'>>) => updateAnnotationType(type.id, patch);
  const dimensional = type.tool.startsWith('dim');
  const axis = type.axis ?? { bubble: 'circle' as const, ends: 'both' as const, size: null, lineType: 'dashdot' as const };
  const hatch = type.hatch ?? { pattern: 'LINES45', scale: 1, angle: 0 };
  return (
    <div className="flex-1 space-y-1">
      <Row label={t('atype.name')}>
        <input aria-label={t('atype.name')} className={INPUT} defaultValue={type.name} key={type.id + type.name} onBlur={(e) => e.target.value.trim() && set({ name: e.target.value.trim() })} />
      </Row>
      <Row label={t('atype.tool')}>
        <select aria-label={t('atype.tool')} className={INPUT} value={type.tool} onChange={(e) => set({ tool: e.target.value as AnnotationTool })}>
          {ANNOTATION_TOOLS.map((tool) => <option key={tool} value={tool}>{t(`atype.tool.${tool}` as TranslationKey)}</option>)}
        </select>
      </Row>
      {dimensional ? (
        <Row label={t('atype.dimStyle')}>
          <select aria-label={t('atype.dimStyle')} className={INPUT} value={type.dimStyle ?? ''} onChange={(e) => set({ dimStyle: e.target.value || undefined })}>
            {dimStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Row>
      ) : (
        <Row label={t('atype.textStyle')}>
          <select aria-label={t('atype.textStyle')} className={INPUT} value={type.textStyle ?? ''} onChange={(e) => set({ textStyle: e.target.value || undefined })}>
            {textStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Row>
      )}
      <Row label={t('atype.layer')}>
        <select aria-label={t('atype.layer')} className={INPUT} value={type.layer ?? ''} onChange={(e) => set({ layer: e.target.value || undefined })}>
          <option value="">{t('atype.layerNone')}</option>
          {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Row>
      {type.tool === 'axis' ? (
        <>
          <Row label={t('atype.axis.bubble')}>
            <select aria-label={t('atype.axis.bubble')} className={INPUT} value={axis.bubble} onChange={(e) => set({ axis: { ...axis, bubble: e.target.value as typeof axis.bubble } })}>
              {(['circle', 'square'] as const).map((b) => <option key={b} value={b}>{t(`atype.axis.bubble.${b}` as TranslationKey)}</option>)}
            </select>
          </Row>
          <Row label={t('atype.axis.ends')}>
            <select aria-label={t('atype.axis.ends')} className={INPUT} value={axis.ends} onChange={(e) => set({ axis: { ...axis, ends: e.target.value as typeof axis.ends } })}>
              {(['both', 'start', 'end', 'none'] as const).map((b) => <option key={b} value={b}>{t(`atype.axis.ends.${b}` as TranslationKey)}</option>)}
            </select>
          </Row>
          <Row label={t('atype.axis.size')}>
            <Num label={t('atype.axis.size')} value={axis.size ?? 0} onCommit={(size) => set({ axis: { ...axis, size: size > 0 ? size : null } })} />
          </Row>
          <Row label={t('atype.axis.lineType')}>
            <select aria-label={t('atype.axis.lineType')} className={INPUT} value={axis.lineType} onChange={(e) => set({ axis: { ...axis, lineType: e.target.value as typeof axis.lineType } })}>
              {(['continuous', 'dashed', 'dotted', 'dashdot'] as const).map((b) => <option key={b} value={b}>{t(`atype.line.${b}` as TranslationKey)}</option>)}
            </select>
          </Row>
        </>
      ) : null}
      {type.tool === 'hatch' ? (
        <>
          <Row label={t('atype.hatch.pattern')}>
            <select aria-label={t('atype.hatch.pattern')} className={INPUT} value={hatch.pattern} onChange={(e) => set({ hatch: { ...hatch, pattern: e.target.value } })}>
              {patterns.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Row>
          <Row label={t('atype.hatch.scale')}><Num label={t('atype.hatch.scale')} value={hatch.scale} min={0.01} onCommit={(scale) => set({ hatch: { ...hatch, scale } })} /></Row>
          <Row label={t('atype.hatch.angle')}><Num label={t('atype.hatch.angle')} value={hatch.angle} step={5} min={-360} onCommit={(angle) => set({ hatch: { ...hatch, angle } })} /></Row>
        </>
      ) : null}
      {type.tool === 'tag' ? (
        <Row label={t('atype.tag.field')}>
          <select aria-label={t('atype.tag.field')} className={INPUT} value={type.tagField ?? 'mark'} onChange={(e) => set({ tagField: e.target.value as (typeof TAG_FIELDS)[number] })}>
            {TAG_FIELDS.map((f) => <option key={f} value={f}>{t(`atype.tag.${f}` as TranslationKey)}</option>)}
          </select>
        </Row>
      ) : null}
      {type.tool === 'label' ? <LabelTypeFields label={type.label ?? DEFAULT_LABEL} onChange={(label) => set({ label })} /> : null}
      <Button size="sm" onClick={() => { closeStandards(); useAnnotationType(type.id); }}><Pencil className="mr-1 size-3" />{t('atype.use')}</Button>
    </div>
  );
}

export function AnnotationTypesTab() {
  const { t } = useTranslation();
  const types = useProjectStore((s) => s.annotationTypes) ?? [];
  const [picked, pick] = useState<string | null>(null);
  const [tool, setTool] = useState<AnnotationTool>('leader');
  const selected = types.find((x) => x.id === picked) ?? types[0];
  return (
    <div className="space-y-3 text-xs">
      <p className="text-zinc-500">{t('atype.hint')}</p>
      <div className="flex items-center gap-2">
        <select aria-label={t('atype.newTool')} className={INPUT} value={tool} onChange={(e) => setTool(e.target.value as AnnotationTool)}>
          {ANNOTATION_TOOLS.map((x) => <option key={x} value={x}>{t(`atype.tool.${x}` as TranslationKey)}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={() => pick(addAnnotationTypeFromCurrent(t('atype.newName', { n: types.length + 1 }), tool))}>{t('atype.new')}</Button>
      </div>
      {types.length === 0 ? <p className="text-zinc-500">{t('atype.empty')}</p> : (
        <div className="flex gap-4">
          <ul className="w-52 shrink-0 space-y-0.5 border-r border-zinc-200 pr-2 dark:border-zinc-800">
            {types.map((x) => (
              <li key={x.id} className={`flex items-center gap-1 rounded-sm px-1 ${x.id === selected?.id ? 'bg-primary/10' : ''}`}>
                <button type="button" className="min-w-0 flex-1 truncate py-1 text-left" onClick={() => pick(x.id)}>
                  {x.name}<span className="ml-1 text-2xs text-zinc-500">{t(`atype.tool.${x.tool}` as TranslationKey)}</span>
                </button>
                <IconButton label={`${t('standards.style.duplicate')} ${x.name}`} className="size-6" onClick={() => pick(duplicateAnnotationType(x.id, t('atype.style.copyName', { name: x.name })))}><Copy className="size-3" /></IconButton>
                <IconButton label={`${t('standards.style.delete')} ${x.name}`} className="size-6" onClick={() => removeAnnotationType(x.id)}><Trash2 className="size-3" /></IconButton>
              </li>
            ))}
          </ul>
          {selected ? <Editor type={selected} /> : null}
        </div>
      )}
    </div>
  );
}
