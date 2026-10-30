/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The opening configuration of an element's IFC type (#448), in the joinery symbol card: how many leaves (1 to 6), how each opens, a second row
 * (transom) above them, fixed or opening, and glazing bars dividing the panes. Applying it draws every element of the type with it in the schedule's elevation and in the plan; the size is the IFC's.
 */

import { useState } from 'react';
import { cleanCustomProps, MAX_CUSTOM_PROPS } from '@bimvoice/ifcsheet';
import { cleanHead, cleanOpening, leafOperations, MAX_BARS, MAX_LEAVES, type TypeOpening } from '@bimvoice/ifcsheet/project';
import { type JoineryCustomProp, type JoineryHead, type JoineryHeadShape, type PanelOperation } from '@ifc-lite/create';
import { useTranslation, type TranslationKey } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TypePlanBlockPicker } from './TypePlanBlockPicker';
import { configureElementType, setTypePlanBlock, typeCustomOf, typeHeadOf, typeOpeningOf, typePlanBlockOf, typeSillOf } from '@/joinery/type-config-actions';
import type { ElementFacts } from '@/joinery/symbol-mapping';

const DEFAULT_OPENING: TypeOpening = { operations: ['fixed'], fanlight: false };
const HEADS: readonly JoineryHeadShape[] = ['square', 'round', 'segmental', 'pointed'];
/** Properties offered by name: the schedule's own U value and fire rating rows read them. */
const SUGGESTED = [
  { key: 'thermalTransmittance', label: 'schedule.row.uValue' },
  { key: 'fireRating', label: 'schedule.row.fire' },
] as const;

export function TypeOpeningForm({ facts }: { facts: ElementFacts }) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState<TypeOpening>(() => typeOpeningOf(facts) ?? DEFAULT_OPENING);
  const [head, setHead] = useState<JoineryHead>(() => typeHeadOf(facts));
  // The rise is typed in millimetres; empty is the shape's default.
  const [rise, setRise] = useState<string>(() => (head.rise === undefined ? '' : String(Math.round(head.rise * 1000))));
  const [custom, setCustom] = useState<JoineryCustomProp[]>(() => typeCustomOf(facts));
  // The sill is typed in millimetres; empty is the kind's default, which the schedule does not print.
  const [sill, setSill] = useState<string>(() => { const v = typeSillOf(facts); return v === null ? '' : String(Math.round(v * 1000)); });
  const [block, setBlock] = useState(() => typePlanBlockOf(facts));
  const allowed = leafOperations(facts.kind);
  const leaves = opening.operations.length;
  const setLeaves = (n: number) => setOpening((o) => ({
    ...o, operations: Array.from({ length: n }, (_, i) => o.operations[i] ?? 'fixed'),
  }));
  const setBars = (k: 'horizontal' | 'vertical', n: number) => setOpening((o) => ({
    ...o, bars: { horizontal: 0, vertical: 0, ...o.bars, [k]: Number.isFinite(n) ? Math.min(MAX_BARS, Math.max(0, Math.round(n))) : 0 },
  }));
  const setOperation = (i: number, op: PanelOperation) => setOpening((o) => ({ ...o, operations: o.operations.map((x, j) => (j === i ? op : x)) }));
  return (
    <div data-type-opening className="mt-2 space-y-1 border-t border-overlay-accent/30 pt-1.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-foreground">{t('joinery.type.title')}</p>
      <p className="text-2xs text-muted-foreground">{t('joinery.type.hint')}</p>
      <SegmentedControl
        size="sm" label={t('joinery.type.leaves')} value={String(leaves)}
        options={Array.from({ length: MAX_LEAVES }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
        onValueChange={(v) => setLeaves(Number(v))}
      />
      {opening.operations.map((op, i) => (
        <Select key={i} value={op} onValueChange={(v) => setOperation(i, v as PanelOperation)}>
          <SelectTrigger aria-label={t('joinery.type.leaf', { n: i + 1 })} data-type-leaf={i} className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {allowed.map((o) => <SelectItem key={o} value={o} className="text-xs">{t(`joinery.op.${o}` as TranslationKey)}</SelectItem>)}
          </SelectContent>
        </Select>
      ))}
      <Checkbox label={t('joinery.type.fanlight')} checked={opening.fanlight} onCheckedChange={(fanlight) => setOpening((o) => ({ ...o, fanlight }))} />
      {opening.fanlight && facts.kind === 'window' ? (
        <Checkbox
          label={t('joinery.type.fanlightOpens')} checked={opening.fanlightOpens === true}
          onCheckedChange={(on) => setOpening(({ fanlightOpens: _f, ...o }) => (on ? { ...o, fanlightOpens: true as const } : o))}
        />
      ) : null}
      <div className="flex items-center gap-1">
        {(['horizontal', 'vertical'] as const).map((k) => (
          <Input
            key={k} type="number" min={0} max={MAX_BARS} step={1} data-type-bars={k} aria-label={t(`joinery.type.bars.${k}` as TranslationKey)}
            placeholder={t(`joinery.type.bars.${k}` as TranslationKey)} className="h-7 text-xs" value={opening.bars?.[k] ?? 0}
            onChange={(e) => setBars(k, Number(e.target.value))}
          />
        ))}
      </div>
      <SegmentedControl
        size="sm" label={t('joinery.head.title')} value={head.shape}
        options={HEADS.map((h) => ({ value: h, label: t(`joinery.head.${h}` as TranslationKey) }))}
        onValueChange={(v) => setHead({ shape: v as JoineryHeadShape })}
      />
      {head.shape === 'segmental' || head.shape === 'pointed' ? (
        <Input
          type="number" min={1} step={10} data-type-head-rise aria-label={t('joinery.head.rise')} placeholder={t('joinery.head.riseDefault')}
          className="h-7 text-xs" value={rise} onChange={(e) => setRise(e.target.value)}
        />
      ) : null}
      {facts.kind === 'window' ? (
        <Input
          type="number" min={0} step={10} data-type-sill aria-label={t('joinery.type.sill')} placeholder={t('joinery.type.sillDefault')}
          className="h-7 text-xs" value={sill} onChange={(e) => setSill(e.target.value)}
        />
      ) : null}
      <TypePlanBlockPicker block={block} onChange={setBlock} />
      <p className="pt-1 text-2xs font-semibold uppercase tracking-wide text-foreground">{t('joinery.props.title')}</p>
      <p className="text-2xs text-muted-foreground">{t('joinery.props.hint')}</p>
      {custom.map((p, i) => (
        <div key={i} className="flex items-center gap-1" data-type-prop={i}>
          <Input
            className="h-7 flex-1 text-xs" aria-label={t('joinery.props.name')} value={p.name} placeholder={t('joinery.props.name')}
            onChange={(e) => setCustom((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
          />
          <Input
            className="h-7 w-20 text-xs" aria-label={t('joinery.props.value')} value={p.value} placeholder={t('joinery.props.value')}
            onChange={(e) => setCustom((list) => list.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
          />
          <Button size="sm" variant="ghost" aria-label={t('joinery.props.remove', { name: p.name })} onClick={() => setCustom((list) => list.filter((_, j) => j !== i))}>×</Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        {SUGGESTED.filter((s) => !custom.some((p) => p.key === s.key)).map((s) => (
          <Button key={s.key} size="sm" variant="outline" data-type-prop-suggest={s.key} disabled={custom.length >= MAX_CUSTOM_PROPS}
            onClick={() => setCustom((list) => [...list, { name: t(s.label), value: '', key: s.key }])}>
            {t(s.label)}
          </Button>
        ))}
        <Button size="sm" variant="outline" data-type-prop-add disabled={custom.length >= MAX_CUSTOM_PROPS} onClick={() => setCustom((list) => [...list, { name: '', value: '' }])}>
          {t('joinery.props.add')}
        </Button>
      </div>
      <Button
        size="sm" variant="outline" data-type-opening-apply className="w-full"
        onClick={() => {
          const mm = Number(rise);
          const shaped = cleanHead({ ...head, rise: rise.trim() !== '' && Number.isFinite(mm) && mm > 0 ? mm / 1000 : undefined }) ?? { shape: 'square' as const };
          const sillMm = Number(sill);
          const sillMetres = sill.trim() !== '' && Number.isFinite(sillMm) && sillMm >= 0 ? sillMm / 1000 : null;
          configureElementType(facts, cleanOpening(facts.kind, opening), { head: shaped, custom: cleanCustomProps(custom), sillHeight: sillMetres });
          setTypePlanBlock(facts, block);
        }}
      >
        {t('joinery.type.apply')}
      </Button>
    </div>
  );
}
