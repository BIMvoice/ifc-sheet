/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Makes `AC20-FZK-Haus-phases.ifc`: the FZK-Haus sample with `Pset_WallCommon.Status`
 * set on some ground-floor walls, so phases (existing / to demolish / proposed) can be
 * tested on a real model. FZK-Haus itself carries no Status.
 *
 *   node tools/phase-fixture/make-phase-fixture.mjs
 *
 * The sample's STEP text is copied; per listed wall one IfcPropertyEnumeratedValue
 * (Name 'Status', no Description, one IfcLabel) is appended before ENDSEC, with a fresh id after the sample's last, and
 * added to the wall's own Pset_WallCommon. Walls not listed get no Status.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/viewer/public/_fixtures');
const source = resolve(dir, 'AC20-FZK-Haus.ifc');
const target = resolve(dir, 'AC20-FZK-Haus-phases.ifc');

/** Wall name in the sample -> Status. Wand-Ext-ERDG-4 is deliberately left out: no Status. */
export const STATUS = {
  'Wand-Ext-ERDG-1': 'EXISTING',
  'Wand-Ext-ERDG-2': 'EXISTING',
  'Wand-Ext-ERDG-3': 'EXISTING',
  'Wand-Int-ERDG-1': 'DEMOLISH',
  'Wand-Int-ERDG-2': 'NEW',
};

const text = readFileSync(source, 'latin1');
const idOf = (name) => {
  const m = new RegExp(`^#(\\d+)= IFCWALLSTANDARDCASE\\('[^']*',#\\d+,'${name}'`, 'm').exec(text);
  if (!m) throw new Error(`wall ${name} not found`);
  return Number(m[1]);
};
let next = Math.max(...[...text.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1]))) + 1;
const owner = /^#(\d+)= IFCOWNERHISTORY/m.exec(text)[1];
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
let seed = 0x9e3779b1;
const guid = () => {
  let out = '';
  for (let i = 0; i < 22; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    out += ALPHABET[(seed >>> 24) % (i === 0 ? 4 : 64)];
  }
  return out;
};
const lines = [];
let out = text;
for (const [name, status] of Object.entries(STATUS)) {
  const wall = idOf(name);
  const value = next++;
  lines.push(`#${value}= IFCPROPERTYENUMERATEDVALUE('Status',$,(IFCLABEL('${status}')),$);`);
  // The wall's own Pset_WallCommon (every wall of the sample has one) gets the property, as
  // a real exporter writes it; a wall without that set gets a new one.
  const rel = new RegExp(`^#\\d+= IFCRELDEFINESBYPROPERTIES\\('[^']*',#\\d+,\\$,\\$,\\([^)]*#${wall}\\b[^)]*\\),#(\\d+)\\);`, 'gm');
  let patched = false;
  for (const m of text.matchAll(rel)) {
    const set = new RegExp(`^(#${m[1]}= IFCPROPERTYSET\\('[^']*',#\\d+,'Pset_WallCommon',[^\\n]*?\\()([^)]*)(\\)\\);)$`, 'm');
    if (!set.test(out)) continue;
    out = out.replace(set, (_, head, props, tail) => `${head}${props},#${value}${tail}`);
    patched = true;
    break;
  }
  if (!patched) {
    const pset = next++, defines = next++;
    lines.push(
      `#${pset}= IFCPROPERTYSET('${guid()}',#${owner},'Pset_WallCommon',$,(#${value}));`,
      `#${defines}= IFCRELDEFINESBYPROPERTIES('${guid()}',#${owner},$,$,(#${wall}),#${pset});`,
    );
  }
}
const at = out.lastIndexOf('ENDSEC;');
writeFileSync(target, `${out.slice(0, at)}${lines.join('\n')}\n${out.slice(at)}`, 'latin1');
console.log(`wrote ${target}: ${Object.keys(STATUS).length} walls`);
