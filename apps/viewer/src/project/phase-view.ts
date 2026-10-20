/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A view's phases over the loaded models: the phase of a drawing's element
 * (its renderer id → model and express id, read through the label reader so
 * an edited Status counts). Reading it means reading property sets on demand,
 * so it is looked up once per element for the models as they stand: one lookup
 * per (loaded models, mutationVersion, phase source), shared by every view and
 * sheet that draws by phase. A view with no phases set up has none, and nothing
 * here runs for it.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { labelElementOf } from '@/labels/label-element';
import { useViewerStore } from '@/store';
import { resolvePhase, shownPhases, type PhaseSource } from './phases';
import type { PhaseId, ViewGraphics } from './types';
import type { PhaseView } from './view-graphics';

/** The phase of a renderer id, or null when it is no element of a loaded model. */
export function phaseOfRenderId(renderId: number, source: PhaseSource | undefined): PhaseId | null {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(renderId);
  const el = ref ? labelElementOf(ref.modelId, ref.expressId) : null;
  return el ? resolvePhase(el, source) : null;
}

interface PhaseLookup {
  models: unknown;
  version: number;
  source: PhaseSource | undefined;
  known: Map<number, PhaseId | null>;
}

let lookup: PhaseLookup | null = null;

/** The phases read so far for the loaded models as they stand and `source`; a new set once either changes. */
function knownPhases(source: PhaseSource | undefined): Map<number, PhaseId | null> {
  const { models, mutationVersion } = useViewerStore.getState();
  if (!lookup || lookup.models !== models || lookup.version !== mutationVersion || lookup.source !== source) {
    lookup = { models, version: mutationVersion, source, known: new Map() };
  }
  return lookup.known;
}

/** The view's phases, or null when it draws by none. The lookup is the one shared for the models as they stand. */
export function phaseViewOf(graphics: ViewGraphics | undefined, source: PhaseSource | undefined): PhaseView | null {
  const show = shownPhases(graphics);
  if (!show) return null;
  const known = knownPhases(source);
  return {
    show,
    phaseOf: (id) => {
      let phase = known.get(id);
      if (phase === undefined) known.set(id, (phase = phaseOfRenderId(id, source)));
      return phase;
    },
  };
}

/** The meshes of the elements the view shows (all of them for a view with no phases): door and window symbols are drawn from these. */
export function phaseMeshes<T extends Pick<MeshData, 'expressId'>>(meshes: readonly T[] | undefined, phases: PhaseView | null): readonly T[] | undefined {
  if (!meshes || !phases) return meshes;
  return meshes.filter((m) => {
    const phase = phases.phaseOf(m.expressId);
    return phase === null || phases.show.has(phase);
  });
}

/** Express ids of the meshes the view does not show: left out of the drawing's input, so a hidden phase occludes, hatches and symbolizes nothing. */
export function phaseHiddenIds(meshes: readonly Pick<MeshData, 'expressId'>[] | undefined, phases: PhaseView | null): Set<number> | null {
  if (!meshes || !phases) return null;
  const hidden = new Set<number>();
  for (const m of meshes) {
    const phase = phases.phaseOf(m.expressId);
    if (phase !== null && !phases.show.has(phase)) hidden.add(m.expressId);
  }
  return hidden.size ? hidden : null;
}
