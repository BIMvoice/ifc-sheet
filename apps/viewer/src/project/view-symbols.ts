/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan view's door and window symbols (`drafting/opening-symbols.ts`),
 * drawn from their configured joinery type where they have one (or the
 * catalogue entry the project's symbol mapping gives them), with the
 * project's per-door flips (by GlobalId) and the view's hidden categories — shared by the drawing tab and the sheet viewports.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { curtainPartsOf, drawnBySymbol as drawnByOpeningSymbol, elevationOpeningSymbols, hostedInCutWall, openingHostsOf, simplifyOpeningSymbol, storeyMembersOf, visibleEntities, type DetailLevel, type ProjectLevel } from '@bimvoice/ifcsheet';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { useViewerStore } from '@/store';
import { openingSymbols, type OpeningSymbol } from '@/drafting/opening-symbols';
import { drawnJoineryOfRenderId } from '@/joinery/mapped-joinery';
import { renderIdGlobalId } from './element-guid';
import { doorOperationOfRenderId } from '@/joinery/door-operation-read';
import { openingConvention } from '@/joinery/opening-convention';

export { simplifyOpeningSymbol };

/** The renderer id of the wall a door or window (by renderer id) is hosted in, through its opening (`openingHostsOf`, the engine's read); undefined when it has none. */
function hostWallRenderId(id: number): number | undefined {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(id);
  const model = ref ? s.models.get(ref.modelId) : undefined;
  if (!ref || !model?.ifcDataStore) return undefined;
  const wall = openingHostsOf(model.ifcDataStore).get(ref.expressId);
  return wall === undefined ? undefined : wall + model.idOffset;
}

/** The renderer ids of the parts of a curtain wall (by renderer id; `curtainPartsOf`, the engine's read), whose meshes give its extent when it has none of its own. */
function curtainPartRenderIds(id: number): readonly number[] {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(id);
  const model = ref ? s.models.get(ref.modelId) : undefined;
  if (!ref || !model?.ifcDataStore) return [];
  return (curtainPartsOf(model.ifcDataStore).get(ref.expressId) ?? []).map((part) => part + model.idOffset);
}

/** Whether a door or window (by renderer id) is on the plan's own storey (`storeyMembersOf`, the engine's membership); without a level, none is. */
function onPlanStorey(level: Pick<ProjectLevel, 'storeyGlobalIds'> | undefined): (id: number) => boolean {
  return (id) => {
    if (!level) return false;
    const s = useViewerStore.getState();
    const ref = s.resolveGlobalIdFromModels(id);
    const store = ref ? s.models.get(ref.modelId)?.ifcDataStore : undefined;
    return !!ref && !!store && storeyMembersOf(store, level.storeyGlobalIds).has(ref.expressId);
  };
}

/** The opening symbols of a plan at `plane`; `level` is the plan's own storey, the only one whose doors and windows the host-wall rule (#586) draws. */
export function viewOpeningSymbols(
  meshes: readonly MeshData[], plane: SectionPlaneConfig, flips: Record<string, number> | undefined, hidden: ReadonlySet<string>, detail: DetailLevel = 'fine', level?: Pick<ProjectLevel, 'storeyGlobalIds'>,
): OpeningSymbol[] {
  const flipsOf = (id: number) => {
    const guid = flips && Object.keys(flips).length > 0 ? renderIdGlobalId(id) : null;
    return guid ? flips?.[guid] ?? 0 : 0;
  };
  return openingSymbols(meshes, plane, flipsOf, drawnJoineryOfRenderId, doorOperationOfRenderId, hostedInCutWall(meshes, hostWallRenderId, onPlanStorey(level), curtainPartRenderIds))
    .filter((s) => !hidden.has(s.kind === 'door' ? 'IFCDOOR' : 'IFCWINDOW'))
    .map((s) => simplifyOpeningSymbol(s, detail));
}

/**
 * Whether a plan draws element `id` from its symbol rather than its cut:
 * every door and window — a configured one from its type's symbol, any
 * other from the one read off its mesh (leaf open with its swing, frame and
 * glazing) — so the closed leaf the model holds never shows across the gap.
 */
export function drawnBySymbol(_id: number, ifcType: string | undefined): boolean {
  return drawnByOpeningSymbol(ifcType);
}

export { visibleEntities };

/**
 * An elevation's or section's door and window symbols: every door / window
 * the drawing shows (`visible`) whose face the view looks at and that has a
 * joinery type (configured, or mapped by the project) — frame, panels and
 * opening marks over the projected mesh — and every door without one that
 * states its operation, with the opening lines of that operation. The code is the engine's (`elevationOpeningSymbols`); the reads are the app's.
 */
export function viewElevationSymbols(
  meshes: readonly MeshData[], plane: SectionPlaneConfig, visible: ReadonlySet<number>, hidden: ReadonlySet<string>,
  flips?: Record<string, number>, detail: DetailLevel = 'fine',
): OpeningSymbol[] {
  const flipsOf = (id: number) => {
    const guid = flips && Object.keys(flips).length > 0 ? renderIdGlobalId(id) : null;
    return guid ? flips?.[guid] ?? 0 : 0;
  };
  return elevationOpeningSymbols(meshes, plane, visible, hidden, { typedOf: drawnJoineryOfRenderId, operationOf: doorOperationOfRenderId, flipsOf }, openingConvention())
    .map((s) => simplifyOpeningSymbol(s, detail));
}
