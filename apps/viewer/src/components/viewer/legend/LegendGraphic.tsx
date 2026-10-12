/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A legend's primitives as SVG, in paper millimetres — in its own tab and on
 * sheets alike — tagged for the DXF exporter (layer LEGEND). `useLegendLayout`
 * reads what the legend lists live: it follows the drawings, the layers, the
 * materials, the symbols and the annotation types of the project.
 */

import { memo, useMemo } from 'react';
import type { LegendConfig, ProjectLegend } from '@/catalogue/types';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useViewerStore } from '@/store';
import { fontFamily, DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import { parsePat } from '@/drafting/hatch/pattern';
import { legendGroups, scopeViewIds, scopeViews, type LegendMaterial } from '@/legend/legend-data';
import { LEGEND_CATEGORIES } from '@/catalogue/types';
import { layoutLegend, type LegendLabels, type LegendLayout, type LegendPrim } from '@/legend/legend-layout';
import { drawingMaterialNames } from '@/project/material-resolver';
import { materialGraphics, materialNamesInModels } from '@/project/materials';
import { useProjectStore } from '@/project/project-store';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import type { ProjectSheet } from '@/project/types';
import { penTags } from '../sheets/dxf-tags';

export function useLegendLabels(): LegendLabels {
  const { t } = useTranslation();
  return useMemo(() => ({
    heading: Object.fromEntries(LEGEND_CATEGORIES.map((c) => [c, t(`legend.category.${c}` as TranslationKey)])) as LegendLabels['heading'],
    tool: (tool) => t(`atype.tool.${tool}` as TranslationKey),
    continued: (heading) => t('legend.continued', { heading }),
    membrane: t('legend.membrane'),
    sampleText: t('legend.sampleText'),
  }), [t]);
}

interface LegendEnv {
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
}

/** Everything a legend lists, as of now; a new object whenever any of it changes. */
function useLegendEnv(): LegendEnv {
  const labels = useLegendLabels();
  const views = useProjectStore((s) => s.views);
  const sheets = useProjectStore((s) => s.sheets);
  const drafts = useProjectStore((s) => s.drafts);
  const layers = useProjectStore((s) => s.draftLayers);
  const table = useProjectStore((s) => s.materials);
  const annotationTypes = useProjectStore((s) => s.annotationTypes);
  const symbols = useProjectStore((s) => s.symbols);
  const patterns = useProjectStore((s) => s.hatchPatterns) ?? '';
  const textStyles = useProjectStore((s) => s.textStyles);
  const byView = useViewDrawings((s) => s.byView);
  // The viewer store: material names are read from the loaded models, which edits and loads change.
  const models = useViewerStore((s) => s.models);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  return useMemo(
    () => ({ labels, views, sheets, drafts, layers, table, annotationTypes, symbols, patterns, textStyles, byView }),
    // models / mutationVersion do not appear in the env but must make a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labels, views, sheets, drafts, layers, table, annotationTypes, symbols, patterns, textStyles, byView, models, mutationVersion],
  );
}

function layoutOf(legend: LegendConfig, env: LegendEnv, placedOn?: string): LegendLayout {
  const ids = scopeViewIds(legend, env.sheets, placedOn);
  const inScope = ids === null ? env.drafts : env.drafts.filter((d) => ids.has(d.viewId));
  const names = ids === null
    ? materialNamesInModels()
    : [...new Set(scopeViews(legend, env.views, env.sheets, placedOn).flatMap((v) => drawingMaterialNames((env.byView[v.id] ?? EMPTY_VIEW_DRAWING).drawing)))];
  const materials: LegendMaterial[] = names.map((n) => materialGraphics(n, env.table ?? []));
  const hidden = legend.scope === 'view' && legend.scopeId ? new Set(env.views.find((v) => v.id === legend.scopeId)?.hiddenLayers ?? []) : undefined;
  const groups = legendGroups(legend, { materials, layers: env.layers, drafts: inScope, hiddenLayers: hidden, annotationTypes: env.annotationTypes ?? [], symbols: env.symbols ?? [] });
  const textStyle = (env.textStyles ?? []).find((s) => s.id === legend.textStyle) ?? DEFAULT_TEXT_STYLE;
  return layoutLegend(groups, legend, { textStyle, patterns: parsePat(env.patterns).patterns, labels: env.labels });
}

/** The layout of a legend now. `placedOn` is the sheet a placed legend sits on (what a sheet-scoped legend with no sheet of its own follows). */
export function useLegendLayout(legend: LegendConfig | undefined, placedOn?: string): LegendLayout | null {
  const env = useLegendEnv();
  return useMemo(() => (legend ? layoutOf(legend, env, placedOn) : null), [legend, env, placedOn]);
}

/** The layouts of the legends placed on `sheet`, by legend id. */
export function useSheetLegends(sheet: ProjectSheet): Map<string, LegendLayout> {
  const legends = useProjectStore((s) => s.legends);
  const env = useLegendEnv();
  return useMemo(() => {
    const out = new Map<string, LegendLayout>();
    for (const vp of sheet.viewports ?? []) {
      const legend = legends?.find((l) => l.id === vp.viewId);
      if (legend && !out.has(legend.id)) out.set(legend.id, layoutOf(legend, env, sheet.id));
    }
    return out;
  }, [sheet.viewports, sheet.id, legends, env]);
}

function Prim({ p }: { p: LegendPrim }) {
  if (p.kind === 'line') {
    return <line {...penTags('LEGEND', p.w, p.dash, p.color)} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.color ?? '#000'} strokeWidth={p.w} strokeDasharray={p.dash ? '1.4 0.9' : undefined} />;
  }
  if (p.kind === 'path') {
    const d = p.pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`).join('') + (p.closed ? 'Z' : '');
    return <path {...penTags('LEGEND', p.w, p.dash, p.color)} d={d} fill={p.fill ?? 'none'} stroke={p.color ?? '#000'} strokeWidth={p.w} strokeDasharray={p.dash ? '1.4 0.9' : undefined} strokeLinejoin="round" />;
  }
  return (
    <text {...penTags('LEGEND', 0.18)} x={p.x} y={p.y} fontSize={p.size} fontFamily={fontFamily(p.font ?? 'sans')} fontWeight={p.bold ? 700 : 400} fill="#000" textAnchor={p.anchor}>
      {p.text}
    </text>
  );
}

/** The legend at (x, y) on the paper (its top-left corner). */
export const LegendGraphic = memo(function LegendGraphic({ layout, x = 0, y = 0 }: { layout: LegendLayout; x?: number; y?: number }) {
  return (
    <g transform={x || y ? `translate(${x} ${y})` : undefined}>
      {layout.prims.map((p, i) => <Prim key={i} p={p} />)}
    </g>
  );
});

export type { ProjectLegend };
