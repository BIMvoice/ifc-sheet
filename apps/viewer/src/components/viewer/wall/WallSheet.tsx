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
import type { ProjectSheet } from '@/project/types';
import { SheetPaper } from '../sheets/SheetPaper';
import { useSheetContent, type SheetContent } from '../sheets/useSheetContent';

interface WallSheetProps {
  sheet: ProjectSheet;
  /** Width on screen, px. */
  width: number;
  selectedViewportId?: string | null;
  /** What its viewports show, when the caller already has it (it hit-tests them too). */
  sheetContent?: SheetContent;
  /** The pin at the top, as on the wall; off where the sheet is worked on. */
  pinned?: boolean;
}

const NO_DRAFTS: DraftEntity[] = [];

export const WallSheet = forwardRef<SVGSVGElement, WallSheetProps>(function WallSheet({ sheet, width, selectedViewportId = null, sheetContent, pinned = true }, ref) {
  // What is drawn on the paper itself hangs with it.
  const drafts = useProjectStore((s) => s.drafts);
  const sheetDrafts = useMemo(() => (drafts.some((d) => d.viewId === sheet.id) ? draftsOfView(sheet.id, drafts) : NO_DRAFTS), [drafts, sheet.id]);
  const layers = useProjectStore((s) => s.draftLayers);
  const projectName = useProjectStore((s) => s.name);
  const patternText = useProjectStore((s) => s.hatchPatterns ?? '');
  const extraPatterns = useMemo(() => parsePat(patternText).patterns, [patternText]);
  const own = useSheetContent(sheet);
  const { content } = sheetContent ?? own;
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
      />
    </div>
  );
});
