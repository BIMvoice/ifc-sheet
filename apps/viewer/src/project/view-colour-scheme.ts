/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A view coloured by a property (#92), over the loaded models. The rules (palette, assignment, what a room or an element
 * paints, the entries a legend lists) are the engine's (`@bimvoice/ifcsheet/colour-fills`); this module only reads a property
 * of a renderer id through the label reader, so an edited property counts, and keeps the answer while nothing it depends on
 * changes. `styledDrawing` paints with the result and the legend lists its entries, so the screen, the sheet, the PDF and the
 * DXF, and the legend, all read one `SchemeResult`.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { resolveScheme, planHeights, type SchemeResult } from '@bimvoice/ifcsheet/colour-fills';
import type { ColourScheme } from '@bimvoice/ifcsheet/colour-scheme';
import { labelElementOf } from '@/labels/label-element';
import { readStored } from '@/labels/label-resolve';
import { parseFieldRef } from '@/labels/label-template';
import { useViewerStore } from '@/store';
import { partHostRef } from './part-host';
import { useProjectStore } from './project-store';
import type { ProjectView } from './types';

/** The scheme of a view, or `undefined`. */
export const colourSchemeOf = (view: Pick<ProjectView, 'graphics'> | undefined): ColourScheme | undefined => view?.graphics?.colourScheme;

/** What a renderer id says at `property`: its own value, else (an IfcBuildingElementPart) its host's. */
export function propertyReader(property: string): ((renderId: number) => unknown) | null {
  const ref = parseFieldRef(property);
  if (!ref) return null;
  const read = (modelId: string, expressId: number): unknown => {
    const el = labelElementOf(modelId, expressId);
    return el ? readStored(ref, el).value : undefined;
  };
  return (renderId) => {
    const at = useViewerStore.getState().resolveGlobalIdFromModels(renderId);
    if (!at) return undefined;
    const own = read(at.modelId, at.expressId);
    if (own !== undefined && own !== '') return own;
    const host = partHostRef(renderId);
    return host ? read(host.modelId, host.expressId) : undefined;
  };
}

interface Kept {
  scheme: ColourScheme;
  drawing: Drawing2D;
  meshes: unknown;
  models: unknown;
  version: number;
  levels: unknown;
  cutHeight: number | undefined;
  result: SchemeResult;
}
const kept = new Map<string, Kept>();

/**
 * What the view's scheme paints on `drawing`, or `null` when the view has none (or its property is not one that can be read).
 * `meshes` is the geometry the drawing was cut from: the rooms are the spaces among it. Kept per view while the scheme, the
 * drawing, the geometry, the loaded models and their edits stay as they are, so reading it again costs nothing.
 */
export function schemeResultOf(view: ProjectView | undefined, drawing: Drawing2D | null | undefined, meshes: readonly MeshData[] | undefined): SchemeResult | null {
  const scheme = colourSchemeOf(view);
  if (!view || !scheme || !drawing) return null;
  const { models, mutationVersion } = useViewerStore.getState();
  const { levels } = useProjectStore.getState();
  const cutHeight = view.kind === 'plan' ? view.cutHeight : undefined;
  const hit = kept.get(view.id);
  if (hit && hit.scheme === scheme && hit.drawing === drawing && hit.meshes === meshes && hit.models === models && hit.version === mutationVersion && hit.levels === levels && hit.cutHeight === cutHeight) return hit.result;
  const valueOf = propertyReader(scheme.property);
  if (!valueOf) return null;
  const result = resolveScheme(scheme, {
    meshes: scheme.target === 'rooms' ? meshes ?? [] : [],
    cutPolygons: drawing.cutPolygons,
    plan: planHeights(view, levels),
    valueOf,
  });
  kept.set(view.id, { scheme, drawing, meshes, models, version: mutationVersion, levels, cutHeight, result });
  return result;
}
