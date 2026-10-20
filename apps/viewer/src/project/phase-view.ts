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
import { partHostRef } from './part-host';
import { drawnPhase, shownPhases, statedPhase, unmarkedPhase, type PhaseSource } from './phases';
import type { PhaseId, ViewGraphics } from './types';
import type { PhaseView } from './view-graphics';

/** No element of a loaded model. */
const NOT_AN_ELEMENT = 'not-an-element';
type Stated = PhaseId | null | typeof NOT_AN_ELEMENT;

/**
 * The phase a renderer id says (`statedPhase`): its own, else, for an IfcBuildingElementPart, the one its host
 * element says (a multi-skin wall exported as parts carries its Status on the wall).
 */
function statedOfRenderId(renderId: number, source: PhaseSource | undefined): Stated {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(renderId);
  const el = ref ? labelElementOf(ref.modelId, ref.expressId) : null;
  if (!el) return NOT_AN_ELEMENT;
  const own = statedPhase(el, source);
  if (own) return own;
  const host = partHostRef(renderId);
  const hostEl = host ? labelElementOf(host.modelId, host.expressId) : null;
  return hostEl ? statedPhase(hostEl, source) : null;
}

const phaseOfStated = (stated: Stated, source: PhaseSource | undefined): PhaseId | null =>
  stated === NOT_AN_ELEMENT ? null : stated ?? unmarkedPhase(source);

/** The phase of a renderer id, or null when it is no element of a loaded model. */
export function phaseOfRenderId(renderId: number, source: PhaseSource | undefined): PhaseId | null {
  return phaseOfStated(statedOfRenderId(renderId, source), source);
}

interface PhaseLookup {
  models: unknown;
  version: number;
  source: PhaseSource | undefined;
  known: Map<number, Stated>;
}

let lookup: PhaseLookup | null = null;

/** The phase each renderer id says, read once for the loaded models as they stand and `source`; read again once either changes. */
function statedOf(id: number, source: PhaseSource | undefined): Stated {
  const { models, mutationVersion } = useViewerStore.getState();
  if (!lookup || lookup.models !== models || lookup.version !== mutationVersion || lookup.source !== source) {
    lookup = { models, version: mutationVersion, source, known: new Map() };
  }
  let stated = lookup.known.get(id);
  if (stated === undefined) lookup.known.set(id, (stated = statedOfRenderId(id, source)));
  return stated;
}

/** The view's phases, or null when it draws by none. The lookup is the one shared for the models as they stand. */
export function phaseViewOf(graphics: ViewGraphics | undefined, source: PhaseSource | undefined): PhaseView | null {
  const show = shownPhases(graphics);
  if (!show) return null;
  return {
    show,
    phaseOf: (id) => phaseOfStated(statedOf(id, source), source),
    ...(graphics?.phases?.demolishAsExisting ? { drawnAs: (phase: PhaseId) => drawnPhase(phase, graphics.phases) } : {}),
  };
}

/**
 * True when no element among `meshes` says a phase (no Status, nor a value for the mapped property): the view
 * then draws every element as `unmarkedPhase`. Reads through the shared lookup, so it costs nothing a view
 * drawn by phase has not already read.
 */
export function noElementSaysAPhase(meshes: readonly Pick<MeshData, 'expressId'>[] | undefined, source: PhaseSource | undefined): boolean {
  if (!meshes?.length) return false;
  for (const m of meshes) {
    const stated = statedOf(m.expressId, source);
    if (stated !== null && stated !== NOT_AN_ELEMENT) return false;
  }
  return true;
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
