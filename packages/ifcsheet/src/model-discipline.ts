/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The discipline of a loaded model (#830): architectural, structural, MEP or other, read from what the model holds. When an
 * architectural model and a structural one are federated, the doors and windows a plan draws symbols for are the architectural
 * model's (`opening-owners.ts`): a structural model often carries copies of the architect's doors, and two symbols for one door
 * (sometimes swinging opposite ways) is what #830 reported.
 *
 * The content decides: the occurrences of the classes each discipline models (doors, windows, spaces, furniture, coverings,
 * stairs and railings for architecture; beams, columns, footings, piles and reinforcement for structure; flow segments,
 * fittings and terminals for MEP). Slabs, members, plates and walls count for none: every discipline models them (an
 * architect's curtain wall is hundreds of members and plates, FZK's roof 42 rafters), so they would read a house as structure. One count must be at least 1.5 times the next for the content to settle it.
 * Otherwise the file name breaks the tie, by its tokens (`STR`, `KON`, `RIB`, `_S_` for structure; `ARC`, `ARCH`, `ARK`, `BWK`,
 * `_A_` for architecture; `MEP`, `HVAC`, `VVS`, `ELEC` for MEP); without one the larger count wins, and a model with none of these
 * classes is `other`.
 */

import type { IfcDataStore } from '@ifc-lite/parser';

export type ModelDiscipline = 'architectural' | 'structural' | 'mep' | 'other';

const CLASSES: Record<Exclude<ModelDiscipline, 'other'>, readonly string[]> = {
  architectural: [
    'IFCDOOR', 'IFCDOORSTANDARDCASE', 'IFCWINDOW', 'IFCWINDOWSTANDARDCASE', 'IFCSPACE', 'IFCFURNISHINGELEMENT', 'IFCFURNITURE',
    'IFCCOVERING', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAILING',
  ],
  structural: [
    'IFCBEAM', 'IFCBEAMSTANDARDCASE', 'IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE', 'IFCFOOTING', 'IFCPILE', 'IFCREINFORCINGBAR',
    'IFCREINFORCINGMESH', 'IFCTENDON',
  ],
  mep: [
    'IFCFLOWSEGMENT', 'IFCFLOWFITTING', 'IFCFLOWTERMINAL', 'IFCFLOWCONTROLLER', 'IFCFLOWMOVINGDEVICE', 'IFCPIPESEGMENT', 'IFCPIPEFITTING',
    'IFCDUCTSEGMENT', 'IFCDUCTFITTING', 'IFCAIRTERMINAL', 'IFCCABLECARRIERSEGMENT', 'IFCCABLECARRIERFITTING', 'IFCCABLESEGMENT',
    'IFCLIGHTFIXTURE', 'IFCVALVE', 'IFCPUMP', 'IFCFAN', 'IFCSANITARYTERMINAL', 'IFCOUTLET',
  ],
};

const NAME_TOKENS: Record<Exclude<ModelDiscipline, 'other'>, ReadonlySet<string>> = {
  structural: new Set(['S', 'STR', 'STRUCT', 'STRUCTURE', 'STRUCTURAL', 'KON', 'KONSTR', 'RIB', 'TRAGWERK', 'TWP']),
  architectural: new Set(['A', 'ARC', 'ARCH', 'ARCHI', 'ARCHITECTURE', 'ARCHITECTURAL', 'ARK', 'BWK']),
  mep: new Set(['MEP', 'HVAC', 'VVS', 'HKLS', 'ELEC', 'ELE', 'PLUMBING', 'TGA']),
};

/** How many occurrences of each discipline's classes `store` holds. */
export function disciplineCounts(store: Pick<IfcDataStore, 'entityIndex'>): Record<Exclude<ModelDiscipline, 'other'>, number> {
  const count = (classes: readonly string[]) => classes.reduce((n, c) => n + (store.entityIndex.byType.get(c)?.length ?? 0), 0);
  return { architectural: count(CLASSES.architectural), structural: count(CLASSES.structural), mep: count(CLASSES.mep) };
}

/** The discipline a file name's tokens say, or null when they say none or more than one. */
export function disciplineOfName(fileName: string | undefined): Exclude<ModelDiscipline, 'other'> | null {
  const tokens = (fileName ?? '').replace(/\.[a-z0-9]+$/i, '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const said = (Object.keys(NAME_TOKENS) as Array<Exclude<ModelDiscipline, 'other'>>).filter((d) => tokens.some((t) => NAME_TOKENS[d].has(t)));
  return said.length === 1 ? said[0] : null;
}

const memo = new WeakMap<object, Map<string, ModelDiscipline>>();

/** The discipline of the model `store` holds, read from its content and, when that is not clear, from `fileName`. */
export function modelDisciplineOf(store: Pick<IfcDataStore, 'entityIndex'>, fileName?: string): ModelDiscipline {
  const key = fileName ?? '';
  const held = memo.get(store)?.get(key);
  if (held) return held;
  const counts = disciplineCounts(store);
  const ranked = (Object.entries(counts) as Array<[Exclude<ModelDiscipline, 'other'>, number]>).sort((a, b) => b[1] - a[1]);
  const [[top, first], [, second]] = ranked;
  const named = disciplineOfName(fileName);
  const discipline: ModelDiscipline = first === 0 ? named ?? 'other'
    : first >= 1.5 * second ? top
    : named && counts[named] > 0 ? named
    : first > second ? top : 'other';
  if (!memo.has(store)) memo.set(store, new Map());
  memo.get(store)!.set(key, discipline);
  return discipline;
}
