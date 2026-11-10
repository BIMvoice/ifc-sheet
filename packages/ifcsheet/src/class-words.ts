/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The names of IFC element classes in Romanian (#602), the one copy: the quantities by type and the material takeoff print them
 * through `classLabel`, and the app's catalogues (`ifc-class.ro.ts`) spread the same words into its own labels, so a sheet, its
 * PDF and a tool's name cannot call a class two things. Keyed by the class without its `Ifc` prefix.
 *
 * English prints the IFC name itself (`StairFlight`, `BuildingElementProxy`): in English the IFC name is the word. A class this
 * table does not list prints as its IFC name in any language, which is true if untranslated, never a guess. Where the IFC name
 * itself is meant (the class a rule selects, the classify listing, the `{IfcClass}` placeholder, the class column of a CSV or XLSX) code keeps the IFC name and does
 * not call this. Imports nothing, so a catalogue may load it.
 */

export const CLASS_WORDS_RO = {
  Wall: 'Perete',
  WallStandardCase: 'Perete',
  CurtainWall: 'Perete cortină',
  Door: 'Ușă',
  Window: 'Fereastră',
  Slab: 'Planșeu',
  Column: 'Stâlp',
  Beam: 'Grindă',
  Roof: 'Acoperiș',
  Stair: 'Scară',
  StairFlight: 'Volee de scară',
  Ramp: 'Rampă',
  RampFlight: 'Volee de rampă',
  Railing: 'Balustradă',
  Covering: 'Finisaj',
  Plate: 'Placă',
  Member: 'Element liniar',
  Footing: 'Fundație',
  Pile: 'Pilot',
  Chimney: 'Coș de fum',
  Furniture: 'Mobilier',
  BuildingElementProxy: 'Element generic',
  Space: 'Încăpere',
  OpeningElement: 'Gol',
} as const satisfies Record<string, string>;

export type ClassWordKey = keyof typeof CLASS_WORDS_RO;

/** The class without its `Ifc` prefix: `IfcWall` is `Wall`. */
export const plainClass = (ifcClass: string): string => ifcClass.replace(/^Ifc/, '');

const isRomanian = (language: string): boolean => /^ro\b/i.test(language);

/** What a table calls an IFC class for a reader of `language`: its Romanian word in Romanian when the table has one, else the IFC name without its prefix. */
export function classLabel(ifcClass: string, language: string): string {
  const plain = plainClass(ifcClass);
  return isRomanian(language) && Object.hasOwn(CLASS_WORDS_RO, plain) ? CLASS_WORDS_RO[plain as ClassWordKey] : plain;
}
