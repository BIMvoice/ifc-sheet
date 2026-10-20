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

import { forwardRef, memo, useMemo } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { useTranslation } from '@/i18n';
import type { SectionAxisName, ViewTransform } from '@/drafting/frame';
import { isGeometry, type DraftEntity, type DraftLayer, type SymbolInstanceShape } from '@/drafting/types';
import type { HatchPattern } from '@/drafting/hatch/pattern';
import { FRAME_MARGIN_MM, mmPerMetre, paperOf, TITLE_BLOCK_MM, viewportBox } from '@/project/sheets';
import { annotationAtFactor, annotationFactor, viewportPaperUnit } from '@/project/viewport-annotation';
import type { ProjectSheet, ProjectView, SheetViewport, ViewRaster } from '@/project/types';
import { hasTrueScale } from '@/project/axonometric';
import { shapePath } from '../drafting/DraftOverlay';
import { AnnotationGraphics } from '../drafting/AnnotationGraphics';
import { cadKindOf, layerTags, penTags } from './dxf-tags';
import { layerPen, layerShows, lookOf } from '@/drafting/styles';
import { useProjectStore } from '@/project/project-store';
import { LOGO_FIELD, titleBlockOf } from '@/project/title-block';
import { useEffectiveTitleBlock } from '@/project/title-block-model';
import { viewportPens } from './viewport-pens';
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
import { KeyPlanHighlight, SiteBalance, SiteOverlay, SiteSymbols } from '../siteplan/SiteGraphics';
import type { SiteContent } from '../siteplan/useSheetSite';
import type { EntityStyleOf } from '@/project/model-styles';

/** The cut axis a drawing is put on paper by (`viewportTransform`), from its plane's axis. */
export const AXIS_NAME = { y: 'down', z: 'front', x: 'side' } as const;
const LABEL_MM = 3.5;

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
const numberWidth = (n: string): number => Math.max(LABEL_MM + 1, n.length * LABEL_MM * 0.6 + 2);

/** The drawing's number in a ring at the start of its title: the number a mark elsewhere names. */
function TitleNumber({ number, x, baseline }: { number: string | undefined; x: number; baseline: number }) {
  if (!number) return null;
  const w = numberWidth(number);
  return (
    <g {...penTags('VIEWPORT-LABELS', 0.25)}>
      <rect x={x} y={baseline - LABEL_MM - 0.4} width={w} height={LABEL_MM + 1} rx={(LABEL_MM + 1) / 2} fill="none" stroke="#000" strokeWidth={0.25} />
      <text x={x + w / 2} y={baseline - 0.2} fontSize={LABEL_MM * 0.8} fontWeight={700} textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif" fill="#000">{number}</text>
    </g>
  );
}

const ViewportGraphic = memo(function ViewportGraphic({ vp, content, layers, extraPatterns, selected, highlight = null }: {
  vp: SheetViewport; content: ViewportContent; layers: readonly DraftLayer[]; extraPatterns: readonly HatchPattern[]; selected: boolean;
  /** On a key plan: the part its keyed viewport shows, paper mm. */
  highlight?: Rect | null;
}) {
  const { t: tr } = useTranslation();
  const { view, drawing, drafts } = content;
  const axis: SectionAxisName = drawing ? AXIS_NAME[drawing.config.plane.axis] : 'down';
  const t = viewportTransform(vp, drawing, axis);
  const cadLayers = useProjectStore((s) => s.cadLayers);
  const pens = useMemo(
    () => (drawing ? viewportPens(drawing, view?.graphics, viewportTransform(vp, drawing, axis), axis, extraPatterns, cadPenContext(cadLayers), content.styleOf) : []),
    [drawing, view?.graphics, vp, axis, extraPatterns, cadLayers, content.styleOf],
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
  // A layer shows in a viewport by its own switch, its group's, its view's and the viewport's.
  const layerColor = new Map(layers.map((l) => [l.id, layerShows(l, groups, { view: view?.hiddenLayers, viewport: vp.hiddenLayers }) ? l.color : null]));
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
          <path key={i} {...penTags(p.layer, p.width, !!p.dash, p.stroke ?? '#000000', p)} d={p.d} fill={p.fill ?? 'none'} fillRule="evenodd" stroke={p.stroke ?? 'none'} strokeWidth={p.width} strokeDasharray={p.dash} strokeLinejoin="round" />
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
      <TitleNumber number={content.drawingNumber} x={left} baseline={top + box.height + LABEL_MM + 1.5} />
      <text {...penTags('VIEWPORT-LABELS', 0.25)} x={left + (content.drawingNumber ? numberWidth(content.drawingNumber) + 2 : 0)} y={top + box.height + LABEL_MM + 1.5} fontSize={LABEL_MM} fontFamily="ui-sans-serif, system-ui, sans-serif" fill="#000">
        {keyPlan ? tr('site.keyPlan.label') : hasTrueScale(view) ? tr('sheets.viewportLabel', { name: view?.name ?? '?', scale: vp.scale }) : tr('sheets.viewportLabelNoScale', { name: view?.name ?? '?' })}
      </text>
      {content.site ? <SiteBalance site={content.site} x={left} y={top + box.height + LABEL_MM + 4} /> : null}
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

/** A joinery schedule placed on the sheet, centred on its viewport point. */
function ScheduleViewport({ vp, layout, selected }: { vp: SheetViewport; layout: ScheduleLayout; selected: boolean }) {
  const { width, height } = layout;
  return (
    <g data-viewport-id={vp.id}>
      <ScheduleGraphic layout={layout} x={vp.x - width / 2} y={vp.y - height / 2} />
      <rect x={vp.x - width / 2} y={vp.y - height / 2} width={width} height={height} fill="transparent"
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
function SheetDrafts({ entities, layers, extraPatterns }: { entities: readonly DraftEntity[]; layers: readonly DraftLayer[]; extraPatterns: readonly HatchPattern[] }) {
  const { book, groups } = useDraftingStandards();
  const colour = new Map(layers.map((l) => [l.id, layerShows(l, groups) ? l.color : null]));
  const layerById = new Map(layers.map((l) => [l.id, l]));
  return (
    <g>
      {entities.map((e) => {
        const color = colour.get(e.layerId);
        if (color === null) return null;
        return isGeometry(e.shape)
          ? <PenPath key={e.id} layer={layerById.get(e.layerId)} d={shapePath(e.shape, PAPER, 'down')} color={color ?? '#000'} />
          : <g key={e.id} {...layerTags(layerById.get(e.layerId), cadKindOf(e.shape))}><AnnotationGraphics shape={e.shape} color={color ?? '#000'} selected={false} transform={PAPER} axis="down" extraPatterns={extraPatterns} strokeScale={0.25} look={lookOf(book, e.params)} paperUnit={1} /></g>;
      })}
    </g>
  );
}

/**
 * The title block, bottom right (180 × 50 mm): project / address and client /
 * organisation in halves, the sheet title across, drawn / checked by and date / revision in halves; at the
 * right the logo, the sheet number and its scale. Fields are the project's
 * with the sheet's own on top (`title-block.ts`).
 */
/** The size of a value in a half-width cell (about 61 mm of text): 3.5 mm, smaller for a longer value so that all of it prints inside its cell. */
const valueSize = (value: string): number => Math.max(1.6, Math.min(3.5, 61 / (0.55 * Math.max(1, value.length))));

function TitleBlock({ sheet, projectName, w, h }: { sheet: ProjectSheet; projectName: string; w: number; h: number }) {
  const { t } = useTranslation();
  const projectFields = useEffectiveTitleBlock();
  const x = w - FRAME_MARGIN_MM - TITLE_BLOCK_MM.w;
  const y = h - FRAME_MARGIN_MM - TITLE_BLOCK_MM.h;
  const fields = titleBlockOf(sheet, projectFields, projectName);
  const logo = projectFields?.[LOGO_FIELD];
  const views = useProjectStore((s) => s.views);
  // A perspective has no scale to state.
  const scales = [...new Set((sheet.viewports ?? []).filter((v) => hasTrueScale(views.find((x) => x.id === v.viewId))).map((v) => v.scale))];
  const scaleText = scales.length === 1 ? `1:${scales[0]}` : scales.length === 0 ? '—' : t('sheets.asIndicated');
  const side = 50;
  const left = TITLE_BLOCK_MM.w - side;
  const rowH = TITLE_BLOCK_MM.h / 5;
  // [label, value, column 0 or 1 of 2, or -1 across]
  const cells: [string, string, number, number][] = [
    [t('sheets.tb.project'), fields.project ?? '', 0, 0],
    [t('sheets.tb.address'), fields.address ?? '', 0, 1],
    [t('sheets.tb.client'), fields.client ?? '', 1, 0],
    [t('sheets.tb.organisation'), fields.organisation ?? '', 1, 1],
    [t('sheets.tb.title'), sheet.name, 2, -1],
    [t('sheets.tb.drawnBy'), fields.drawnBy ?? '', 3, 0],
    [t('sheets.tb.checkedBy'), fields.checkedBy ?? '', 3, 1],
    [t('sheets.tb.date'), fields.date ?? '', 4, 0],
    [t('sheets.tb.revision'), fields.revision ?? '', 4, 1],
  ];
  const font = 'ui-sans-serif, system-ui, sans-serif';
  const sx = x + left;
  return (
    <g {...penTags('TITLEBLOCK', 0.35)}>
      <rect x={x} y={y} width={TITLE_BLOCK_MM.w} height={TITLE_BLOCK_MM.h} fill="#fff" stroke="#000" strokeWidth={0.5} />
      {[1, 2, 3, 4].map((i) => <line key={i} x1={x} y1={y + rowH * i} x2={sx} y2={y + rowH * i} stroke="#000" strokeWidth={0.18} />)}
      {[[0, 2], [3, 5]].map(([from, to]) => <line key={from} x1={x + left / 2} y1={y + rowH * from} x2={x + left / 2} y2={y + rowH * to} stroke="#000" strokeWidth={0.18} />)}
      {cells.map(([label, value, row, col]) => {
        const cx = x + (col === 1 ? left / 2 : 0);
        return (
          <g key={label}>
            <text x={cx + 2} y={y + rowH * row + 3.2} fontSize={2} fontFamily={font} fill="#52525b">{label}</text>
            <text x={cx + 2} y={y + rowH * row + 8} fontSize={col < 0 ? 3.5 : valueSize(value)} fontFamily={font} fill="#000">{value}</text>
          </g>
        );
      })}
      <line x1={sx} y1={y} x2={sx} y2={y + TITLE_BLOCK_MM.h} stroke="#000" strokeWidth={0.35} />
      <line x1={sx} y1={y + 14} x2={x + TITLE_BLOCK_MM.w} y2={y + 14} stroke="#000" strokeWidth={0.18} />
      <line x1={sx} y1={y + 34} x2={x + TITLE_BLOCK_MM.w} y2={y + 34} stroke="#000" strokeWidth={0.18} />
      {logo ? <image data-export-ignore-dxf="true" href={logo} x={sx + 2} y={y + 1.5} width={side - 4} height={11} preserveAspectRatio="xMidYMid meet" /> : null}
      <text x={sx + 2} y={y + 17.2} fontSize={2} fontFamily={font} fill="#52525b">{t('sheets.tb.number')}</text>
      <text x={sx + 2} y={y + 29.5} fontSize={9} fontWeight={700} fontFamily={font} fill="#000">{sheet.number}</text>
      <text x={sx + 2} y={y + 37.2} fontSize={2} fontFamily={font} fill="#52525b">{t('sheets.tb.scale')}</text>
      <text x={sx + 2} y={y + 45.5} fontSize={4.5} fontFamily={font} fill="#000">{scaleText}</text>
    </g>
  );
}

export const SheetPaper = forwardRef<SVGSVGElement, SheetPaperProps>(function SheetPaper(
  { sheet, projectName, content, layers, extraPatterns, selectedViewportId, pxPerMm, sheetDrafts = [] }, ref,
) {
  const { w, h } = paperOf(sheet);
  return (
    <svg ref={ref} data-sheet-id={sheet.id} xmlns="http://www.w3.org/2000/svg" width={w * pxPerMm} height={h * pxPerMm} viewBox={`0 0 ${w} ${h}`} className="block bg-white shadow-lg">
      <rect data-export-ignore-dxf="true" x={0} y={0} width={w} height={h} fill="#fff" />
      <rect {...penTags('FRAME', 0.7)} x={FRAME_MARGIN_MM} y={FRAME_MARGIN_MM} width={w - FRAME_MARGIN_MM * 2} height={h - FRAME_MARGIN_MM * 2} fill="none" stroke="#000" strokeWidth={0.7} />
      {(sheet.viewports ?? []).map((vp) => {
        const c = content(vp);
        if (c.civil) return <CivilViewport key={vp.id} vp={vp} layout={c.civil} selected={vp.id === selectedViewportId} />;
        if (c.legend) return <LegendViewport key={vp.id} vp={vp} layout={c.legend} selected={vp.id === selectedViewportId} />;
        return c.schedule
          ? <ScheduleViewport key={vp.id} vp={vp} layout={c.schedule} selected={vp.id === selectedViewportId} />
          : <ViewportGraphic key={vp.id} vp={vp} content={c} layers={layers} extraPatterns={extraPatterns} selected={vp.id === selectedViewportId} highlight={keyedExtent(sheet, vp, content, c)} />;
      })}
      <TitleBlock sheet={sheet} projectName={projectName} w={w} h={h} />
      <SheetDrafts entities={sheetDrafts} layers={layers} extraPatterns={extraPatterns} />
    </svg>
  );
});
