/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A minimal IFC4 model that meets the seven requirements of `byggesaksbim.ids`: one site with a matrikkel number, one building
 * with BYA and a building type, one storey with BTA and BRA, one zone that is a bruksenhet with BRA, and one lift with a type.
 * It is the example the README means by "the synthetic compliant model", written from code so the tests do not depend on a
 * binary; `without` takes one piece away, which is how the tests make a model that fails exactly one requirement.
 */

export type SyntheticPiece = 'matrikkel' | 'bya' | 'buildingType' | 'bta' | 'bra' | 'zoneReference' | 'zoneBra' | 'liftType';

export interface SyntheticOptions {
  /** Pieces to leave out. */
  without?: readonly SyntheticPiece[];
  /** A matrikkel number to use instead of the valid `0904-200/2430/0/14`. */
  matrikkel?: string;
  /** Add a zone that is not a bruksenhet (Reference "Brannklasse", no area): out of scope for the requirements, so it must change nothing. */
  fireZone?: boolean;
  /** The schema in FILE_SCHEMA; the requirements are IFC4, so another one is refused. */
  schema?: 'IFC4' | 'IFC2X3';
}

export function syntheticByggesaksbimModel({ without = [], matrikkel = '0904-200/2430/0/14', fireZone = false, schema = 'IFC4' }: SyntheticOptions = {}): string {
  const has = (p: SyntheticPiece) => !without.includes(p);
  const str = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const props = (...entries: (string | false)[]) => entries.filter((e): e is string => e !== false);
  const lines: string[] = [];
  let n = 0;
  const add = (body: string): number => { lines.push(`#${++n}=${body};`); return n; };
  const ref = (ids: number[]) => ids.map((i) => `#${i}`).join(',');
  const pset = (owner: number, name: string, id: string, values: string[]) => {
    if (values.length === 0) return;
    const ps = values.map((v) => add(v));
    const set = add(`IFCPROPERTYSET('${id}',$,${str(name)},$,(${ref(ps)}))`);
    add(`IFCRELDEFINESBYPROPERTIES('${id.slice(0, 21)}R',$,$,$,(#${owner}),#${set})`);
  };
  const units = [add('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)'), add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'), add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)')];
  const assignment = add(`IFCUNITASSIGNMENT((${ref(units)}))`);
  const project = add(`IFCPROJECT('2YidJSK6j79Oe3qvzjLuJC',$,'P',$,$,$,$,$,#${assignment})`);
  const site = add(`IFCSITE('2vy0IF6m51Ixz82aG8UPI8',$,'S',$,$,$,$,$,$,$,$,$,${has('matrikkel') ? str(matrikkel) : '$'},$)`);
  const building = add("IFCBUILDING('0LIP994YHCMg821ApF0TU0',$,'B',$,$,$,$,$,$,$,$,$)");
  const storey = add("IFCBUILDINGSTOREY('18YevMn_nCqegZ5pOkFRtT',$,'1',$,$,$,$,'H01',$,$)");
  add(`IFCRELAGGREGATES('2m8ulUmkvBYfsqkeOdFRdb',$,$,$,#${project},(#${site}))`);
  add(`IFCRELAGGREGATES('03XwOgbab7hOThmVL2j5qF',$,$,$,#${site},(#${building}))`);
  add(`IFCRELAGGREGATES('3klDtf9kv3yPdvb5jg1Ak9',$,$,$,#${building},(#${storey}))`);
  pset(building, 'Pset_BuildingCommon', '1fN9WpsFX58hxCMj3qJCj6', props(has('bya') && "IFCPROPERTYSINGLEVALUE('GrossPlannedArea',$,IFCAREAMEASURE(120.),$)", has('buildingType') && "IFCPROPERTYSINGLEVALUE('OccupancyType',$,IFCLABEL('111'),$)"));
  pset(storey, 'Pset_BuildingStoreyCommon', '0OJFKHgSnAzw980BKZBp56', props(has('bta') && "IFCPROPERTYSINGLEVALUE('GrossPlannedArea',$,IFCAREAMEASURE(120.),$)", has('bra') && "IFCPROPERTYSINGLEVALUE('NetPlannedArea',$,IFCAREAMEASURE(100.),$)"));
  const zone = add("IFCZONE('3lEIbnYvbDO9SX3imfMddV',$,'Z',$,$,'H0101')");
  pset(zone, 'Pset_ZoneCommon', '3w2fKZCR91e9xdcJ65daf1', props(has('zoneReference') && "IFCPROPERTYSINGLEVALUE('Reference',$,IFCIDENTIFIER('Bruksenhet'),$)", has('zoneBra') && "IFCPROPERTYSINGLEVALUE('NetPlannedArea',$,IFCAREAMEASURE(90.),$)"));
  if (fireZone) {
    const fire = add("IFCZONE('1cZ0Fire000000000000AB',$,'Brannseksjon',$,$,'BS1')");
    pset(fire, 'Pset_ZoneCommon', '0kZ0Fire0000000000000X', props("IFCPROPERTYSINGLEVALUE('Reference',$,IFCIDENTIFIER('Brannklasse'),$)"));
  }
  add(`IFCTRANSPORTELEMENT('3SbcVT5tHASx1P_v8ZacCr',$,'Lift',$,$,$,$,$,${has('liftType') ? '.ELEVATOR.' : '$'})`);
  return ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('ViewDefinition[DesignTransferView]'),'2;1');", "FILE_NAME('synthetic-byggesaksbim.ifc','2026-10-26T00:00:00',(''),(''),'IfcSheet','IfcSheet','');", `FILE_SCHEMA(('${schema}'));`, 'ENDSEC;', 'DATA;', ...lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
}
