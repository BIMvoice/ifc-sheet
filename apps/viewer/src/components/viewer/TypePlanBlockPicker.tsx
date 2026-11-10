/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Picks a DXF block as the plan symbol of a door or window type (#448): a DXF file, then one of its blocks. What the block holds that
 * is not drawn (text, hatches, ellipses, ...) is said here, not dropped silently. The choice is applied with the type form's Apply.
 */

import { useState } from 'react';
import { isDrawnSymbol, listDxfBlocks, readDxfBlock, type DxfBlockReport } from '@bimvoice/ifcsheet/project';
import type { JoineryBlockSymbol, JoinerySpec } from '@ifc-lite/create';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { JoinerySymbolEditor } from './joinery/JoinerySymbolEditor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const list = (counts: Record<string, number>): string => Object.entries(counts).map(([kind, n]) => `${kind.toUpperCase()} × ${n}`).join(', ');

export function TypePlanBlockPicker({ block, entry, onChange, onDrawn }: { block: JoineryBlockSymbol | null; entry: JoinerySpec | null; onChange: (block: JoineryBlockSymbol | null) => void; onDrawn: (block: JoineryBlockSymbol | null) => void }) {
  const { t } = useTranslation();
  const [drawing, setDrawing] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [report, setReport] = useState<DxfBlockReport | null>(null);
  const [note, setNote] = useState<'none' | 'empty' | null>(null);
  const choose = (name: string) => {
    if (text === null) return;
    const read = readDxfBlock(text, name);
    setReport(read.report);
    setNote(read.symbol ? null : 'empty');
    if (read.symbol) onChange(read.symbol);
  };
  const [failure, setFailure] = useState<string | null>(null);
  const load = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    let found: string[];
    try {
      found = listDxfBlocks(content);
    } catch (error) {
      // Not a DXF the reader can parse: say so, offer no blocks of it, and leave the type's symbol as it is.
      console.warn('DXF plan symbol: the file could not be read', error);
      setText(null);
      setNames([]);
      setReport(null);
      setNote(null);
      setFailure(error instanceof Error ? error.message : String(error));
      return;
    }
    setFailure(null);
    setText(content);
    setNames(found);
    setReport(null);
    setNote(found.length ? null : 'none');
  };
  return (
    <div data-type-plan-block className="space-y-1 pt-1">
      <p className="text-2xs font-semibold uppercase tracking-wide text-foreground">{t('joinery.block.title')}</p>
      <p className="text-2xs text-muted-foreground">{t('joinery.block.hint')}</p>
      <input
        type="file" accept=".dxf" data-type-plan-block-file aria-label={t('joinery.block.file')} className="w-full text-2xs"
        onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }}
      />
      {names.length ? (
        <Select onValueChange={choose}>
          <SelectTrigger aria-label={t('joinery.block.pick')} data-type-plan-block-pick className="h-7 text-xs"><SelectValue placeholder={t('joinery.block.pick')} /></SelectTrigger>
          <SelectContent>{names.map((n) => <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>)}</SelectContent>
        </Select>
      ) : null}
      {failure !== null ? <p role="alert" data-type-plan-block-error className="text-2xs text-destructive">{t('joinery.block.unreadable', { reason: failure })}</p> : null}
      {note ? <p data-type-plan-block-note className="text-2xs text-muted-foreground">{t(note === 'none' ? 'joinery.block.none' : 'joinery.block.empty')}</p> : null}
      {report?.assumedMillimetres ? <p className="text-2xs text-muted-foreground">{t('joinery.block.millimetres')}</p> : null}
      {Object.keys(report?.unsupported ?? {}).length ? <p data-type-plan-block-unsupported className="text-2xs text-muted-foreground">{t('joinery.block.unsupported', { list: list(report!.unsupported) })}</p> : null}
      {Object.keys(report?.skippedInFile ?? {}).length ? <p className="text-2xs text-muted-foreground">{t('joinery.block.skipped', { list: list(report!.skippedInFile) })}</p> : null}
      {report?.truncated ? <p className="text-2xs text-muted-foreground">{t('joinery.block.truncated')}</p> : null}
      <Button size="sm" variant="outline" data-type-plan-block-edit disabled={!entry?.id} title={entry?.id ? undefined : t('joinery.symbol.needsType')} onClick={() => setDrawing(true)}>{t('joinery.symbol.edit')}</Button>
      {drawing && entry?.id ? <JoinerySymbolEditor spec={entry} block={block} onSave={onDrawn} onClose={() => setDrawing(false)} /> : null}
      {block ? (
        <div className="flex items-center gap-1">
          <span data-type-plan-block-name className="flex-1 truncate text-2xs text-foreground">{isDrawnSymbol(block) ? t('joinery.symbol.drawn') : t('joinery.block.current', { name: block.name })}</span>
          <Button size="sm" variant="ghost" data-type-plan-block-clear aria-label={t('joinery.block.remove')} onClick={() => onChange(null)}>×</Button>
        </div>
      ) : null}
    </div>
  );
}
