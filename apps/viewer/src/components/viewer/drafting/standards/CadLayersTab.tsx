/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The CAD layer standard (`project/cad-layers.ts`): the rule table that says
 * which CAD layer, colour, pen and line type an IFC class or material is
 * exported on. Edit, add, remove and reorder rules, or start again from the
 * ISO 13567 starter.
 */

import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useProjectStore } from '@/project/project-store';
import { materialNamesInModels } from '@/project/materials';
import { CAD_KINDS, type CadKind, type CadLayerRule } from '@/project/cad-layers';
import { addCadRule, clearCadRules, moveCadRule, resetCadRulesToAia, removeCadRule, resetCadRulesToIso, updateCadRule } from '@/project/cad-layers-edit';
import type { LineType } from '@/drafting/styles';

const TYPES: readonly LineType[] = ['continuous', 'dashed', 'dotted', 'dashdot'];
const INPUT = 'h-7 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';
const list = (s: string) => s.split(',').map((c) => c.trim()).filter(Boolean);

function Row({ rule, n, last }: { rule: CadLayerRule; n: number; last: boolean }) {
  const { t } = useTranslation();
  const label = (field: string) => t('cad.field', { n, field });
  // Text fields commit on blur (keyed by value, so an external change shows).
  const text = (field: 'source' | 'material', name: string, width: string) => (
    <input aria-label={label(name)} className={`${INPUT} ${width}`} defaultValue={rule[field] ?? ''} key={rule[field] ?? ''} list={field === 'material' ? 'cad-materials' : undefined}
      onBlur={(e) => e.target.value.trim() !== (rule[field] ?? '') && updateCadRule(rule.id, { [field]: e.target.value.trim() || undefined })} />
  );
  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-800">
      <td className="py-1 pr-1">{text('source', t('cad.col.source'), 'w-24')}</td>
      <td className="py-1 pr-1">
        <select aria-label={label(t('cad.col.kind'))} className={INPUT} value={rule.kind ?? ''} onChange={(e) => updateCadRule(rule.id, { kind: (e.target.value || undefined) as CadKind | undefined })}>
          <option value="">{t('cad.kind.any')}</option>
          {CAD_KINDS.map((k) => <option key={k} value={k}>{t(`cad.kind.${k}` as TranslationKey)}</option>)}
        </select>
      </td>
      <td className="py-1 pr-1">
        <input aria-label={label(t('cad.col.classes'))} className={`${INPUT} w-44`} defaultValue={(rule.ifcClasses ?? []).join(', ')} key={(rule.ifcClasses ?? []).join(',')}
          onBlur={(e) => updateCadRule(rule.id, { ifcClasses: list(e.target.value).length ? list(e.target.value) : undefined })} />
      </td>
      <td className="py-1 pr-1">{text('material', t('cad.col.material'), 'w-28')}</td>
      <td className="py-1 pr-1">
        <input aria-label={label(t('cad.col.layer'))} className={`${INPUT} w-36 font-mono`} defaultValue={rule.layer} key={rule.layer}
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== rule.layer && updateCadRule(rule.id, { layer: e.target.value.trim() })} />
      </td>
      <td className="py-1 pr-1 whitespace-nowrap">
        <input type="color" aria-label={label(t('cad.col.color'))} className="h-7 w-9 cursor-pointer rounded-sm border border-zinc-300 dark:border-zinc-700" value={rule.color ?? '#000000'}
          onChange={(e) => updateCadRule(rule.id, { color: e.target.value })} />
        {rule.color ? <IconButton label={label(t('cad.color.clear'))} className="size-7" onClick={() => updateCadRule(rule.id, { color: undefined })}><RotateCcw className="size-3.5" /></IconButton> : null}
      </td>
      <td className="py-1 pr-1">
        <input type="number" min={0} step={0.01} aria-label={label(t('cad.col.weight'))} className={`${INPUT} w-16`} placeholder={t('cad.weight.own')} defaultValue={rule.lineWeight ?? ''} key={rule.lineWeight ?? ''}
          onBlur={(e) => updateCadRule(rule.id, { lineWeight: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} />
      </td>
      <td className="py-1 pr-1">
        <select aria-label={label(t('cad.col.type'))} className={INPUT} value={rule.lineType ?? ''} onChange={(e) => updateCadRule(rule.id, { lineType: (e.target.value || undefined) as LineType | undefined })}>
          <option value="">{t('cad.type.own')}</option>
          {TYPES.map((k) => <option key={k} value={k}>{t(`cad.type.${k}` as TranslationKey)}</option>)}
        </select>
      </td>
      <td className="py-1 whitespace-nowrap text-right">
        <IconButton label={t('cad.up', { n })} className="size-7" disabled={n === 1} onClick={() => moveCadRule(rule.id, -1)}><ArrowUp className="size-3.5" /></IconButton>
        <IconButton label={t('cad.down', { n })} className="size-7" disabled={last} onClick={() => moveCadRule(rule.id, 1)}><ArrowDown className="size-3.5" /></IconButton>
        <IconButton label={t('cad.delete', { n })} className="size-7" onClick={() => removeCadRule(rule.id)}><Trash2 className="size-3.5" /></IconButton>
      </td>
    </tr>
  );
}

export function CadLayersTab() {
  const { t } = useTranslation();
  const rules = useProjectStore((s) => s.cadLayers) ?? [];
  const materials = materialNamesInModels();
  return (
    <div className="space-y-3 text-xs">
      <p className="text-zinc-500">{t('cad.hint')}</p>
      <p className="text-zinc-500">{t('cad.ascii')}</p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => addCadRule(t('cad.newLayer'))}><Plus className="mr-1 size-3.5" />{t('cad.add')}</Button>
        <Button size="sm" variant="outline" onClick={resetCadRulesToIso}><RotateCcw className="mr-1 size-3.5" />{t('cad.reset')}</Button>
        <Button size="sm" variant="outline" onClick={resetCadRulesToAia}><RotateCcw className="mr-1 size-3.5" />{t('cad.resetAia')}</Button>
        <Button size="sm" variant="outline" disabled={rules.length === 0} onClick={clearCadRules}><Trash2 className="mr-1 size-3.5" />{t('cad.clear')}</Button>
        <p className="flex-1 text-right text-zinc-500">{t('cad.starter')}</p>
      </div>
      {rules.length === 0 ? <p className="py-4 text-center text-zinc-500">{t('cad.empty')}</p> : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-zinc-500">
              {(['source', 'kind', 'classes', 'material', 'layer', 'color', 'weight', 'type'] as const).map((c) => <th key={c} className="py-1 font-medium">{t(`cad.col.${c}` as TranslationKey)}</th>)}
              <th><span className="sr-only">{t('cad.col.order')}</span></th>
            </tr>
          </thead>
          <tbody>{rules.map((r, i) => <Row key={r.id} rule={r} n={i + 1} last={i === rules.length - 1} />)}</tbody>
        </table>
      )}
      <datalist id="cad-materials">{materials.map((m) => <option key={m} value={m}>{m}</option>)}</datalist>
    </div>
  );
}
