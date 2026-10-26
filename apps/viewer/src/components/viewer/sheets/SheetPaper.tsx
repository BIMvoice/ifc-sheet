/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A sheet drawn in paper millimetres: frame, title block and viewports.
 * The same SVG is shown on screen (scaled by CSS) and exported, so the
 * export is exactly what the user sees, at true scale.
 *
 * A viewport draws its view's generated drawing with pen weights by line
 * category (cut 0.5 mm, seen 0.25 mm, hidden 0.18 mm dashed), cut areas
 * toned, then the view's drafted geometry and annotations, clipped to the
 * viewport box.
 */

import { forwardRef, memo, useId, useMemo } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { useTranslation } from '@/i18n';
import type { SectionAxisName, ViewTransform } from '@/drafting/frame';
import { isGeometry, type DraftEntity, type DraftLayer, type SymbolInstanceShape } from '@/drafting/types';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import { frameOf, frameRect, titleBlockRect } from '@/project/sheet-frame';
import { mmPerMetre, paperOf, viewportBox } from '@/project/sheets';
import { annotationAtFactor, annotationFactor, viewportPaperUnit } from '@/project/viewport-annotation';
import type { ProjectSheet, ProjectView, SheetViewport, ViewRaster } from '@/project/types';
import { hasTrueScale } from '@/project/axonometric';
import { shapePath } from '../drafting/DraftOverlay';
import { AnnotationGraphics } from '../drafting/AnnotationGraphics';
import { cadKindOf, layerTags, penTags } from './dxf-tags';
import { layerPen, layerShows, lookOf } from '@/drafting/styles';
import { useProjectStore } from '@/project/project-store';
import { resolvedDraft } from '@/project/parametric-text';
import { TitleBlockGraphic } from './TitleBlockGraphic';
import { useSheetParamLookup } from './useSheetParams';
import { currentRevisionOf, printsAtCurrentRevision, sheetRevisions } from '@/project/revisions';
import { RevisionTable } from './RevisionTable';
import { viewportPens } from './viewport-pens';
import { appViewStyler } from '@/project/view-styler';
import { useViewerStore } from '@/store';
import { memoOn, sharedMemo } from './shared-memo';
import { resolveViewGraphics, viewportHiddenLayers } from '@bimvoice/ifcsheet';
import { useGraphicStandard } from '@/project/graphic-standard-actions';
import { cadPenContext } from '@/project/cad-layer-material';
import { OverlayPaths } from './OverlayPaths';
import type { PlanOverlay } from '@/project/plan-overlays';
import type { ScheduleLayout } from '@/joinery/schedule-layout';
import { ScheduleGraphic } from '../joinery/ScheduleGraphic';
import { CivilDrawingGraphic } from '../civil/CivilDrawingGraphic';
import { LegendGraphic } from '../legend/LegendGraphic';
import type { LegendLayout } from '@/legend/legend-layout';
import type { CivilLayout } from '@/civil/civil-drawings';
import { useLiveSymbolContext } from '@/siteplan/site-frame';
import { keyPlanHighlight, viewportExtent, type Rect } from '@/siteplan/key-plan';
import { KeyPlanHighlight, SiteOverlay, SiteSymbols } from '../siteplan/SiteGraphics';
import { SiteBalance } from '../siteplan/SiteBalance';
import type { SiteContent } from '../siteplan/useSheetSite';
import type { EntityStyleOf } from '@/project/model-styles';

/** The cut axis a drawing is put on paper by (`viewportTransform`), from its plane's axis. */
export const AXIS_NAME = { y: 'down', z: 'front', x: 'side' } as const;

export interface ViewportContent {
  view: ProjectView | undefined;
  drawing: Drawing2D | null;
  drafts: DraftEntity[];
  /** The drawing's number on this sheet, printed in its title. */
  drawingNumber?: string;
  /** A plan's symbols and roof lines by pen, drawing units. */
  overlays?: PlanOverlay[];
  /** A joinery schedule placed here instead of a view (paper millimetres). */
  schedule?: ScheduleLayout;
  /** A road drawing (profile / cross sections) placed here instead of a view (paper millimetres). */
  civil?: CivilLayout;
  /** A legend placed here instead of a view (paper millimetres). */
  legend?: LegendLayout;
  /** A site plan's plot, footprint, setbacks and areas (`siteplan/`). */
  site?: SiteContent;
  /** Each drawing entity's model style (`project/model-styles.ts`); absent: every model draws normally. */
  styleOf?: EntityStyleOf;
  /** A 3D view printed as a raster capture of the viewport, instead of drawn lines. */
  raster?: ViewRaster;
}

interface SheetPaperProps {
  sheet: ProjectSheet;
  projectName: string;
  content: (viewport: SheetViewport) => ViewportContent;
  layers: readonly DraftLayer[];
  extraPatterns: readonly HatchPattern[];
  selectedViewportId: string | null;
  /** On-screen pixels per millimetre; the export sets real `mm` units instead. */
  pxPerMm: number;
  /** Lines and annotations drawn on the sheet itself, paper millimetres. */
  sheetDrafts?: readonly DraftEntity[];
  /** Print only the clouds of the sheet's current revision (an issue's option); older revisions' clouds are left off. */
  currentCloudsOnly?: boolean;
  /** The date an issue is dated: the title block prints it as the sheet's date. */
  issueDate?: string;
}

/** The viewport's drawing → paper transform: the chosen (or drawing's) centre at the viewport centre. */
export function viewportTransform(vp: SheetViewport, drawing: Drawing2D | null, axis: SectionAxisName): ViewTransform {
  const s = mmPerMetre(vp);
  const b = drawing?.bounds;
  const c = vp.center ?? (b ? { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 } : { x: 0, y: 0 });
  const kx = axis === 'side' ? -1 : 1;
  const ky = axis !== 'down' ? -1 : 1;
  return { scale: s, x: vp.x - c.x * kx * s, y: vp.y - c.y * ky * s };
}

/** Width on paper of the drawing number's ring, mm: round for one or two characters, longer for a longer number. */
const numberWidth = (n: string, size: number): number => Math.max(size + 1, n.length * size * 0.6 + 2);

/** The drawing's number in a ring at the start of its title, at the title's text size (mm): the number a mark elsewhere names. */
function TitleNumber({ number, x, baseline, size }: { number: string | undefined; x: number; baseline: number; size: number }) {
  if (!number) return null;
  const w = numberWidth(number, size);
  return (
    <g {...penTags('VIEWPORT-LABELS', 0.25)}>
      <rect x={x} y={baseline - size - 0.4} width={w} height={size + 1} rx={(size + 1) / 2} fill="none" stroke="#000" strokeWidth={0.25} />
      <text x={x + w / 2} y={baseline - 0.2} fontSize={size * 0.8} fontWeight={700} textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif" fill="#000">{number}</text>
    </g>
  );
}

const pensMemo = sharedMemo<ReturnType<typeof viewportPens>>();

const ViewportGraphic = memo(function ViewportGraphic({ vp, content, layers, extraPatterns, selected, highlight = null }: {
  vp: SheetViewport; content: ViewportContent; layers: readonly DraftLayer[]; extraPatterns: readonly HatchPattern[]; selected: boolean;
  /** On a key plan: the part its keyed viewport shows, paper mm. */
  highlight?: Rect | null;
}) {
  const { t: tr } = useTranslation();
  const { view, drawing, drafts } = content;
  const standard = useGraphicStandard();
  const axis: SectionAxisName = drawing ? AXIS_NAME[drawing.config.plane.axis] : 'down';
  const t = viewportTransform(vp, drawing, axis);
  const cadLayers = useProjectStore((s) => s.cadLayers);
  // The graphics the view draws with: its template's, then its own over them (#44).
  const viewTemplates = useProjectStore((s) => s.viewTemplates);
  const graphics = useMemo(() => resolveViewGraphics(view, viewTemplates), [view, viewTemplates]);
  // The view's one styler (#34), the drafting view's too; a new one whenever what it styles from changes (the models, for property rules).
  const models = useViewerStore((s) => s.models);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const styler = useMemo(() => appViewStyler(graphics, drawing, standard, content.styleOf), [graphics, drawing, standard, content.styleOf, models, mutationVersion]);
  // Shared with every other component that pens this drawing the same way (`shared-memo.ts`): opening a sheet reuses the Wall's pens (#154).
  const pens = useMemo(
    () => (drawing ? memoOn(pensMemo, drawing, [graphics, vp, axis, extraPatterns, cadLayers, content.styleOf, standard, styler],
      () => viewportPens(drawing, graphics, viewportTransform(vp, drawing, axis), axis, extraPatterns, cadPenContext(cadLayers), content.styleOf, standard, styler)) : []),
    [drawing, graphics, vp, axis, extraPatterns, cadLayers, content.styleOf, standard, styler],
  );
  const box = viewportBox(vp, drawing?.bounds ?? null);
  const left = vp.x - box.width / 2;
  const top = vp.y - box.height / 2;
  const clipId = `vp-${vp.id}`;
  // A detail shows exactly its area (the drawing is centred on it); every other view, its box.
  const clip = view?.detail
    ? (() => {
        const w = ((view.detail.max.x - view.detail.min.x) * 1000) / vp.scale;
        const h = ((view.detail.max.y - view.detail.min.y) * 1000) / vp.scale;
        return { x: vp.x - w / 2, y: vp.y - h / 2, width: w, height: h };
      })()
    : { x: left, y: top, width: box.width, height: box.height };
  const { book, groups } = useDraftingStandards();
  // A layer shows in a viewport by its own switch, its group's, its view's and the viewport's (`viewportHiddenLayers`).
  const layerColor = new Map(layers.map((l) => [l.id, layerShows(l, groups, { view: viewportHiddenLayers(view, vp) }) ? l.color : null]));
  const layerById = new Map(layers.map((l) => [l.id, l]));
  // Annotation prints at the paper size it was drawn for, whatever scale the viewport shows the view at.
  const paperUnit = viewportPaperUnit(vp.scale);
  const factor = annotationFactor(vp.scale, view?.scale);
  // Scale bar, north arrow and coordinate points follow this viewport's scale and the model (`siteplan/live-symbols.ts`).
  const live = useLiveSymbolContext(drawing?.config.plane, axis, vp.scale);
  // A key plan is the whole plan alone: no drafting on it, only the outline of the part keyed.
  const keyPlan = vp.keyPlanOf !== undefined;
  return (
    <g data-viewport-id={vp.id}>
      <clipPath id={clipId}><rect x={clip.x} y={clip.y} width={clip.width} height={clip.height} /></clipPath>
      <g clipPath={`url(#${clipId})`}>
        {content.raster ? <image data-raster-px={`${content.raster.widthPx}x${content.raster.heightPx}`} href={content.raster.href} x={left} y={top} width={box.width} height={box.height} preserveAspectRatio="xMidYMid slice" /> : null}
        {pens.map((p, i) => (
          <path key={i} {...penTags(p.layer, p.width, !!p.dash, p.stroke ?? '#000000', p)} data-dxf-fill={p.solid ? 'solid' : undefined} d={p.d} fill={p.fill ?? 'none'} fillRule="evenodd" stroke={p.stroke ?? 'none'} strokeWidth={p.width} strokeDasharray={p.dash} strokeLinejoin="round" />
        ))}
        {content.overlays?.length && !keyPlan ? <OverlayPaths overlays={content.overlays} transform={t} axis={axis} /> : null}
        {content.site ? <SiteOverlay site={content.site} transform={t} axis={axis} scale={vp.scale} /> : null}
        {highlight ? <KeyPlanHighlight rect={highlight} /> : null}
        {(keyPlan ? [] : drafts).map((e) => {
          const color = layerColor.get(e.layerId);
          if (color === null) return null;
          return isGeometry(e.shape)
            ? <PenPath key={e.id} layer={layerById.get(e.layerId)} d={shapePath(e.shape, t, axis)} color={color ?? '#000'} />
            : <g key={e.id} {...layerTags(layerById.get(e.layerId), cadKindOf(e.shape))}><AnnotationGraphics shape={annotationAtFactor(e.shape, factor)} color={color ?? '#000'} selected={false} transform={t} axis={axis} extraPatterns={extraPatterns} strokeScale={0.25} look={lookOf(book, e.params)} paperUnit={paperUnit} symbols={live} /></g>;
        })}
      </g>
      <rect
        x={left} y={top} width={box.width} height={box.height} fill="transparent"
        stroke={selected ? '#2563eb' : 'transparent'} strokeWidth={0.4} strokeDasharray={selected ? '3 2' : undefined}
        data-export-ignore={selected ? 'true' : undefined}
      />
      <TitleNumber number={content.drawingNumber} x={left} baseline={top + box.height + standard.type.viewTitle + 1.5} size={standard.type.viewTitle} />
      <text {...penTags('VIEWPORT-LABELS', 0.25)} x={left + (content.drawingNumber ? numberWidth(content.drawingNumber, standard.type.viewTitle) + 2 : 0)} y={top + box.height + standard.type.viewTitle + 1.5} fontSize={standard.type.viewTitle} fontFamily="ui-sans-serif, system-ui, sans-serif" fill="#000">
        {keyPlan ? tr('site.keyPlan.label') : hasTrueScale(view) ? tr('sheets.viewportLabel', { name: view?.name ?? '?', scale: vp.scale }) : tr('sheets.viewportLabelNoScale', { name: view?.name ?? '?' })}
      </text>
      {content.site ? <SiteBalance x={left} y={top + box.height + standard.type.viewTitle + 4} /> : null}
      {content.site ? <SiteSymbols site={content.site} transform={t} axis={axis} scale={vp.scale} box={{ x: left, y: top, width: box.width, height: box.height }} live={live}
        symbols={drafts.flatMap((e): SymbolInstanceShape[] => {
          const shown = e.shape.type === 'symbol' && layerColor.get(e.layerId) !== null ? annotationAtFactor(e.shape, factor) : null;
          return shown?.type === 'symbol' ? [shown] : [];
        })} /> : null}
    </g>
  );
});

/** A road drawing placed on the sheet, centred on its viewport point. */
function CivilViewport({ vp, layout, selected }: { vp: SheetViewport; layout: CivilLayout; selected: boolean }) {
  const { width, height } = layout;
  return (
    <g data-viewport-id={vp.id}>
      <CivilDrawingGraphic layout={layout} x={vp.x - width / 2} y={vp.y - height / 2} />
      <rect x={vp.x - width / 2} y={vp.y - height / 2} width={width} height={height} fill="transparent"
        stroke={selected ? '#2563eb' : 'transparent'} strokeWidth={0.4} strokeDasharray={selected ? '3 2' : undefined} data-export-ignore={selected ? 'true' : undefined} />
    </g>
  );
}

/**
 * A schedule placed on the sheet. One wrapped to its viewport's box (`layout.fit`, the joinery lists) is drawn at the box's top
 * left and clipped to it, so nothing of it lies outside what the viewport gives it; another is centred on the viewport point.
 */
function ScheduleViewport({ vp, layout, selected }: { vp: SheetViewport; layout: ScheduleLayout; selected: boolean }) {
  const clipId = useId();
  const box = layout.fit?.box ?? { x: vp.x - layout.width / 2, y: vp.y - layout.height / 2, w: layout.width, h: layout.height };
  return (
    <g data-viewport-id={vp.id}>
      {layout.fit ? <clipPath id={clipId}><rect x={box.x} y={box.y} width={box.w} height={box.h} /></clipPath> : null}
      <g clipPath={layout.fit ? `url(#${clipId})` : undefined}><ScheduleGraphic layout={layout} x={box.x} y={box.y} /></g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent"
        stroke={selected ? '#2563eb' : 'transparent'} strokeWidth={0.4} strokeDasharray={selected ? '3 2' : undefined} data-export-ignore={selected ? 'true' : undefined} />
    </g>
  );
}

/** A legend placed on the sheet, centred on its viewport point. */
function LegendViewport({ vp, layout, selected }: { vp: SheetViewport; layout: LegendLayout; selected: boolean }) {
  const { width, height } = layout;
  return (
    <g data-viewport-id={vp.id}>
      <LegendGraphic layout={layout} x={vp.x - width / 2} y={vp.y - height / 2} />
      <rect x={vp.x - width / 2} y={vp.y - height / 2} width={width} height={height} fill="transparent"
        stroke={selected ? '#2563eb' : 'transparent'} strokeWidth={0.4} strokeDasharray={selected ? '3 2' : undefined} data-export-ignore={selected ? 'true' : undefined} />
    </g>
  );
}

const PAPER: ViewTransform = { scale: 1, x: 0, y: 0 };

/** On a key plan, the box of the viewport it keys taken to its own paper (`siteplan/key-plan.ts`); else null. */
function keyedExtent(sheet: ProjectSheet, vp: SheetViewport, content: (vp: SheetViewport) => ViewportContent, own: ViewportContent): Rect | null {
  const keyed = vp.keyPlanOf ? (sheet.viewports ?? []).find((o) => o.id === vp.keyPlanOf) : undefined;
  const drawing = keyed ? content(keyed).drawing : null;
  if (!keyed || !drawing || !own.drawing) return null;
  const axis = AXIS_NAME[drawing.config.plane.axis];
  const box = viewportBox(keyed, drawing.bounds);
  const extent = viewportExtent({ x: keyed.x - box.width / 2, y: keyed.y - box.height / 2, width: box.width, height: box.height }, viewportTransform(keyed, drawing, axis), axis);
  return keyPlanHighlight(extent, viewportTransform(vp, own.drawing, AXIS_NAME[own.drawing.config.plane.axis]), axis);
}

/** The project's styles and layer groups, as drafting graphics need them. */
function useDraftingStandards() {
  const textStyles = useProjectStore((s) => s.textStyles);
  const dimStyles = useProjectStore((s) => s.dimStyles);
  const groups = useProjectStore((s) => s.layerGroups);
  const book = useMemo(() => ({ textStyles: textStyles ?? [], dimStyles: dimStyles ?? [] }), [textStyles, dimStyles]);
  return { book, groups: groups ?? [] };
}

/** A drafted line on paper with its layer's pen (weight and line type, millimetres). */
function PenPath({ layer, d, color }: { layer: DraftLayer | undefined; d: string; color: string }) {
  const pen = layerPen(layer);
  return <path {...layerTags(layer)} d={d} stroke={color} strokeWidth={pen.width} strokeDasharray={pen.dash.length ? pen.dash.join(' ') : undefined} fill="none" />;
}

/** The sheet's own lines and annotations, on the paper. */
function SheetDrafts({ sheet, projectName, issueDate, entities, layers, extraPatterns }: { sheet: ProjectSheet; projectName: string; issueDate?: string; entities: readonly DraftEntity[]; layers: readonly DraftLayer[]; extraPatterns: readonly HatchPattern[] }) {
  const { book, groups } = useDraftingStandards();
  const lookup = useSheetParamLookup(sheet, projectName, issueDate);
  const colour = new Map(layers.map((l) => [l.id, layerShows(l, groups) ? l.color : null]));
  const layerById = new Map(layers.map((l) => [l.id, l]));
  return (
    <g>
      {entities.map((drafted) => {
        // A parametric text prints with its parameters filled in.
        const e = resolvedDraft(drafted, lookup);
        const color = colour.get(e.layerId);
        if (color === null) return null;
        return isGeometry(e.shape)
          ? <PenPath key={e.id} layer={layerById.get(e.layerId)} d={shapePath(e.shape, PAPER, 'down')} color={color ?? '#000'} />
          : <g key={e.id} {...layerTags(layerById.get(e.layerId), cadKindOf(e.shape))}><AnnotationGraphics shape={e.shape} color={color ?? '#000'} selected={false} transform={PAPER} axis="down" extraPatterns={extraPatterns} strokeScale={0.25} look={lookOf(book, e.params)} paperUnit={1} /></g>;
      })}
    </g>
  );
}

export const SheetPaper = forwardRef<SVGSVGElement, SheetPaperProps>(function SheetPaper(
  { sheet, projectName, content, layers, extraPatterns, selectedViewportId, pxPerMm, sheetDrafts = [], currentCloudsOnly = false, issueDate }, ref,
) {
  const { w, h } = paperOf(sheet);
  const revisions = useProjectStore((s) => s.revisions);
  const projectDrafts = useProjectStore((s) => s.drafts);
  const own = useMemo(() => sheetRevisions(sheet, { revisions, drafts: projectDrafts }), [sheet, revisions, projectDrafts]);
  const shows = useMemo(() => {
    if (!currentCloudsOnly) return null;
    const current = currentRevisionOf(sheet, { revisions, drafts: projectDrafts });
    return (d: DraftEntity) => printsAtCurrentRevision(d, current, { revisions });
  }, [currentCloudsOnly, sheet, revisions, projectDrafts]);
  const pen = useGraphicStandard().sheet.frame;
  const frame = frameRect({ w, h }, frameOf(sheet));
  return (
    <svg ref={ref} data-sheet-id={sheet.id} xmlns="http://www.w3.org/2000/svg" width={w * pxPerMm} height={h * pxPerMm} viewBox={`0 0 ${w} ${h}`} className="block bg-white shadow-lg">
      <rect data-export-ignore-dxf="true" x={0} y={0} width={w} height={h} fill="#fff" />
      <rect {...penTags('FRAME', pen)} x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="none" stroke="#000" strokeWidth={pen} />
      {(sheet.viewports ?? []).map((vp) => {
        const c0 = content(vp);
        const c = shows ? { ...c0, drafts: c0.drafts.filter(shows) } : c0;
        if (c.civil) return <CivilViewport key={vp.id} vp={vp} layout={c.civil} selected={vp.id === selectedViewportId} />;
        if (c.legend) return <LegendViewport key={vp.id} vp={vp} layout={c.legend} selected={vp.id === selectedViewportId} />;
        return c.schedule
          ? <ScheduleViewport key={vp.id} vp={vp} layout={c.schedule} selected={vp.id === selectedViewportId} />
          : <ViewportGraphic key={vp.id} vp={vp} content={c} layers={layers} extraPatterns={extraPatterns} selected={vp.id === selectedViewportId} highlight={keyedExtent(sheet, vp, content, c)} />;
      })}
      <RevisionTable revisions={own} block={titleBlockRect({ w, h }, frameOf(sheet))} strip={frameOf(sheet).titleBlock === 'right'} />
      <TitleBlockGraphic sheet={sheet} projectName={projectName} w={w} h={h} issueDate={issueDate} />
      <SheetDrafts sheet={sheet} projectName={projectName} issueDate={issueDate} entities={shows ? sheetDrafts.filter(shows) : sheetDrafts} layers={layers} extraPatterns={extraPatterns} />
    </svg>
  );
});
