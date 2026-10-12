/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Symbols: the built-in ones and the project's own, with a preview, how
 * many are placed, and Place / copy / delete. A project symbol is renamed
 * and given its unit here; its shapes are edited on a drawing (Edit symbol,
 * then Make symbol redefines it and every instance follows).
 */

import { Copy, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { instanceCount, duplicateSymbol, removeSymbol, renameSymbol, setSymbolUnit } from '@/catalogue/symbol-actions';
import type { DraftSymbol } from '@/catalogue/types';
import { patchDraftSettings, startDraftCommand } from '@/drafting/session';
import { BUILT_IN_SYMBOLS, flattenShape, isBuiltInSymbol, placeSymbol } from '@/drafting/symbols';
import { isDrawingTabActive } from '@/project/document-tabs';
import { useProjectStore } from '@/project/project-store';
import { closeStandards } from '@/project/standards-dialog-store';
import { toast } from '@/components/ui/toast';

const INPUT = 'h-7 w-44 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';

/** The symbol drawn upright in a box of `size` px, fitted. */
export function SymbolPreview({ def, size = 56 }: { def: DraftSymbol; size?: number }) {
  const placed = placeSymbol(def, { p: { x: 0, y: 0 }, scale: 1, rotation: 0 }, -1);
  const paths = placed.geometry.map((g) => flattenShape(g));
  const xs = [...paths.flatMap((p) => p.pts.map((q) => q.x)), ...placed.texts.flatMap((t) => [t.p.x, t.p.x + t.text.length * t.height * 0.6])];
  const ys = [...paths.flatMap((p) => p.pts.map((q) => q.y)), ...placed.texts.flatMap((t) => [t.p.y, t.p.y - t.height])];
  const [x0, x1, y0, y1] = [Math.min(...xs, 0), Math.max(...xs, 0), Math.min(...ys, 0), Math.max(...ys, 0)];
  const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6);
  const k = (size - 6) / Math.max(w, h);
  const sx = (x: number) => 3 + (x - x0) * k + (size - 6 - w * k) / 2;
  const sy = (y: number) => 3 + (y - y0) * k + (size - 6 - h * k) / 2;
  return (
    <svg width={size} height={size} aria-hidden="true" className="shrink-0 rounded-sm border border-zinc-200 bg-white dark:border-zinc-800">
      {paths.map((p, i) => (
        <path key={i} d={`M${p.pts.map((q) => `${sx(q.x).toFixed(1)} ${sy(q.y).toFixed(1)}`).join('L')}${p.closed ? 'Z' : ''}`} stroke="#18181b" strokeWidth={1} fill="none" />
      ))}
      {placed.texts.map((t, i) => <text key={i} x={sx(t.p.x)} y={sy(t.p.y)} fontSize={Math.max(t.height * k, 5)} fontFamily="sans-serif" fill="#18181b">{t.text}</text>)}
    </svg>
  );
}

function place(id: string, hint: string): void {
  if (!isDrawingTabActive()) {
    toast.info(hint);
    return;
  }
  patchDraftSettings({ symbolId: id });
  closeStandards();
  startDraftCommand('symbol');
}

function Row({ def }: { def: DraftSymbol }) {
  const { t } = useTranslation();
  const count = useProjectStore((s) => instanceCount(def.id, s.drafts));
  const builtIn = isBuiltInSymbol(def.id);
  return (
    <li className="flex items-center gap-3 border-b border-zinc-100 py-2 last:border-0 dark:border-zinc-900">
      <SymbolPreview def={def} />
      <div className="min-w-0 flex-1 space-y-1">
        {builtIn ? <span className="font-medium">{def.name} <span className="text-2xs text-zinc-500">{t('symbol.builtIn')}</span></span> : (
          <input aria-label={t('standards.style.name')} className={INPUT} defaultValue={def.name} key={def.id + def.name} onBlur={(e) => renameSymbol(def.id, e.target.value)} />
        )}
        <div className="flex items-center gap-2 text-2xs text-zinc-500">
          <span>{t('symbol.instances', { count })}</span>
          {builtIn ? null : (
            <select aria-label={t('symbol.unit')} className="h-6 rounded-sm border border-zinc-300 bg-transparent dark:border-zinc-700" value={def.unit} onChange={(e) => setSymbolUnit(def.id, e.target.value as DraftSymbol['unit'])}>
              <option value="paper">{t('symbol.unit.paper')}</option>
              <option value="model">{t('symbol.unit.model')}</option>
            </select>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={() => place(def.id, t('symbol.needsView'))}>{t('symbol.place')}</Button>
      <IconButton label={`${builtIn ? t('symbol.copy') : t('standards.style.duplicate')} ${def.name}`} className="size-7" onClick={() => duplicateSymbol(def.id, t('symbol.copyName', { name: def.name }))}><Copy className="size-3.5" /></IconButton>
      {builtIn ? <span className="size-7" /> : (
        <IconButton label={`${t('standards.style.delete')} ${def.name}${count ? ` (${t('symbol.removeWarn', { count })})` : ''}`} className="size-7" onClick={() => removeSymbol(def.id)}><Trash2 className="size-3.5" /></IconButton>
      )}
    </li>
  );
}

export function SymbolsTab() {
  const { t } = useTranslation();
  const own = useProjectStore((s) => s.symbols) ?? [];
  return (
    <div className="space-y-2 text-xs">
      <p className="text-zinc-500">{t('symbol.hint')}</p>
      <ul>
        {[...BUILT_IN_SYMBOLS, ...own].map((def) => <Row key={def.id} def={def} />)}
      </ul>
      {own.length === 0 ? <p className="text-zinc-500">{t('symbol.empty')}</p> : null}
    </div>
  );
}
