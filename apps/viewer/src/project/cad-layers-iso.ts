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
 *     A-  21----  E-  ----------  CUT
 *     |   |       |   |           user-defined text, from position 21
 *     |   |       |   positions 11-20: the optional fields, unused, all `-`
 *     |   |       presentation (9-10): E- element graphics, H- hatching, D- dimensions, T- text
 *     |   element (3-8): a classification code, here CI/SfB table 1, padded with `-`
 *     agent responsible (1-2): A- architect
 *
 * Positions 1-10 (agent + element + presentation) are mandatory. Positions
 * 11-20 are the standard's defined optional fields, as commonly cited:
 * status (11, 1 character), sector (12-15, 4), phase (16, 1), projection
 * (17, 1), scale (18, 1), work package (19-20, 2). Those widths are
 * UNVERIFIED: the standard's text was not available to check them; only the
 * total (ten characters, user text from 21) is relied on here. The starter
 * fills none of them. Cut, seen and hidden are not presentation codes, so
 * they are user-defined text (`CUT`, `SEEN`, `HIDD`) from position 21. A
 * name with no user text stops after the mandatory ten characters.
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

/** Positions 11-20: the optional fields, none used by the starter. */
const UNUSED_OPTIONAL_FIELDS = '-'.repeat(10);

/**
 * A layer name: agent (2) + element (6, `-` padded) + presentation (2); with
 * user text, the ten optional-field positions as `-` and the text from 21.
 */
export function isoLayerName(element: string, presentation: string, userText = ''): string {
  const mandatory = `${AGENT}${element.padEnd(6, '-')}${presentation}`;
  return userText ? `${mandatory}${UNUSED_OPTIONAL_FIELDS}${userText}` : mandatory;
}

const PRESENTATIONS: readonly { source: string; id: string; presentation: string; userText: string; weight: number; type?: LineType }[] = [
  { source: 'CUT', id: 'cut', presentation: 'E-', userText: 'CUT', weight: 0.5 },
  { source: 'SEEN', id: 'seen', presentation: 'E-', userText: 'SEEN', weight: 0.25 },
  { source: 'HIDDEN', id: 'hidd', presentation: 'E-', userText: 'HIDD', weight: 0.18, type: 'dashed' },
  { source: 'HATCH', id: 'hatch', presentation: 'H-', userText: '', weight: 0.13 },
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
        layer: isoLayerName(f.element, p.presentation, p.userText), color: f.color, lineWeight: p.weight, ...(p.type ? { lineType: p.type } : {}),
      });
    }
  }
  for (const a of ANNOTATIONS) {
    rules.push({ id: `iso-anno-${a.kind}`, kind: a.kind, layer: isoLayerName('', a.presentation), color: '#000000', lineWeight: 0.18 });
  }
  return rules;
}
