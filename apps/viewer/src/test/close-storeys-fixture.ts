/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #256: the storeys of #234's `plan-cut-below-next-slab.ifc` (Lower at 0.0 m,
 * Upper only 1.0 m above), read from the fixture file itself, and the cut the
 * SHEET plan gives each of them, read from the project store. The live cut
 * paths (floor-plan command, Section bar menu) are asserted against both these
 * and the literal the rule gives (gap 1.0 m: min(1.2, max(1.0 - 0.5, 1.0 / 2)) = 0.5 m).
 */

import { readFileSync } from 'node:fs';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store.js';
import type { PlanProjectView } from '@/project/types';

const FIXTURE = new URL('../project/__fixtures__/plan-cut-below-next-slab.ifc', import.meta.url);

export interface FixtureStorey { name: string; elevation: number }

/** The fixture's IfcBuildingStorey rows: `'Name',$,$,#placement,$,$,.ELEMENT.,Elevation`. */
export function fixtureStoreys(): FixtureStorey[] {
  const text = readFileSync(FIXTURE, 'utf8');
  const out: FixtureStorey[] = [];
  for (const m of text.matchAll(/IFCBUILDINGSTOREY\('[^']*',\$,'([^']*)',[^;]*,\.ELEMENT\.,(-?[\d.]+)\);/g)) out.push({ name: m[1], elevation: Number(m[2]) });
  if (out.length !== 2) throw new Error(`expected 2 storeys in the fixture, read ${out.length}`);
  return out;
}

/** The cut (above the floor, metres) the sheet plan of each fixture storey carries, by storey name. */
export function sheetCutHeights(): Record<string, number> {
  resetProject();
  syncProjectWithModels([{ key: 'm', name: 'm' }], fixtureStoreys());
  const cuts: Record<string, number> = {};
  for (const v of useProjectStore.getState().views) if (v.kind === 'plan') cuts[v.name] = (v as PlanProjectView).cutHeight;
  return cuts;
}
