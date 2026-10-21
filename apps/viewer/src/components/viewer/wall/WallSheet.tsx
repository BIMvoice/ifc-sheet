/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One sheet as it hangs on the Wall: the same paper the sheet editor prints,
 * read-only, at the pixel width it is given, with a pin at the top.
 */

import { forwardRef, useMemo } from 'react';
import { draftsOfView } from '@/drafting/draft-store';
import { parsePat } from '@/drafting/hatch/pattern';
import type { DraftEntity } from '@/drafting/types';
import { useProjectStore } from '@/project/project-store';
import { paperOf } from '@/project/sheets';
import { useViewDrawings } from '@/project/view-drawings';
import { viewportState } from '@/project/viewport-state';
import type { ProjectSheet } from '@/project/types';
import { SheetPaper } from '../sheets/SheetPaper';
import { useSheetContent, type SheetContent } from '../sheets/useSheetContent';
import { ViewportState } from './ViewportState';

interface WallSheetProps {
  sheet: ProjectSheet;
  /** Width on screen, px. */
  width: number;
  selectedViewportId?: string | null;
  /** What its viewports show, when the caller already has it (it hit-tests them too). */
  sheetContent?: SheetContent;
  /** The pin at the top, as on the wall; off where the sheet is worked on. */
  pinned?: boolean;
  /** Print only the clouds of the sheet's current revision (an issue's option). */
  currentCloudsOnly?: boolean;
  /** Take new drawings in a deferred render (the Wall's sheets; see `SheetContentOptions`). */
  deferDrawings?: boolean;
}

const NO_DRAFTS: DraftEntity[] = [];

/** The project's hatch patterns, parsed once for every sheet, so each sheet's memo on them sees the same list (#154). */
let parsedPatterns: { text: string; patterns: ReturnType<typeof parsePat>['patterns'] } | null = null;
function patternsOf(text: string): ReturnType<typeof parsePat>['patterns'] {
  if (parsedPatterns?.text !== text) parsedPatterns = { text, patterns: parsePat(text).patterns };
  return parsedPatterns.patterns;
}

export const WallSheet = forwardRef<SVGSVGElement, WallSheetProps>(function WallSheet({ sheet, width, selectedViewportId = null, sheetContent, pinned = true, currentCloudsOnly = false, deferDrawings = false }, ref) {
  // What is drawn on the paper itself hangs with it.
  const drafts = useProjectStore((s) => s.drafts);
  const sheetDrafts = useMemo(() => (drafts.some((d) => d.viewId === sheet.id) ? draftsOfView(sheet.id, drafts) : NO_DRAFTS), [drafts, sheet.id]);
  const layers = useProjectStore((s) => s.draftLayers);
  const projectName = useProjectStore((s) => s.name);
  const patternText = useProjectStore((s) => s.hatchPatterns ?? '');
  const extraPatterns = useMemo(() => patternsOf(patternText), [patternText]);
  const own = useSheetContent(sheet, { deferDrawings });
  const { content, boxOf } = sheetContent ?? own;
  const byView = useViewDrawings((s) => s.byView);
  const views = useProjectStore((s) => s.views);
  const pxPerMm = width / paperOf(sheet).w;
  return (
    <div className="relative">
      {pinned ? <span aria-hidden className="absolute left-1/2 -top-2 z-10 size-4 -translate-x-1/2 rounded-full bg-sky-500 shadow-[0_2px_6px_rgba(0,0,0,0.45)] ring-2 ring-sky-300/60" /> : null}
      <SheetPaper
        ref={ref}
        sheet={sheet}
        projectName={projectName}
        content={content}
        layers={layers}
        extraPatterns={extraPatterns}
        selectedViewportId={selectedViewportId}
        pxPerMm={pxPerMm}
        sheetDrafts={sheetDrafts}
        currentCloudsOnly={currentCloudsOnly}
      />
      {/* Screen only: laid over the paper's SVG, never inside it, so no export reads it. */}
      {(sheet.viewports ?? []).map((vp) => {
        const state = viewportState(byView[vp.viewId], views.find((v) => v.id === vp.viewId)?.kind);
        if (state.kind === 'idle' || state.kind === 'ready') return null;
        const box = boxOf(vp);
        return (
          <div key={vp.id} data-viewport-overlay={vp.id} className="pointer-events-none absolute" style={{ left: (vp.x - box.width / 2) * pxPerMm, top: (vp.y - box.height / 2) * pxPerMm, width: box.width * pxPerMm, height: box.height * pxPerMm }}>
            <ViewportState state={state} />
          </div>
        );
      })}
    </div>
  );
});
