/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The coloured style of an elevation or section (#499) over the loaded geometry. The rule (which colour, in which order) is the
 * engine's (`@bimvoice/ifcsheet/surface-fills`); this module decides which views take it and puts the result on the styled
 * drawing, where the sheet's pens (and with them the PDF) draw it under the linework. The DXF keeps lines only.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { viewSurfaceFills } from '@bimvoice/ifcsheet/material-colour';
import type { ProjectMaterial } from '@bimvoice/ifcsheet/materials';
import { meshMaterialOf } from './material-resolver';
import type { ViewGraphics } from '@bimvoice/ifcsheet';
import type { ProjectView } from './types';
import type { StyledDrawing } from './view-graphics';

/** Whether `view` is drawn in the coloured style: an elevation or a section whose graphics (its template's, then its own) ask for it. */
export const drawsColoured = (view: Pick<ProjectView, 'kind'> | undefined, graphics: Pick<ViewGraphics, 'colouredSurfaces'> | undefined): boolean =>
  !!graphics?.colouredSurfaces && isElevationOrSection(view);

/** Whether `view` is an elevation or a section: the views whose faces a material's colour can paint (#633). */
export const isElevationOrSection = (view: Pick<ProjectView, 'kind'> | undefined): boolean => view?.kind === 'elevation' || view?.kind === 'section';

/**
 * `drawing` with the surfaces `meshes` show in it, or the same object when the view is not coloured or shows none. `meshes` are the
 * ones the view draws (what it hides is already out); `hidden` holds the upper-case classes its categories hide.
 */
export function withSurfaceFills<T extends StyledDrawing>(
  drawing: T, view: Pick<ProjectView, 'kind'> | undefined, graphics: Pick<ViewGraphics, 'colouredSurfaces'> | undefined,
  meshes: readonly MeshData[] | undefined, hidden: ReadonlySet<string> = new Set(), table: readonly ProjectMaterial[] = [],
): T {
  if (!meshes || !isElevationOrSection(view)) return drawing;
  const fills = viewSurfaceFills(meshes, (drawing as Drawing2D | T).config, {
    switch: !!graphics?.colouredSurfaces, table, materialNameOf: meshMaterialOf, shown: (_id, ifcType) => !ifcType || !hidden.has(ifcType.toUpperCase()),
  });
  return fills.length === 0 ? drawing : { ...drawing, surfaceFills: fills };
}
