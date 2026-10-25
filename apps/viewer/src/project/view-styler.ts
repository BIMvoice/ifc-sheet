/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The web app's styler of a view (#34): the engine's one styler (`viewStyler`, `@bimvoice/ifcsheet`) with what only the app
 * knows plugged in — the project's graphic standard (its pen table), the view's phases (`phases.ts`), a linked model drawn
 * halftone (`model-styles.ts`, #96) and the elements' properties for a preset's property rules (read from the loaded models).
 *
 * The drafting view's canvas, the sheets' pens (`viewport-pens.ts`, hence the sheet's PDF and DXF) and the view's DXF all take
 * their styler from here, so the same view cannot style an item two ways. One styler per drawing and set of inputs, shared by
 * every component that draws it (`shared-memo.ts`): the inputs ARE the cache key, so a change of graphics, standard, model style
 * or (when the rules read properties) of the models or their properties makes a new styler, and with it new pens.
 */

import { elementProperties, presetRules, rulesReadProperties, viewStyler, type ViewStyler } from '@bimvoice/ifcsheet';
import type { Drawing2D, ElementData } from '@ifc-lite/drawing-2d';
import { extractPropertiesOnDemand } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';
import { fromGlobalIdFromModels } from '@/store/globalId';
import { memoOn, sharedMemo } from '@/components/viewer/sheets/shared-memo';
import type { GraphicStandard } from '@/drafting/graphic-standard';
import { phaseStyle } from './phases';
import { halftoneColor, type EntityStyleOf } from './model-styles';
import type { ViewGraphics } from './types';

type Properties = ElementData['properties'];

/** Each element's properties, read from its model once and merged by set name (`elementProperties`). */
function propertiesReader(): (entityId: number) => Properties {
  const { models, ifcDataStore } = useViewerStore.getState();
  const cache = new Map<number, Properties>();
  return (entityId) => {
    if (cache.has(entityId)) return cache.get(entityId);
    const ref = fromGlobalIdFromModels(models, entityId);
    const store = ref ? (ref.modelId === 'legacy' ? ifcDataStore : (models.get(ref.modelId)?.ifcDataStore ?? null)) : null;
    let value: Properties;
    try {
      value = ref && store ? elementProperties(extractPropertiesOnDemand(store, ref.expressId)) : undefined;
    } catch {
      value = undefined;
    }
    cache.set(entityId, value);
    return value;
  };
}

const stylers = sharedMemo<ViewStyler>();
const NO_DRAWING = {};

/** The styler of a view's drawing with `graphics` (`resolveViewGraphics`'s), the project's `standard` and the models' draw styles. */
export function appViewStyler(graphics: ViewGraphics | undefined, drawing: Drawing2D | object | null, standard: GraphicStandard, styleOf?: EntityStyleOf): ViewStyler {
  // The models and their property edits only matter to a view whose rules read properties.
  const reads = rulesReadProperties(presetRules(graphics));
  const s = useViewerStore.getState();
  const deps = [graphics, standard, styleOf, reads ? s.models : null, reads ? s.ifcDataStore : null, reads ? s.mutationVersion : null];
  return memoOn(stylers, drawing ?? NO_DRAWING, deps, () => viewStyler({
    graphics,
    pens: standard,
    phaseStyle: (phase) => phaseStyle(graphics, phase),
    ...(styleOf ? { ink: (colour: string, entityId: number | undefined) => (entityId !== undefined && styleOf(entityId) === 'halftone' ? halftoneColor(colour) : colour) } : {}),
    ...(reads ? { propertiesOf: propertiesReader() } : {}),
  }));
}
