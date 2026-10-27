/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a legend lists: from a scope (the whole project, a view, or a sheet
 * with the views on it), the cut materials, the layers, the hatch patterns,
 * the symbols and the annotation types that are actually used there. Pure:
 * the caller reads the stores and hands over plain data, so a legend is
 * always regenerated from what the project holds now.
 */

import type { AnnotationType, DraftSymbol, LegendCategory, LegendConfig } from '@/catalogue/types';
import { findSymbol } from '@bimvoice/ifcsheet';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectMaterial, ProjectSheet, ProjectView } from '@/project/types';

export type LegendEntry =
  | { category: 'materials'; name: string; hatch: string | null; hatchScale: number; fill: string | null; membrane: boolean }
  | { category: 'layers'; name: string; color: string; weight: number; lineType: NonNullable<DraftLayer['lineType']> }
  | { category: 'hatches'; name: string; scale: number }
  | { category: 'symbols'; name: string; symbol: DraftSymbol }
  | { category: 'annotations'; name: string; type: AnnotationType }
  | { category: 'colours'; name: string; colour: string };

export interface LegendGroup {
  category: LegendCategory;
  entries: LegendEntry[];
}

/** A cut material as the legend needs it: its name and how it draws (the project's row, or what its name suggests). */
export type LegendMaterial = Pick<ProjectMaterial, 'name' | 'hatch' | 'hatchScale' | 'fill' | 'membrane'>;

export interface LegendSource {
  /** The materials cut in scope, as they draw. */
  materials: readonly LegendMaterial[];
  layers: readonly DraftLayer[];
  /** The drafted entities in scope. */
  drafts: readonly DraftEntity[];
  /** Layers hidden in scope. */
  hiddenLayers?: ReadonlySet<string>;
  annotationTypes: readonly AnnotationType[];
  /** The project's own symbols (the built-in ones are found by id). */
  symbols: readonly DraftSymbol[];
  /** The values the colour schemes of the views in scope paint, with their colours (`view-colour-scheme.ts`). */
  colours?: readonly { name: string; colour: string }[];
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/** The views and sheet whose drafts a legend of this scope covers. `placedOn` is the sheet a placed legend sits on. */
export function scopeViewIds(config: Pick<LegendConfig, 'scope' | 'scopeId'>, sheets: readonly ProjectSheet[], placedOn?: string): ReadonlySet<string> | null {
  if (config.scope === 'project') return null;
  if (config.scope === 'view') return config.scopeId ? new Set([config.scopeId]) : null;
  const sheet = sheets.find((s) => s.id === (config.scopeId ?? placedOn));
  if (!sheet) return config.scopeId || placedOn ? new Set() : null;
  return new Set([sheet.id, ...(sheet.viewports ?? []).map((v) => v.viewId)]);
}

/** The views whose generated drawings the materials of a scope are read from. */
export function scopeViews(config: Pick<LegendConfig, 'scope' | 'scopeId'>, views: readonly ProjectView[], sheets: readonly ProjectSheet[], placedOn?: string): ProjectView[] {
  const ids = scopeViewIds(config, sheets, placedOn);
  return ids === null ? [...views] : views.filter((v) => ids.has(v.id));
}

export function legendGroups(config: Pick<LegendConfig, 'categories'>, source: LegendSource): LegendGroup[] {
  const hidden = source.hiddenLayers ?? new Set<string>();
  const groups: LegendGroup[] = [];
  for (const category of config.categories) {
    const entries = entriesOf(category, source, hidden);
    if (entries.length > 0) groups.push({ category, entries });
  }
  return groups;
}

function entriesOf(category: LegendCategory, source: LegendSource, hidden: ReadonlySet<string>): LegendEntry[] {
  switch (category) {
    case 'materials': {
      const seen = new Set<string>();
      return source.materials
        .filter((m) => (m.hatch || m.membrane || m.fill) && !seen.has(m.name.trim().toLowerCase()) && seen.add(m.name.trim().toLowerCase()))
        .sort(byName)
        .map((m): LegendEntry => ({ category, name: m.name, hatch: m.hatch ?? null, hatchScale: m.hatchScale ?? 1, fill: m.fill ?? null, membrane: m.membrane === true }));
    }
    case 'layers': {
      const used = new Set(source.drafts.map((d) => d.layerId));
      return source.layers
        .filter((l) => used.has(l.id) && l.visible && !hidden.has(l.id))
        .sort(byName)
        .map((l): LegendEntry => ({ category, name: l.name, color: l.color, weight: l.lineWeight ?? 0.25, lineType: l.lineType ?? 'continuous' }));
    }
    case 'hatches': {
      const patterns = new Map<string, number>();
      for (const d of source.drafts) if (d.shape.type === 'hatch' && !patterns.has(d.shape.pattern.toUpperCase())) patterns.set(d.shape.pattern.toUpperCase(), d.shape.scale);
      return [...patterns].map(([name, scale]): LegendEntry => ({ category, name, scale })).sort(byName);
    }
    case 'symbols': {
      const ids = new Set<string>();
      for (const d of source.drafts) if (d.shape.type === 'symbol') ids.add(d.shape.symbolId);
      return [...ids].flatMap((id) => {
        const symbol = findSymbol(id, source.symbols);
        return symbol ? [{ category, name: symbol.name, symbol } satisfies LegendEntry] : [];
      }).sort(byName);
    }
    case 'colours':
      return (source.colours ?? []).map((c): LegendEntry => ({ category, name: c.name, colour: c.colour }));
    case 'annotations': {
      const ids = new Set(source.drafts.map((d) => d.params.atype).filter((v): v is string => typeof v === 'string'));
      return source.annotationTypes.filter((a) => ids.has(a.id)).sort(byName).map((type): LegendEntry => ({ category, name: type.name, type }));
    }
  }
}
