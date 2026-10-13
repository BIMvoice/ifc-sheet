/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The central document area: a tab strip (3D model + every opened plan,
 * section and elevation, side by side) over the workspace.
 *
 * The 3D workspace (`children`) stays mounted whatever tab is in front —
 * remounting the viewport re-creates its GPU device — and a drawing tab
 * covers it with its drafting view (the drawing plus drafting tools). `data-floating-snap-bounds` stays on the
 * workspace box: edge-docked floating panels (#1201) snap to THIS region,
 * not the whole window, so a dock never hides under the toolbar or over the
 * hierarchy / sidebar (#1245).
 */

import { useEffect, type ReactNode } from 'react';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { MODEL_TAB_ID, pruneDocumentTabs, useDocumentTabs, WALL_TAB_ID } from '@/project/document-tabs';
import { activateDocumentTab, closeProjectTab } from '@/project/open-view';
import { isDocsEdition } from '@/edition';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { DocumentTabBar } from './DocumentTabBar';
import { ViewDrawingHost } from './ViewDrawingHost';
import { DraftingView } from '../drafting/DraftingView';
import { SheetView } from '../sheets/SheetView';
import { ScheduleView } from '../joinery/ScheduleView';
import { CivilDrawingView } from '../civil/CivilDrawingView';
import { LegendView } from '../legend/LegendView';
import { WallView } from '../wall/WallView';
import { scopeViews } from '@/legend/legend-data';


/**
 * Show the front tab's own drawing in the viewer's one `drawing2D`, which
 * the Drawing panel's canvas, toolbar and exports read.
 */
function useMirrorFrontDrawing(activeId: string): void {
  const entry = useViewDrawings((s) => (activeId === MODEL_TAB_ID || activeId === WALL_TAB_ID ? null : s.byView[activeId] ?? EMPTY_VIEW_DRAWING));
  useEffect(() => {
    if (!entry) return;
    const store = useViewerStore.getState();
    store.setDrawing2D(entry.drawing);
    store.setDrawing2DProgress(entry.progress, entry.phase);
    store.setDrawing2DError(entry.error);
    store.setDrawing2DStatus(entry.status);
  }, [entry]);
}

/** Whether this session already brought the Wall forward on its own; after that it is the person's choice. */
let wallShown = false;

export function DocumentWorkspace({ children }: { children: ReactNode }) {
  const activeId = useDocumentTabs((s) => s.activeId);
  const openIds = useDocumentTabs((s) => s.openIds);
  const views = useProjectStore((s) => s.views);
  const sheets = useProjectStore((s) => s.sheets);
  const schedules = useProjectStore((s) => s.schedules);
  const civilDrawings = useProjectStore((s) => s.civilDrawings);
  const legends = useProjectStore((s) => s.legends);
  useMirrorFrontDrawing(activeId);
  // Views that need their own drawing: open as a tab, or placed on a sheet that is open as a tab.
  const drawn = new Set(openIds);
  // The Wall hangs every sheet, so every placed view is drawn while it is in front.
  const wall = activeId === WALL_TAB_ID;
  for (const sheet of sheets) {
    if (wall || openIds.includes(sheet.id)) for (const vp of sheet.viewports ?? []) drawn.add(vp.viewId);
  }
  // A legend lists the cut materials of the drawings in its scope: open as a tab, those drawings are generated.
  for (const legend of legends ?? []) {
    if (!openIds.includes(legend.id)) continue;
    for (const v of scopeViews(legend, views, sheets)) drawn.add(v.id);
  }

  // A deleted view (or another project loaded) takes its tab with it.
  useEffect(() => {
    const ids = new Set([...views.map((v) => v.id), ...sheets.map((s) => s.id), ...(schedules ?? []).map((s) => s.id), ...(civilDrawings ?? []).map((d) => d.id), ...(legends ?? []).map((l) => l.id)]);
    const { activeId: front } = useDocumentTabs.getState();
    if (front !== MODEL_TAB_ID && !ids.has(front)) closeProjectTab(front);
    pruneDocumentTabs(ids);
  }, [views, sheets, schedules, civilDrawings, legends]);

  // The documentation edition opens on the Wall the first time a model is in.
  const hasModel = useViewerStore((s) => s.models.size > 0 || s.geometryResult !== null);
  useEffect(() => {
    if (!hasModel || !isDocsEdition() || wallShown) return;
    wallShown = true;
    activateDocumentTab(WALL_TAB_ID);
  }, [hasModel]);

  const frontView = activeId === MODEL_TAB_ID ? undefined : views.find((v) => v.id === activeId);
  const frontSheet = activeId === MODEL_TAB_ID ? undefined : sheets.find((s) => s.id === activeId);
  const frontSchedule = activeId === MODEL_TAB_ID ? undefined : schedules?.find((s) => s.id === activeId);
  const frontLegend = activeId === MODEL_TAB_ID ? undefined : legends?.find((l) => l.id === activeId);
  const frontCivil = activeId === MODEL_TAB_ID ? undefined : civilDrawings?.find((d) => d.id === activeId);
  return (
    <div className="h-full w-full flex flex-col">
      <DocumentTabBar />
      {[...drawn].map((id) => {
        const view = views.find((v) => v.id === id);
        return view && view.kind !== '3d' ? <ViewDrawingHost key={id} view={view} /> : null;
      })}
      <div data-floating-snap-bounds className="relative flex-1 min-h-0 w-full overflow-hidden flex">
        {children}
        {frontView && frontView.kind !== '3d' ? (
          <div className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-black">
            <DraftingView key={frontView.id} view={frontView} />
          </div>
        ) : null}
        {frontSchedule ? (
          <div className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-black">
            <ScheduleView key={frontSchedule.id} schedule={frontSchedule} />
          </div>
        ) : null}
        {frontLegend ? (
          <div className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-black">
            <LegendView key={frontLegend.id} legend={frontLegend} />
          </div>
        ) : null}
        {frontCivil ? (
          <div className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-black">
            <CivilDrawingView key={frontCivil.id} drawing={frontCivil} />
          </div>
        ) : null}
        {wall ? (
          <div className="absolute inset-0 z-30 flex flex-col">
            <WallView />
          </div>
        ) : null}
        {frontSheet ? (
          <div className="absolute inset-0 z-30 flex flex-col bg-zinc-200 dark:bg-zinc-900">
            <SheetView key={frontSheet.id} sheet={frontSheet} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
