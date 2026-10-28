/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A colour scheme's paint on a styled drawing (#92): the cut faces of the painted elements carry their colour
 * (`schemeColour`), and the filled rooms become polygons of their own (`schemeFills`) that every renderer draws first, under
 * the linework. The screen canvas, the sheet's pens (and with them the PDF and the DXF) all read these two fields.
 */

import type { Drawing2D, DrawingPolygon } from '@ifc-lite/drawing-2d';
import type { SchemeResult } from '@bimvoice/ifcsheet/colour-fills';
import { orderedFills } from '@bimvoice/ifcsheet/colour-fills';
import type { StyledDrawing } from './view-graphics';

/** The drawing with `scheme` painted on it; the same object when there is nothing to paint. */
export function withScheme<T extends StyledDrawing>(drawing: T, scheme: SchemeResult | null | undefined): T {
  if (!scheme || (scheme.fills.length === 0 && scheme.elementColours.size === 0)) return drawing;
  const painted = scheme.elementColours;
  return {
    ...drawing,
    cutPolygons: painted.size === 0 ? drawing.cutPolygons : drawing.cutPolygons.map((p) => {
      const schemeColour = painted.get(p.entityId);
      return schemeColour ? { ...p, schemeColour } : p;
    }),
    ...(scheme.fills.length > 0 ? {
      schemeFills: orderedFills(scheme.fills).map((f): DrawingPolygon & { schemeColour: string } => ({
        polygon: { outer: f.outer, holes: f.holes }, entityId: f.entityId, ifcType: 'IfcSpace', modelIndex: 0, isCut: false, schemeColour: f.colour,
      })),
    } : {}),
  };
}

/** The polygons a renderer fills, in drawing order: the scheme's rooms first, then the cut faces. */
export function fillOrder(drawing: Drawing2D | StyledDrawing): readonly (Drawing2D['cutPolygons'][number] | StyledDrawing['cutPolygons'][number])[] {
  const rooms = 'schemeFills' in drawing ? drawing.schemeFills : undefined;
  return rooms?.length ? [...rooms, ...drawing.cutPolygons] : drawing.cutPolygons;
}

/** The fill a colour scheme gave a polygon (`#rrggbb`), if it did. */
export const schemeColourOf = (polygon: object): string | undefined => ('schemeColour' in polygon && typeof polygon.schemeColour === 'string' ? polygon.schemeColour : undefined);
