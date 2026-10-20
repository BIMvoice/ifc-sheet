/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a view's viewport has to say about its drawing, read off the one
 * record the generator writes (`useViewDrawings`). Screen-only: the paper
 * never carries any of it.
 *
 * `idle`: no drawing has been asked for yet, nothing to say.
 * `generating`: `percent` is what the generator reported, or null while it has
 *   reported nothing (an indeterminate wait; no figure is made up).
 * `failed`: `reason` is the generator's own message ('' when it gave none).
 * `emptyCut`: a plan's drawing came out, and holds no line and no polygon at
 *   all: nothing is cut at its height.
 * `emptyView`: the same for an elevation or a section, which have no cut
 *   height, so they say nothing is seen instead.
 */

import type { ProjectViewKind } from './types';
import type { ViewDrawingEntry } from './view-drawings';

export type ViewportState =
  | { kind: 'idle' }
  | { kind: 'generating'; percent: number | null; phase: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'emptyCut' }
  | { kind: 'emptyView' }
  | { kind: 'ready' };

export const IDLE_STATE: ViewportState = { kind: 'idle' };

export function viewportState(entry: ViewDrawingEntry | undefined, viewKind: ProjectViewKind | undefined): ViewportState {
  if (!entry) return IDLE_STATE;
  if (entry.status === 'error') return { kind: 'failed', reason: entry.error ?? '' };
  if (entry.status === 'generating') {
    const reported = entry.phase !== '' || entry.progress > 0;
    return { kind: 'generating', percent: reported ? Math.min(100, Math.max(0, Math.round(entry.progress))) : null, phase: entry.phase };
  }
  if (entry.status === 'idle') return IDLE_STATE;
  const d = entry.drawing;
  if (!d || (d.lines.length === 0 && d.cutPolygons.length === 0 && d.projectionPolygons.length === 0)) return viewKind === 'plan' ? { kind: 'emptyCut' } : { kind: 'emptyView' };
  return { kind: 'ready' };
}
