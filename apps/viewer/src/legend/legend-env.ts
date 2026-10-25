/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A legend laid out from what the project holds: the one place that turns a
 * legend's configuration and the project's state into its primitives. The
 * legend tab, a sheet and the Wall's placement (which needs the size before
 * the legend is on the sheet) all call `layoutOf`; `readLegendEnv` is the same
 * state read now, for code that is not a component.
 */

import type { LegendConfig } from '@/catalogue/types';
import { DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import { parsePat } from '@/drafting/hatch/pattern';
import { drawingMaterialNames } from '@/project/material-resolver';
import { materialGraphics, materialNamesInModels } from '@/project/materials';
import { currentDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { useProjectStore } from '@/project/project-store';
import type { ProjectSheet, ProjectView } from '@/project/types';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import type { MeshData } from '@ifc-lite/geometry';
import { schemeResultOf } from '@/project/view-colour-scheme';
import { legendGroups, scopeViewIds, scopeViews, type LegendMaterial } from './legend-data';
import { layoutLegend, type LegendLabels, type LegendLayout } from './legend-layout';

export interface LegendEnv {
  labels: LegendLabels;
  views: ReturnType<typeof useProjectStore.getState>['views'];
  sheets: ProjectSheet[];
  drafts: ReturnType<typeof useProjectStore.getState>['drafts'];
  layers: ReturnType<typeof useProjectStore.getState>['draftLayers'];
  table: ReturnType<typeof useProjectStore.getState>['materials'];
  annotationTypes: ReturnType<typeof useProjectStore.getState>['annotationTypes'];
  symbols: ReturnType<typeof useProjectStore.getState>['symbols'];
  patterns: string;
  textStyles: ReturnType<typeof useProjectStore.getState>['textStyles'];
  byView: ReturnType<typeof useViewDrawings.getState>['byView'];
  /** The geometry the drawings were cut from: a colour scheme's rooms are its spaces. */
  meshes?: readonly MeshData[];
}

export function layoutOf(legend: LegendConfig, env: LegendEnv, placedOn?: string): LegendLayout {
  const ids = scopeViewIds(legend, env.sheets, placedOn);
  const inScope = ids === null ? env.drafts : env.drafts.filter((d) => ids.has(d.viewId));
  const names = ids === null
    ? materialNamesInModels()
    : [...new Set(scopeViews(legend, env.views, env.sheets, placedOn).flatMap((v) => drawingMaterialNames((env.byView[v.id] ?? EMPTY_VIEW_DRAWING).drawing)))];
  const materials: LegendMaterial[] = names.map((n) => materialGraphics(n, env.table ?? []));
  const hidden = legend.scope === 'view' && legend.scopeId ? new Set(env.views.find((v) => v.id === legend.scopeId)?.hiddenLayers ?? []) : undefined;
  const colours = coloursOf(scopeViews(legend, env.views, env.sheets, placedOn), env);
  const groups = legendGroups(legend, { materials, colours, layers: env.layers, drafts: inScope, hiddenLayers: hidden, annotationTypes: env.annotationTypes ?? [], symbols: env.symbols ?? [] });
  const textStyle = (env.textStyles ?? []).find((s) => s.id === legend.textStyle) ?? DEFAULT_TEXT_STYLE;
  return layoutLegend(groups, legend, { textStyle, patterns: parsePat(env.patterns).patterns, labels: env.labels });
}

/** The values the colour schemes of `views` paint, once each (the first view to show a value gives its colour), in the order the views are listed. */
function coloursOf(views: readonly ProjectView[], env: LegendEnv): { name: string; colour: string }[] {
  const out = new Map<string, { name: string; colour: string }>();
  for (const view of views) {
    for (const e of schemeResultOf(view, env.byView[view.id]?.drawing, env.meshes)?.entries ?? []) if (!out.has(e.key)) out.set(e.key, { name: e.label, colour: e.colour });
  }
  return [...out.values()];
}

/** The project's state a legend reads, as of this moment. */
export function readLegendEnv(labels: LegendLabels): LegendEnv {
  const p = useProjectStore.getState();
  return {
    labels, views: p.views, sheets: p.sheets, drafts: p.drafts, layers: p.draftLayers, table: p.materials, annotationTypes: p.annotationTypes,
    symbols: p.symbols, patterns: p.hatchPatterns ?? '', textStyles: p.textStyles, byView: useViewDrawings.getState().byView,
    meshes: currentDrawingRuntime().geometryResult?.meshes,
  };
}
