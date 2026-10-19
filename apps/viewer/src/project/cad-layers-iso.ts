/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An ISO 13567-style starter for the CAD layer standard (`cad-layers.ts`),
 * with CI/SfB element codes. Field structure per ISO 13567-2; the codes are
 * NOT checked against the standard's tables (the standard is paywalled), and
 * this is not a claim of conformance.
 *
 * A layer name is fixed-length fields, unused positions filled with `-`:
 *
 *     A-  21----  E-   _CUT
 *     |   |       |    optional field (see below)
 *     |   |       presentation (2): E- element graphics, H- hatching, D- dimensions, T- text
 *     |   element (6): a classification code, here CI/SfB table 1, padded with `-`
 *     agent responsible (2): A- architect
 *
 * The mandatory ten characters are agent + element + presentation. Cut, seen
 * and hidden are not presentation codes, so they go in an optional field after
 * them, as the user-defined suffix `_CUT`, `_SEEN`, `_HIDD` (`_` begins an
 * optional field). The width and position of that suffix among the standard's
 * optional fields were not checked.
 *
 * CI/SfB mapping used (IfcSheet does not tell internal from external, so
 * walls are all 21 and doors and windows both 31):
 *   21 walls, 23 floors and slabs, 24 stairs, ramps and railings, 27 roofs,
 *   28 columns and beams (frames), 31 doors and windows (openings),
 *   8- loose furniture; spaces and annotations have no element (`------`).
 *
 * Pens: cut 0.5 mm, seen 0.25, hidden 0.18 dashed, hatch 0.13, annotation 0.18.
 */

import type { LineType } from '@/drafting/styles';
import type { CadKind, CadLayerRule } from './cad-layers';

interface Family { key: string; element: string; classes: string[]; color: string }

/** The classes IfcSheet draws, grouped as the Visibility / Graphics categories group them. */
const FAMILIES: readonly Family[] = [
  { key: 'wall', element: '21', classes: ['IfcWall', 'IfcWallStandardCase', 'IfcCurtainWall'], color: '#7f1d1d' },
  { key: 'slab', element: '23', classes: ['IfcSlab'], color: '#78350f' },
  { key: 'roof', element: '27', classes: ['IfcRoof'], color: '#b45309' },
  { key: 'frame', element: '28', classes: ['IfcColumn', 'IfcBeam', 'IfcMember'], color: '#1e3a8a' },
  { key: 'door', element: '31', classes: ['IfcDoor'], color: '#166534' },
  { key: 'window', element: '31', classes: ['IfcWindow'], color: '#0e7490' },
  { key: 'stair', element: '24', classes: ['IfcStair', 'IfcStairFlight', 'IfcRamp', 'IfcRampFlight', 'IfcRailing'], color: '#6d28d9' },
  { key: 'space', element: '', classes: ['IfcSpace'], color: '#475569' },
  { key: 'furniture', element: '8', classes: ['IfcFurnishingElement', 'IfcFurniture'], color: '#9a3412' },
];

const AGENT = 'A-';

/** A layer name: agent (2) + element (6, `-` padded) + presentation (2) + optional suffix. */
export function isoLayerName(element: string, presentation: string, suffix = ''): string {
  return `${AGENT}${element.padEnd(6, '-')}${presentation}${suffix}`;
}

const PRESENTATIONS: readonly { source: string; id: string; presentation: string; suffix: string; weight: number; type?: LineType }[] = [
  { source: 'CUT', id: 'cut', presentation: 'E-', suffix: '_CUT', weight: 0.5 },
  { source: 'SEEN', id: 'seen', presentation: 'E-', suffix: '_SEEN', weight: 0.25 },
  { source: 'HIDDEN', id: 'hidd', presentation: 'E-', suffix: '_HIDD', weight: 0.18, type: 'dashed' },
  { source: 'HATCH', id: 'hatch', presentation: 'H-', suffix: '', weight: 0.13 },
];

const ANNOTATIONS: readonly { kind: CadKind; presentation: string }[] = [
  { kind: 'dimension', presentation: 'D-' },
  { kind: 'text', presentation: 'T-' },
  { kind: 'hatch', presentation: 'H-' },
];

/** Fresh rows each call: ids are stable (`iso-wall-cut`), so the table can be diffed and merged. */
export function isoStarterRules(): CadLayerRule[] {
  const rules: CadLayerRule[] = [];
  for (const f of FAMILIES) {
    for (const p of PRESENTATIONS) {
      rules.push({
        id: `iso-${f.key}-${p.id}`, source: p.source, ifcClasses: [...f.classes],
        layer: isoLayerName(f.element, p.presentation, p.suffix), color: f.color, lineWeight: p.weight, ...(p.type ? { lineType: p.type } : {}),
      });
    }
  }
  for (const a of ANNOTATIONS) {
    rules.push({ id: `iso-anno-${a.kind}`, kind: a.kind, layer: isoLayerName('', a.presentation), color: '#000000', lineWeight: 0.18 });
  }
  return rules;
}
