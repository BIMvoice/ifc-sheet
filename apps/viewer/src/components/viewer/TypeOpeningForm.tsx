/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The opening configuration of an element's IFC type (#448), in the joinery symbol card: how many leaves (1 to 3), how each opens, a fixed
 * light above them. Applying it draws every element of the type with it in the schedule's elevation and in the plan; the size is the IFC's.
 */

import { useState } from 'react';
import { cleanOpening, leafOperations, MAX_LEAVES, type TypeOpening } from '@bimvoice/ifcsheet/project';
import type { PanelOperation } from '@ifc-lite/create';
import { useTranslation, type TranslationKey } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { configureElementType, typeOpeningOf } from '@/joinery/type-config-actions';
import type { ElementFacts } from '@/joinery/symbol-mapping';

const DEFAULT_OPENING: TypeOpening = { operations: ['fixed'], fanlight: false };

export function TypeOpeningForm({ facts }: { facts: ElementFacts }) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState<TypeOpening>(() => typeOpeningOf(facts) ?? DEFAULT_OPENING);
  const allowed = leafOperations(facts.kind);
  const leaves = opening.operations.length;
  const setLeaves = (n: number) => setOpening((o) => ({
    ...o, operations: Array.from({ length: n }, (_, i) => o.operations[i] ?? 'fixed'),
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
      <Button size="sm" variant="outline" data-type-opening-apply className="w-full" onClick={() => { configureElementType(facts, cleanOpening(facts.kind, opening)); }}>
        {t('joinery.type.apply')}
      </Button>
    </div>
  );
}
