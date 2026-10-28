/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The drafting settings a session starts with, and the view of them a command sees on the current target. */

import type { DraftSettings } from './commands/types';

export function defaultDraftSettings(): DraftSettings {
  return { filletRadius: 0, offsetDistance: null, textHeight: 0.25, hatchPattern: 'LINES45', hatchScale: 1, hatchAngle: 0, extrudeClass: 'IfcBuildingElementProxy', extrudeDepth: 1,
  roofKind: 'gable', roofSystem: true, roofPick: false, roofSlope: 30, roofThickness: 0.25, roofOverhang: 0.5,
  axisLabel: '1', axisBubble: 'circle', axisEnds: 'both', axisSize: null, axisLineType: 'dashdot',
  dimContinuous: true, dimAlign: true, currentTextStyle: 'standard', currentDimStyle: 'standard', tagField: 'mark', annotationType: null,
  symbolId: null, symbolScale: 1, symbolRotation: 0, symbolTarget: null };
}

/**
 * Annotation sizes (text height, hatch scale) are model metres on a view; a
 * sheet drafts in paper millimetres, where the same settings read x10.
 */
const SCALED = new Set<keyof DraftSettings>(['textHeight', 'hatchScale']);

export function scaledDraftSettings(settings: DraftSettings, scale: () => number): DraftSettings {
  return new Proxy(settings, {
    get: (target, key) => (SCALED.has(key as keyof DraftSettings) ? (target[key as keyof DraftSettings] as number) * scale() : target[key as keyof DraftSettings]),
    set: (target, key, value) => {
      (target as unknown as Record<string, unknown>)[key as string] = SCALED.has(key as keyof DraftSettings) ? Number(value) / scale() : value;
      return true;
    },
  });
}
