/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The detail library, pure: a drafting view becomes a library entry that
 * carries what its drafts refer to (layers, hatch patterns, symbols), and an
 * entry becomes the drafts of a new drafting view in another project, with
 * fresh ids and every reference carried to the definition the library's
 * merge policy left standing. The store actions are in `detail-actions.ts`.
 */

import { detailLink } from '@/drafting/detail-mark';
import { parsePat, serializePat } from '@/drafting/hatch/pattern';
import { isBuiltInSymbol } from '@bimvoice/ifcsheet';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectState } from '@/project/project-store';
import { emptyCatalogue } from './catalogue-file';
import { mergeCatalogues, type ClashPolicy, type MergeReport } from './catalogue-merge';
import { projectCatalogue } from './catalogue-store';
import type { DraftSymbol, LibraryDetail } from './types';

type Source = Pick<ProjectState, 'views' | 'drafts' | 'draftLayers' | 'symbols' | 'hatchPatterns'>;

/** The drafts a drafting view takes to the library: its own, without marks that refer to other views. */
const portable = (d: DraftEntity): boolean => detailLink(d) === null && typeof d.params.sectionOf !== 'string';

/** The names of the hatch patterns and the ids of the symbols the shapes use. */
function usedBy(drafts: readonly Pick<DraftEntity, 'shape'>[]): { patterns: Set<string>; symbols: Set<string> } {
  const patterns = new Set<string>();
  const symbols = new Set<string>();
  for (const { shape } of drafts) {
    if (shape.type === 'hatch') patterns.add(shape.pattern.toUpperCase());
    if (shape.type === 'symbol') symbols.add(shape.symbolId);
  }
  return { patterns, symbols };
}

/**
 * The library entry for drafting view `viewId`, or `null` when it is not a
 * drafting view. The entry copies the drafts (ids kept: they are remapped when
 * placed), the layers they are on, the user hatch patterns and project
 * symbols they use; built-in symbols and patterns are in the app, not copied.
 */
export function detailEntryOf(source: Source, viewId: string, id: string, name?: string): LibraryDetail | null {
  const view = source.views.find((v) => v.id === viewId);
  if (!view || view.kind !== 'drafting') return null;
  const drafts = source.drafts.filter((d) => d.viewId === viewId && portable(d));
  const used = usedBy(drafts);
  const layerIds = new Set(drafts.map((d) => d.layerId));
  const layers = source.draftLayers.filter((l) => layerIds.has(l.id)).map(({ group: _group, ...rest }): DraftLayer => rest);
  const symbols: DraftSymbol[] = (source.symbols ?? []).filter((s) => used.symbols.has(s.id) && !isBuiltInSymbol(s.id));
  const patterns = parsePat(source.hatchPatterns ?? '').patterns.filter((p) => used.patterns.has(p.name.toUpperCase()));
  return {
    id, name: name?.trim() || view.name, scale: view.scale ?? 100,
    drafts: structuredClone(drafts).map(({ viewId: _viewId, ...rest }) => rest),
    layers: structuredClone(layers), hatchPatterns: patterns.length ? serializePat(patterns) : '', symbols: structuredClone(symbols),
  };
}

export interface PlacedDetail {
  name: string;
  scale: number;
  /** The drafts of the new view, on `viewId`, with fresh ids. */
  drafts: DraftEntity[];
  /** The project's catalogue with the entry's layers, symbols and patterns merged in. */
  merged: ReturnType<typeof mergeCatalogues>['catalogue'];
  report: MergeReport;
}

/**
 * What placing `entry` into the project `into` does: the merged definitions
 * and the drafts for a new drafting view `viewId`. `fresh` makes every new id
 * (draft ids and merged definitions alike), so placing twice never collides.
 */
export function placeDetailEntry(into: Parameters<typeof projectCatalogue>[0] & ProjectState, entry: LibraryDetail, viewId: string, policy: ClashPolicy, fresh: (prefix: string) => string): PlacedDetail {
  const incoming = { ...emptyCatalogue(), layers: entry.layers, symbols: entry.symbols, hatchPatterns: entry.hatchPatterns };
  const { catalogue: merged, report, maps } = mergeCatalogues(projectCatalogue(into), incoming, policy, fresh);
  const layerId = (id: string) => maps.layers.get(id) ?? (merged.layers.some((l) => l.id === id) ? id : '0');
  const symbolId = (id: string) => maps.symbols.get(id) ?? id;
  const pattern = (name: string) => maps.patterns.get(name.toUpperCase()) ?? name;
  const textStyles = new Set(merged.textStyles.map((s) => s.id));
  const dimStyles = new Set(merged.dimStyles.map((s) => s.id));
  const drafts = entry.drafts.map((d): DraftEntity => {
    const params = { ...d.params };
    // A style the project does not have falls back to its Standard one.
    if (typeof params.textStyle === 'string' && !textStyles.has(params.textStyle)) delete params.textStyle;
    if (typeof params.dimStyle === 'string' && !dimStyles.has(params.dimStyle)) delete params.dimStyle;
    const shape = structuredClone(d.shape);
    if (shape.type === 'hatch') shape.pattern = pattern(shape.pattern);
    if (shape.type === 'symbol') shape.symbolId = symbolId(shape.symbolId);
    return { id: fresh('draft'), viewId, layerId: layerId(d.layerId), shape, params };
  });
  return { name: entry.name, scale: entry.scale, drafts, merged, report };
}
