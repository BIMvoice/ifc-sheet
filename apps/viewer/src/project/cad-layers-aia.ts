/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An AIA / NCS-style preset for the CAD layer standard (`cad-layers.ts`):
 * discipline-major-minor names such as `A-WALL-CUT` and `A-ANNO-DIMS`. This
 * is the US pattern, NOT ISO 13567 (see `cad-layers-iso.ts`); the major and
 * minor codes are this table's own and were not checked against the National
 * CAD Standard. Pens: cut 0.5 mm, seen 0.25, hidden 0.18 dashed, hatch 0.13,
 * annotation 0.18.
 */
import type { LineType } from '@/drafting/styles';
import type { CadKind, CadLayerRule } from './cad-layers';

interface Family { code: string; classes: string[]; color: string }

/** The classes IfcSheet draws, grouped as the Visibility / Graphics categories group them. */
const FAMILIES: readonly Family[] = [
  { code: 'WALL', classes: ['IfcWall', 'IfcWallStandardCase', 'IfcCurtainWall'], color: '#7f1d1d' },
  { code: 'SLAB', classes: ['IfcSlab'], color: '#78350f' },
  { code: 'ROOF', classes: ['IfcRoof'], color: '#b45309' },
  { code: 'COLM', classes: ['IfcColumn'], color: '#1e3a8a' },
  { code: 'BEAM', classes: ['IfcBeam', 'IfcMember'], color: '#1d4ed8' },
  { code: 'DOOR', classes: ['IfcDoor'], color: '#166534' },
  { code: 'WDWS', classes: ['IfcWindow'], color: '#0e7490' },
  { code: 'STRS', classes: ['IfcStair', 'IfcStairFlight', 'IfcRamp', 'IfcRampFlight'], color: '#6d28d9' },
  { code: 'RAIL', classes: ['IfcRailing'], color: '#a21caf' },
  { code: 'SPCE', classes: ['IfcSpace'], color: '#475569' },
  { code: 'FURN', classes: ['IfcFurnishingElement', 'IfcFurniture'], color: '#9a3412' },
];

const PRESENTATIONS: readonly { source: string; code: string; weight: number; type?: LineType }[] = [
  { source: 'CUT', code: 'CUT', weight: 0.5 },
  { source: 'SEEN', code: 'SEEN', weight: 0.25 },
  { source: 'HIDDEN', code: 'HIDD', weight: 0.18, type: 'dashed' },
  { source: 'HATCH', code: 'PATT', weight: 0.13 },
];

const ANNOTATIONS: readonly { kind: CadKind; layer: string }[] = [
  { kind: 'dimension', layer: 'A-ANNO-DIMS' },
  { kind: 'text', layer: 'A-ANNO-TEXT' },
  { kind: 'hatch', layer: 'A-ANNO-PATT' },
];

/** Fresh rows each call: ids are stable (`aia-wall-cut`), so the table can be diffed and merged. */
export function aiaStarterRules(): CadLayerRule[] {
  const rules: CadLayerRule[] = [];
  for (const f of FAMILIES) {
    for (const p of PRESENTATIONS) {
      rules.push({
        id: `aia-${f.code.toLowerCase()}-${p.code.toLowerCase()}`, source: p.source, ifcClasses: [...f.classes],
        layer: `A-${f.code}-${p.code}`, color: f.color, lineWeight: p.weight, ...(p.type ? { lineType: p.type } : {}),
      });
    }
  }
  for (const a of ANNOTATIONS) {
    rules.push({ id: `aia-anno-${a.kind}`, kind: a.kind, layer: a.layer, color: '#000000', lineWeight: 0.18 });
  }
  return rules;
}
