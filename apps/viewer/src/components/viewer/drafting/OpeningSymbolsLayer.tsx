/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Door swings and window glazing on a floor plan tab (`drafting/opening-symbols.ts`),
 * and the opening marks of typed or mapped doors and windows on an elevation
 * or section tab, drawn over the generated drawing in its ink.
 */

import { memo, useMemo } from 'react';
import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import type { SectionAxisName, ViewTransform } from '@/drafting/frame';
import { useProjectStore } from '@/project/project-store';
import { viewElevationSymbols, viewOpeningSymbols, visibleEntities } from '@/project/view-symbols';
import type { DraftShape } from '@/drafting/types';
import { phaseMeshes } from '@/project/phase-view';
import { renderIdGlobalId } from '@/project/element-guid';
import { withoutHiddenElementMeshes } from '@/project/view-element-filter';
import type { ViewGraphics } from '@/project/types';
import type { PhaseView } from '@/project/view-graphics';
import { shapePath } from './DraftOverlay';

const NO_FLIPS: Record<string, number> = {};

interface Props {
  /** The view's plane (world units); null draws nothing. */
  plane: SectionPlaneConfig | null;
  /** An elevation's / section's drawing: its symbols go on the doors and windows it shows. */
  drawing?: Drawing2D | null;
  /** Upper-case IFC classes the view hides (`hiddenClasses`). */
  hidden: ReadonlySet<string>;
  /** The view's phases: the doors and windows of a phase it does not show have no symbol. */
  phases?: PhaseView | null;
  /** The view's graphics: a door or window it hides element by element (#33) has no symbol. */
  graphics?: ViewGraphics;
  transform: ViewTransform;
  axis: SectionAxisName;
}

export const OpeningSymbolsLayer = memo(function OpeningSymbolsLayer({ plane, drawing, hidden, phases, graphics, transform, axis }: Props) {
  const { geometryResult } = useDrawingRuntime();
  const flips = useProjectStore((s) => s.symbolFlips) ?? NO_FLIPS;
  // Symbols follow the catalogue and the symbol mapping too.
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const mapping = useProjectStore((s) => s.joineryMapping);
  const symbols = useMemo(
    () => {
      if (!plane || !geometryResult?.meshes) return [];
      const meshes = withoutHiddenElementMeshes(phaseMeshes(geometryResult.meshes, phases ?? null), graphics, renderIdGlobalId) ?? geometryResult.meshes;
      if (plane.axis === 'y') return viewOpeningSymbols(meshes, plane, flips, hidden);
      return drawing ? viewElevationSymbols(meshes, plane, visibleEntities(drawing), hidden) : [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogue / mapping are read through the project store
    [plane, drawing, geometryResult, flips, hidden, phases, graphics, catalogue, mapping],
  );
  if (symbols.length === 0) return null;
  const path = (shapes: DraftShape[]) => shapes.map((s) => shapePath(s, transform, axis)).join('');
  // A symbol turned on this drawing (#491) is drawn in the accent colour here (the sheet, PDF and DXF print it as the others).
  const turned = (s: (typeof symbols)[number]) => { const guid = plane?.axis === 'y' && Object.keys(flips).length > 0 ? renderIdGlobalId(s.id) : null; return !!guid && !!flips[guid]; };
  const group = (list: typeof symbols) => ({
    thin: path(list.flatMap((s) => s.shapes)), heavy: path(list.flatMap((s) => s.heavy ?? [])), dashed: path(list.flatMap((s) => s.dashed ?? [])),
  });
  const draw = (g: ReturnType<typeof group>, cls: string, attr?: string) => (
    <g className={cls} {...(attr ? { [attr]: '' } : {})}>
      <path d={g.thin} fill="none" stroke="currentColor" strokeWidth={0.75} />
      {g.heavy ? <path d={g.heavy} fill="none" stroke="currentColor" strokeWidth={1.4} /> : null}
      {g.dashed ? <path d={g.dashed} fill="none" stroke="currentColor" strokeWidth={0.75} strokeDasharray="4 3" /> : null}
    </g>
  );
  return (
    <svg data-opening-symbols className="absolute inset-0 h-full w-full pointer-events-none text-zinc-800 dark:text-zinc-200" aria-hidden="true">
      {draw(group(symbols.filter((s) => !turned(s))), '')}
      {draw(group(symbols.filter(turned)), 'text-primary', 'data-flipped-symbols')}
    </svg>
  );
});
