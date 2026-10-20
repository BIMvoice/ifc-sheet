/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the IFC itself lacks, as data: the model-side counterpart of the set-side
 * checks in `findings.ts`. Each finding says what is missing and which
 * IfcSheet feature is weaker for it, so a thin draft set is explained, not
 * puzzling. A pure function of counts (`ModelFacts`); `readiness-read.ts`
 * counts them from the loaded models in one pass over the entity table.
 */

/** What the loaded models hold, counted once. "Elements" are the products that have geometry, rooms (IfcSpace) apart. */
export interface ModelFacts {
  storeys: number;
  spaces: number;
  elements: number;
  elementsWithoutStorey: number;
  elementsWithoutMaterial: number;
  elementsWithoutQuantities: number;
  /** GlobalIds carried by more than one entity, and the entities that share them. */
  duplicateGlobalIds: number;
  duplicatedEntities: number;
}

export type ReadinessKind = 'noStoreys' | 'noSpaces' | 'noMaterials' | 'noQuantities' | 'duplicateGlobalIds' | 'noStorey';

export interface ReadinessFinding {
  kind: ReadinessKind;
  /** Catalogue keys: what is missing (`ready.<kind>`) and what is weaker because of it (`ready.<kind>.effect`). */
  key: `ready.${ReadinessKind}`;
  effectKey: `ready.${ReadinessKind}.effect`;
  params: Record<string, number>;
}

const finding = (kind: ReadinessKind, params: Record<string, number>): ReadinessFinding => ({ kind, key: `ready.${kind}`, effectKey: `ready.${kind}.effect`, params });

/**
 * The findings, in the order the draft set depends on them: levels first (a plan per level),
 * then rooms, then what the schedules read. An empty model (no element, no room) has nothing to report.
 */
export function modelReadiness(f: ModelFacts): ReadinessFinding[] {
  if (f.elements === 0 && f.spaces === 0 && f.storeys === 0) return [];
  const out: ReadinessFinding[] = [];
  if (f.storeys === 0) out.push(finding('noStoreys', {}));
  if (f.spaces === 0) out.push(finding('noSpaces', {}));
  if (f.elements > 0) {
    if (f.elementsWithoutStorey > 0) out.push(finding('noStorey', { count: f.elementsWithoutStorey, total: f.elements }));
    if (f.elementsWithoutMaterial > 0) out.push(finding('noMaterials', { count: f.elementsWithoutMaterial, total: f.elements }));
    if (f.elementsWithoutQuantities > 0) out.push(finding('noQuantities', { count: f.elementsWithoutQuantities, total: f.elements }));
  }
  if (f.duplicateGlobalIds > 0) out.push(finding('duplicateGlobalIds', { count: f.duplicateGlobalIds, entities: f.duplicatedEntities }));
  return out;
}
