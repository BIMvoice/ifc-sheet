/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A surveyor's DXF placed under the site plan by the model's IfcMapConversion (#182): no points to pick. The placement is the engine's
 * (`placeDxfByMapConversion`); this reads the conversion off the loaded model, in metres, and stores the result.
 */

import { extractGeoreferencingOnDemand, extractLengthUnitScale, type IfcDataStore, type MapConversion, type ProjectedCRS } from '@ifc-lite/parser';
import { mapUnitsToMeters } from '@bimvoice/ifcsheet/georef';
import { placeDxfByMapConversion, type MapConversionPlacement } from '@bimvoice/ifcsheet/underlay';
import { useViewerStore } from '@/store';
import { changeDxfUnderlay } from './dxf-underlay-actions';

/** The conversion's offsets in metres: eastings and northings are in the map's unit, the rest is a ratio and a direction. */
export function mapConversionInMetres(mc: MapConversion, crs: Pick<ProjectedCRS, 'mapUnitScale'> | undefined, lengthUnitScale: number): MapConversionPlacement {
  return {
    eastings: mapUnitsToMeters(mc.eastings, crs, lengthUnitScale),
    northings: mapUnitsToMeters(mc.northings, crs, lengthUnitScale),
    xAxisAbscissa: mc.xAxisAbscissa,
    xAxisOrdinate: mc.xAxisOrdinate,
    scale: mc.scale,
  };
}

/** The first loaded model's map conversion, in metres; null when no model has one. */
export function loadedMapConversion(): MapConversionPlacement | null {
  const { models, ifcDataStore } = useViewerStore.getState();
  const stores: IfcDataStore[] = [...models.values()].map((m) => m.ifcDataStore).filter((s): s is IfcDataStore => s != null);
  if (stores.length === 0 && ifcDataStore) stores.push(ifcDataStore);
  for (const store of stores) {
    const info = extractGeoreferencingOnDemand(store);
    if (!info?.hasGeoreference || !info.mapConversion) continue;
    const unit = store.source?.length && store.entityIndex ? extractLengthUnitScale(store.source, store.entityIndex) : 1;
    return mapConversionInMetres(info.mapConversion, info.projectedCRS, unit);
  }
  return null;
}

/** Places the DXF by the model's georeference. 'locked', 'no-georef' (no model conversion, or not a usable one) or 'placed'. */
export function placeDxfUnderlayByGeoreference(id: string, mc: MapConversionPlacement | null = loadedMapConversion()): 'placed' | 'locked' | 'no-georef' {
  let result: 'placed' | 'locked' | 'no-georef' = 'no-georef';
  changeDxfUnderlay(id, (u) => {
    if (u.locked) { result = 'locked'; return null; }
    const placed = mc ? placeDxfByMapConversion(u, mc) : null;
    if (placed) result = 'placed';
    return placed;
  });
  return result;
}
