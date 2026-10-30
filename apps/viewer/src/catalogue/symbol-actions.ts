/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Symbols as project actions: make one from drafted shapes, place instances,
 * change the definition (every instance follows), explode an instance back
 * into shapes.
 */

import { commitDrafts, newDraft } from '@/drafting/draft-store';
import { findSymbol, placeSymbol, symbolDrawingScale } from '@bimvoice/ifcsheet';
import type { DraftEntity, Pt } from '@/drafting/types';
import { commitStandards, paperUnitOf } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import { buildSymbolShapes } from './symbol-build';
import type { DraftSymbol } from './types';

export const projectSymbols = (): DraftSymbol[] => useProjectStore.getState().symbols ?? [];

/** A new instance entity of `symbolId` at `p` on a view or sheet: `factor` times its size, turned `rotationDeg`. */
export function symbolInstance(viewId: string, layerId: string, symbolId: string, p: Pt, factor: number, rotationDeg: number): DraftEntity | null {
  const def = findSymbol(symbolId);
  if (!def) return null;
  const scale = symbolDrawingScale(def, factor, paperUnitOf(viewId));
  return newDraft(viewId, layerId, { type: 'symbol', symbolId, p, scale, rotation: (rotationDeg * Math.PI) / 180 }, { symbolScale: factor });
}

/** Whether `viewId` is a sheet (drafting there is in paper millimetres). */
const onSheet = (viewId: string) => useProjectStore.getState().sheets.some((s) => s.id === viewId);

/** The shape types a symbol can hold. */
const SYMBOL_SHAPES: ReadonlySet<string> = new Set(['line', 'polyline', 'circle', 'arc', 'text']);

export interface MadeSymbol {
  id: string;
  /** Shapes in the selection that a symbol cannot hold. */
  skipped: number;
}

/**
 * Make a symbol of the entities `ids` (drafted on `viewId`), inserted at
 * `origin`, and put an instance where they were instead. With `target`, that
 * symbol is redefined instead of a new one made: its instances follow.
 */
export function makeSymbolFromEntities(viewId: string, ids: ReadonlySet<string>, origin: Pt, up: 1 | -1, name: string, target: string | null = null): MadeSymbol | null {
  const s = useProjectStore.getState();
  const picked = s.drafts.filter((d) => ids.has(d.id) && d.viewId === viewId);
  if (picked.length === 0) return null;
  const existing = target ? s.symbols?.find((x) => x.id === target) : undefined;
  const unit: DraftSymbol['unit'] = existing?.unit ?? (onSheet(viewId) ? 'paper' : 'model');
  const { shapes, skipped } = buildSymbolShapes(picked.map((d) => d.shape), origin, up, unit === 'paper' ? paperUnitOf(viewId, s) : 1);
  if (shapes.length === 0) return { id: '', skipped };
  const id = existing?.id ?? freshProjectId('symbol');
  const def: DraftSymbol = { id, name: existing?.name ?? name, unit, shapes };
  const symbols = existing ? (s.symbols ?? []).map((x) => (x.id === id ? def : x)) : [...(s.symbols ?? []), def];
  // The shapes that went in are replaced by one instance, in the layer of the first of them.
  const goneIds = new Set(picked.filter((d) => SYMBOL_SHAPES.has(d.shape.type)).map((d) => d.id));
  commitStandards({ symbols });
  const instance = symbolInstance(viewId, picked[0].layerId, id, origin, 1, 0);
  commitDrafts([...useProjectStore.getState().drafts.filter((d) => !goneIds.has(d.id)), ...(instance ? [instance] : [])]);
  return { id, skipped };
}

export function renameSymbol(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  commitStandards({ symbols: projectSymbols().map((x) => (x.id === id ? { ...x, name: trimmed } : x)) });
}

/** Change the unit of a symbol; its instances re-fit to keep drawing as the unit says. */
export function setSymbolUnit(id: string, unit: DraftSymbol['unit']): void {
  commitStandards({ symbols: projectSymbols().map((x) => (x.id === id ? { ...x, unit } : x)) });
}

export function duplicateSymbol(id: string, name: string): string | null {
  const source = projectSymbols().find((x) => x.id === id) ?? findSymbol(id);
  if (!source) return null;
  const copy: DraftSymbol = { ...structuredClone(source), id: freshProjectId('symbol'), name };
  commitStandards({ symbols: [...projectSymbols(), copy] });
  return copy.id;
}

/** How many instances of a symbol the drawings hold. */
export function instanceCount(id: string, drafts: readonly DraftEntity[] = useProjectStore.getState().drafts): number {
  return drafts.filter((d) => d.shape.type === 'symbol' && d.shape.symbolId === id).length;
}

/** Delete a symbol; its instances stay as a marked gap until deleted or the symbol is restored. */
export function removeSymbol(id: string): void {
  commitStandards({ symbols: projectSymbols().filter((x) => x.id !== id) });
}

/** Change an instance's symbol, size factor or rotation (degrees) in one step. */
export function setSymbolPlacement(entityId: string, patch: { symbolId?: string; factor?: number; rotationDeg?: number }): void {
  const s = useProjectStore.getState();
  commitDrafts(s.drafts.map((d) => {
    if (d.id !== entityId || d.shape.type !== 'symbol') return d;
    const symbolId = patch.symbolId ?? d.shape.symbolId;
    const factor = patch.factor ?? (typeof d.params.symbolScale === 'number' ? d.params.symbolScale : 1);
    const def = findSymbol(symbolId, s.symbols);
    const scale = def ? symbolDrawingScale(def, factor, paperUnitOf(d.viewId, s)) : d.shape.scale;
    const rotation = patch.rotationDeg === undefined ? d.shape.rotation : (patch.rotationDeg * Math.PI) / 180;
    return { ...d, shape: { ...d.shape, symbolId, scale, rotation }, params: { ...d.params, symbolScale: factor } };
  }));
}

/**
 * Replace instances by the plain shapes they stand for, to edit them. Returns
 * the ids of the new shapes and the symbol the first instance was of (for
 * redefining it afterwards).
 */
export function explodeSymbols(ids: ReadonlySet<string>, up: 1 | -1): { ids: Set<string>; symbolId: string | null } {
  const s = useProjectStore.getState();
  const made: DraftEntity[] = [];
  let symbolId: string | null = null;
  const next = s.drafts.flatMap((d) => {
    if (!ids.has(d.id) || d.shape.type !== 'symbol') return [d];
    const def = findSymbol(d.shape.symbolId, s.symbols);
    if (!def) return [d];
    symbolId ??= def.id;
    const { geometry, texts } = placeSymbol(def, d.shape, up);
    for (const g of geometry) made.push(newDraft(d.viewId, d.layerId, g));
    for (const t of texts) made.push(newDraft(d.viewId, d.layerId, t, d.params.textStyle ? { textStyle: d.params.textStyle } : {}));
    return [];
  });
  if (made.length === 0) return { ids: new Set(), symbolId: null };
  commitDrafts([...next, ...made]);
  return { ids: new Set(made.map((d) => d.id)), symbolId };
}
