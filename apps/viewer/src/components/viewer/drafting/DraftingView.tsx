/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drawing tab's drafting view (phase 4): the view's own generated
 * drawing (`Drawing2DCanvas`, as the Drawing panel renders it), the
 * drafted entities and command previews over it, and the command line.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { GraphicOverrideEngine } from '@ifc-lite/drawing-2d';
import { isGeometry } from '@/drafting/types';
import { type SectionAxisName } from '@/drafting/frame';
import { parsePat } from '@/drafting/hatch/pattern';

import { viewPlaneConfig, viewWorkPlane } from '@/project/view-plane-config';

import { mergedSectionBounds } from '@/lib/section/section-distance';

import { FileDown, Layers, Maximize2, Redo2, Undo2 } from 'lucide-react';

import { openStandards } from '@/project/standards-dialog-store';

import { useTranslation } from '@/i18n';

import { cn } from '@/lib/utils';

import { viewportState } from '@/project/viewport-state';
import { ViewportState } from '../wall/ViewportState';

import { IconButton } from '@/components/ui/icon-button';

import { Drawing2DCanvas } from '@/components/viewer/Drawing2DCanvas';

import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';

import { useViewControls } from '@/hooks/useViewControls';

import { useViewerStore } from '@/store';

import { useProjectStore } from '@/project/project-store';

import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';

import type { ProjectView } from '@/project/types';

import { referenceSet, referencesIn } from '@/drafting/references';
import { draftsOfView } from '@/drafting/draft-store';

import { redoEarliest, undoLatest } from '@/project/unified-undo';

import {
  attachDraftingView,
  currentLayerId,
  pressEscape,
  runningCommand,
  setCurrentLayer,
  submitCommandLine,
  toggleOrtho,
  toggleSnap,
  useDraftingSession,
  pickEntity,
  setDraftSelection,
} from '@/drafting/session';
import { DraftOverlay } from './DraftOverlay';

import { modelHighlight } from './drafting-shapes';

import { useDraftingProviders } from './useDraftingProviders';

import { CommandLine } from './CommandLine';

import { useDraftingPointer } from './useDraftingPointer';

import { useDraftingKeys } from './useDraftingKeys';

import { DraftPropertiesPanel } from './DraftPropertiesPanel';

import { SelectionBar } from './SelectionBar';

import { gripsOf } from '@/drafting/grips';

import { grippable } from '@/drafting/section-link';

import { cropClipPath, isDetailMark, selectedDetailGrips } from '@/drafting/detail-mark';

import { selectedSectionBand } from '@/drafting/section-depth';

import { screenToDrawing } from '@/drafting/frame';

import { useModelCommandBridge } from './ModelCommandLayer';

import { OpeningSymbolsLayer } from './OpeningSymbolsLayer';

import { CutHatchLayer } from './CutHatchLayer';

import { MembraneLayer } from './MembraneLayer';

import { RoofPlanLayer } from '../roof/RoofPlanLayer';

import { roofAtPoint } from '@/project/roof-plan';

import { editRoofBlock } from '@/project/roof-block';

import { useRoofDialog } from '@/project/roof-dialog-store';

import { exportViewDxf } from './view-dxf';

import { viewOmits } from '@/project/discipline-facts';

import { planOverlays } from '@/project/plan-overlays';

import { viewMaterials } from '@/project/material-resolver';

import { membraneOverlays } from '@/project/membrane-overlays';

import { partHostType } from '@/project/part-host';

import { phaseMeshes, phaseViewOf } from '@/project/phase-view';
import { cutHatches, hiddenClasses, DEFAULT_VIEW_PRESET, styledDrawing, viewOverrideRules } from '@/project/view-graphics';

import { capturePointer } from '@/lib/pointer-capture';

import { useCommandRuntime } from '@/lib/commands/modeling/runtime';


const AXIS_NAME = { y: 'down', z: 'front', x: 'side' } as const;
const NO_SHEET_TRANSFORM = { current: null };

/**
 * `bare`: the drawing alone, as IfcSheet shows it inside a sheet: no toolbar,
 * no property grid; only the prompt line stays, it carries the tools' choices.
 */
export function DraftingView({ view, bare = false }: { view: Exclude<ProjectView, { kind: '3d' }>; bare?: boolean }) {
  const { t } = useTranslation();
  const entry = useViewDrawings((s) => s.byView[view.id]) ?? EMPTY_VIEW_DRAWING;
  const { drawing, status } = entry;
  const showHiddenLines = useViewerStore((s) => s.drawing2DDisplayOptions.showHiddenLines);
  const allDrafts = useProjectStore((s) => s.drafts);
  const layers = useProjectStore((s) => s.draftLayers);
  const views = useProjectStore((s) => s.views);
  const selection = useDraftingSession((s) => s.selection);
  const ortho = useDraftingSession((s) => s.ortho || s.orthoHeld);
  const snap = useDraftingSession((s) => s.snap);
  useDraftingSession((s) => s.revision);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  const levels = useProjectStore((s) => s.levels);
  const models = useViewerStore((s) => s.models);
  const legacyGeometry = useViewerStore((s) => s.geometryResult);
  // The drawing's own plane; without a drawing (an empty project) the view's work plane.
  const modelBounds = useMemo(() => mergedSectionBounds(models, legacyGeometry), [models, legacyGeometry]);
  const fallbackPlane = useMemo(() => viewPlaneConfig(view, levels, mergedSectionBounds(models, legacyGeometry)), [view, levels, models, legacyGeometry]);
  const plane = drawing?.config.plane ?? fallbackPlane ?? undefined;
  const axis: SectionAxisName = plane ? AXIS_NAME[plane.axis] : 'down';
  const sectionPlane = useMemo(() => ({ axis, position: plane?.position ?? 0, flipped: plane?.flipped ?? false }), [axis, plane]);
  // Pinned: a regenerated drawing (an element added, edited) keeps the user's framing. No
  // automatic fit while a BIM tool is drawing — the clicks would land somewhere else.
  const bimRunning = useCommandRuntime().command !== null;
  const openedEmpty = useRef(mergedSectionBounds(models, legacyGeometry) === null).current;
  const { viewTransform, setViewTransform, fitToView } = useViewControls({
    drawing, sectionPlane, containerRef, panelVisible: !bimRunning, status, sheetEnabled: false, activeSheet: null,
    isPinned: true, cachedSheetTransformRef: NO_SHEET_TRANSFORM,
    // Opened on a model with no geometry yet: the first element drawn must not move the view under the cursor.
    initialFit: !openedEmpty,
  });

  // No drawing to fit to: start at 1 m ≈ 40 px around the origin of the work plane.
  useEffect(() => {
    if (drawing || !containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    setViewTransform((t) => (t.scale === 1 && t.x === 0 && t.y === 0 ? { scale: 40, x: width / 2, y: height / 2 } : t));
  }, [drawing, setViewTransform]);

  const references = useMemo(() => (drawing ? referenceSet(drawing, false) : null), [drawing]);
  const entities = useMemo(() => draftsOfView(view.id, allDrafts), [allDrafts, view.id]);
  const entityShapes = useMemo(() => entities.flatMap((e) => (isGeometry(e.shape) ? [e.shape] : [])), [entities]);
  // The view's own graphics (preset + category overrides), applied to its drawing.
  const graphics = view.graphics;
  const materialsTable = useProjectStore((st) => st.materials);
  const mutationVersionForMaterials = useViewerStore((st) => st.mutationVersion);
  const phaseSource = useProjectStore((st) => st.phaseSource);
  // The view's phases (a Status edit counts): which elements it shows, and each one's phase.
  const phases = useMemo(() => {
    void mutationVersionForMaterials;
    return phaseViewOf(graphics, phaseSource);
  }, [graphics, phaseSource, mutationVersionForMaterials]);
  const discipline = view.kind === 'plan' ? view.discipline : undefined;
  const shown = useMemo(() => {
    void materialsTable; void mutationVersionForMaterials;
    return drawing ? styledDrawing(drawing, graphics, partHostType, viewOmits(view), viewMaterials(drawing), phases) : null;
  }, [drawing, graphics, view.kind, discipline, materialsTable, mutationVersionForMaterials, phases]);
  const overrideRules = useMemo(() => viewOverrideRules(graphics), [graphics]);
  const overrideEngine = useMemo(() => new GraphicOverrideEngine(overrideRules), [overrideRules]);
  const useIfcMaterials = (graphics?.presetId === undefined ? DEFAULT_VIEW_PRESET : graphics.presetId) === DEFAULT_VIEW_PRESET;
  const hidden = useMemo(() => hiddenClasses(graphics), [graphics]);
  const hatches = useMemo(() => (shown ? cutHatches(shown, graphics) : []), [shown, graphics]);
  const runtimeGeometry = useDrawingRuntime().geometryResult;
  const materialColors = useMemo(() => {
    const map = new Map<number, [number, number, number, number]>();
    for (const mesh of runtimeGeometry?.meshes ?? []) if (mesh.expressId && mesh.color) map.set(mesh.expressId, mesh.color);
    return map;
  }, [runtimeGeometry]);

  useEffect(() => {
    // Annotation sizes are paper sizes at the view's scale (the settings read as at 1:100).
    attachDraftingView(view.id, axis, (min, max) => (references ? referencesIn(references, min, max) : []), (view.scale ?? 100) / 100);
  }, [view.id, axis, references, view.scale]);
  useDraftingProviders({ view, drawing, references, entities, plane, levels, scale: viewTransform.scale });
  const patternText = useProjectStore((s) => s.hatchPatterns ?? '');
  const extraPatterns = useMemo(() => parsePat(patternText).patterns, [patternText]);
  const selectedModelIds = useViewerStore((s) => s.selectedEntityIds);
  const selectedModelId = useViewerStore((s) => s.selectedEntityId);
  const highlight = useMemo(() => {
    const ids = new Set(selectedModelIds);
    if (selectedModelId !== null && selectedModelId !== undefined) ids.add(selectedModelId);
    return modelHighlight(drawing, ids);
  }, [drawing, selectedModelIds, selectedModelId]);

  // The selection's grips (a handful of entities at most) and the on-canvas editing bar.
  const selected = useMemo(() => entities.filter((e) => selection.has(e.id)), [entities, selection]);
  // A selected section symbol also shows the depth band, with its one handle on the viewing side.
  const sectionBand = useMemo(() => selectedSectionBand(selection, entities, views, modelBounds), [selection, entities, views, modelBounds]);
  // A selected detail mark shows the grips of its area.
  const detailMark = useMemo(() => selectedDetailGrips(selection, entities, views), [selection, entities, views]);
  const grips = useMemo(() => {
    const own = selected.length <= 20 ? grippable(selected.filter((e) => !isDetailMark(e, views)), entities, views).flatMap((e) => gripsOf(e.id, e.shape)) : [];
    return [...own, ...(sectionBand ? [sectionBand.grip] : []), ...(detailMark?.grips ?? [])];
  }, [selected, entities, views, sectionBand, detailMark]);
  const [editingText, setEditingText] = useState(false);
  useEffect(() => setEditingText(false), [selection]);
  const { state, handlers } = useDraftingPointer({ containerRef, transform: viewTransform, setTransform: setViewTransform, axis, entityShapes, references, grips });
  const workPlane = useMemo(() => viewWorkPlane(view, plane ?? null, levels), [view, plane, levels]);
  const bim = useModelCommandBridge({ view, plane: workPlane, transform: viewTransform, axis, containerRef });
  // A running BIM tool takes the left button; panning, zoom and the cursor stay the drafting view's.
  const pointer = {
    ...handlers,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button === 0 && bim.feed('down', e)) capturePointer(e.currentTarget as HTMLElement, e.pointerId);
      else handlers.onPointerDown(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      bim.feed('move', e);
      handlers.onPointerMove(e);
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (e.button === 0) bim.feed('up', e);
      handlers.onPointerUp(e);
    },
  };
  const submit = () => {
    submitCommandLine(text, state.cursor);
    setText('');
  };
  useDraftingKeys({ inputRef, setText, submit: () => submitCommandLine('', state.cursor) });

  const exportDxf = () => exportViewDxf({
    view, drawing: shown, axis, drafts: entities, layers, extraPatterns,
    overlays: [...(plane ? planOverlays(view, plane, phaseMeshes(runtimeGeometry?.meshes, phases), useProjectStore.getState().symbolFlips, hidden, shown) : []), ...membraneOverlays(shown)],
  });

  const command = runningCommand();
  const preview = command && state.cursor && command.preview ? command.preview(state.cursor) : [];

  return (
    <div className="flex h-full w-full flex-col">
      {bare ? null : <div className="flex shrink-0 items-center gap-1 h-9 px-2 border-b border-zinc-200 dark:border-zinc-800 text-xs">
        <span className="font-semibold truncate">{view.name}</span>
        <span className="flex-1" />
        <Toggle active={snap} label={t('drafting.snap')} onClick={toggleSnap} />
        <Toggle active={ortho} label={t('drafting.ortho')} onClick={toggleOrtho} />
        <select
          aria-label={t('drafting.layer')}
          className="h-6 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1"
          value={currentLayerId()}
          onChange={(e) => setCurrentLayer(e.target.value)}
        >
          {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <IconButton label={t('standards.open')} className="size-7" onClick={() => openStandards('layers')}><Layers className="size-4" /></IconButton>
        <IconButton label={t('drafting.undo')} className="size-7" onClick={undoLatest}><Undo2 className="size-4" /></IconButton>
        <IconButton label={t('drafting.redo')} className="size-7" onClick={redoEarliest}><Redo2 className="size-4" /></IconButton>
        <IconButton label={t('drafting.fit')} className="size-7" onClick={fitToView}><Maximize2 className="size-4" /></IconButton>
        <IconButton label={t('drafting.exportDxf')} className="size-7" onClick={exportDxf}><FileDown className="size-4" /></IconButton>
      </div>}
      <div
        ref={containerRef}
        data-drafting-canvas
        // Always white paper, as the drawing canvas paints it: drafted ink stays visible in dark mode.
        className="relative min-h-0 flex-1 overflow-hidden bg-white cursor-none touch-none"
        {...pointer}
        onDoubleClick={(e) => {
          // Double-click an annotation: select it and edit its text in place.
          const rect = containerRef.current?.getBoundingClientRect();
          const p = screenToDrawing({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }, viewTransform, axis);
          const hit = runningCommand() ? null : pickEntity(p, 6 / viewTransform.scale);
          if (hit && !isGeometry(hit.shape)) {
            setDraftSelection(new Set([hit.id]));
            setTimeout(() => setEditingText(true), 0);
            return;
          }
          // Inside a roof's outline (nothing drafted hit): enter the roof as a block.
          const roof = !hit && !runningCommand() && view.kind === 'plan' && plane ? roofAtPoint(view, plane, p) : null;
          if (roof !== null && !useRoofDialog.getState().editing) editRoofBlock(roof);
        }}
      >
        {/* A detail shows only its area of the drawing and of the symbols derived from the model. */}
        <div className="absolute inset-0" style={view.detail ? { clipPath: cropClipPath({ min: view.detail.min, max: view.detail.max }, viewTransform, axis) } : undefined}>
        {shown ? (
          <Drawing2DCanvas
            drawing={shown}
            transform={viewTransform}
            showHiddenLines={showHiddenLines}
            overrideEngine={overrideEngine}
            graphics={graphics}
            overridesEnabled={overrideRules.length > 0}
            entityColorMap={materialColors}
            useIfcMaterials={useIfcMaterials}
            sectionAxis={axis}
          />
        ) : null}
        <CutHatchLayer hatches={hatches} extraPatterns={extraPatterns} transform={viewTransform} axis={axis} />
        <MembraneLayer shapes={shown?.membranes} transform={viewTransform} axis={axis} />
        <ViewportState state={viewportState(entry, view.kind)} />
        <OpeningSymbolsLayer plane={view.kind === 'plan' || view.kind === 'elevation' || view.kind === 'section' ? plane ?? null : null} drawing={view.kind === 'plan' ? null : shown} hidden={hidden} phases={phases} transform={viewTransform} axis={axis} />
        <RoofPlanLayer view={view} plane={view.kind === 'plan' ? plane ?? null : null} transform={viewTransform} axis={axis} />
        </div>
        <DraftOverlay
          entities={entities}
          layers={layers}
          selection={selection}
          hoverId={state.hoverId}
          preview={preview}
          snap={state.snap}
          cursor={state.cursor}
          window={state.window}
          highlight={highlight}
          extraPatterns={extraPatterns}
          transform={viewTransform}
          axis={axis}
          paperUnit={(view.scale ?? 100) / 1000}
          hiddenLayers={view.hiddenLayers}
          grips={grips}
          gripDrag={state.gripDrag}
          sectionBand={sectionBand}
          crop={view.detail}
        />
        {selected.length === 1 && !state.gripDrag ? (
          <SelectionBar entity={selected[0]} transform={viewTransform} axis={axis} editing={editingText} onEditingChange={setEditingText} areaWidth={containerRef.current?.clientWidth ?? 800} />
        ) : null}
        {bare ? null : <DraftPropertiesPanel entities={entities.filter((e) => selection.has(e.id))} layers={layers} extraPatterns={extraPatterns} />}
      </div>
      <CommandLine ref={inputRef} value={text} onChange={setText} onSubmit={submit} onEscape={() => { setText(''); pressEscape(); }} />
    </div>
  );
}

function Toggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn('h-6 rounded-sm px-2 font-medium', active ? 'bg-primary/15 text-primary' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900')}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
