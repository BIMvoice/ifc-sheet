#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Gives the demo project's walls and floor slabs their building materials (#850).
 *
 * `apps/viewer/public/samples/bloc-p4.ifc` (the "Bloc P+4" demo, `demo-model.ts`) was committed without a generator, and
 * its 365 walls and 90 floor slabs had no material: setting a hatch for a material in the demo changed nothing on its
 * plans and sections. This script appends, after the base file's last entity (#65086), what a Romanian block of flats
 * is built of, as an IfcMaterialLayerSetUsage on each element through IfcRelAssociatesMaterial (the model has no element
 * types). Every base entity, id, GlobalId and byte stays as it was.
 *
 *   facade walls 35 and 30 cm, walls 25 cm   brick masonry
 *   partitions 12.5 cm                       AAC block masonry
 *   stair, lift and median walls             reinforced concrete (the balconies' existing IfcMaterial)
 *   floor slabs 15 cm                        reinforced concrete
 *
 * One layer each, the element's whole thickness: an element of one material is cut in one piece at every detail level,
 * so the hatch its material's row gives it is drawn at 1:100 too. (A wall of several layers is drawn by its outline at
 * the coarse level of 1:100, and that outline has no one material to hatch by.) The demo project starts with those rows
 * (`project/demo-project.ts`). Elements that already had a material (the render and stone shells, balconies, stairs,
 * roof) are left alone.
 *
 * Rerunning replaces the appended block with the same bytes (GlobalIds are hashed from fixed seeds). Anything the
 * script does not expect in the base (a wall it cannot classify, a profile off its axis) stops it with the entity named.
 *
 *   node tools/bloc-p4/derive-materials.mjs          rewrite the sample
 *   node tools/bloc-p4/derive-materials.mjs --check  exit 1 when the committed sample differs from what this writes
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../../apps/viewer/public/samples/bloc-p4.ifc', import.meta.url));
/** The last entity of the file as it was committed (bf7e67059): everything after it is this script's. */
const BASE_LAST_ID = 65086;
const OWNER_HISTORY = '#5';
/** The existing 'Reinforced concrete' IfcMaterial of the balconies: the structure is the same concrete. */
const REINFORCED_CONCRETE = 10698;
const EPS = 1e-6;

const fail = (msg) => { throw new Error(`derive-materials: ${msg}`); };

// --- reading the base --------------------------------------------------------------------------------------------

const text = readFileSync(FILE, 'utf8');
const idOf = (line) => { const m = /^#(\d+)=/.exec(line); return m ? Number(m[1]) : null; };
const baseLines = text.split('\n').filter((line) => { const id = idOf(line); return id === null || id <= BASE_LAST_ID; });
const endsec = baseLines.lastIndexOf('ENDSEC;');
if (endsec < 0 || idOf(baseLines[endsec - 1]) !== BASE_LAST_ID) fail(`the base does not end with #${BASE_LAST_ID} then ENDSEC`);

/** Top-level STEP attributes of `args` (strings and nested lists kept whole). */
function splitArgs(args) {
  const out = [];
  let depth = 0, quoted = false, start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (quoted) { if (c === "'") { if (args[i + 1] === "'") i++; else quoted = false; } continue; }
    if (c === "'") quoted = true;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(args.slice(start, i)); start = i + 1; }
  }
  out.push(args.slice(start));
  return out;
}

const entities = new Map();
for (const line of baseLines) {
  const m = /^#(\d+)=([A-Z0-9]+)\((.*)\);$/.exec(line);
  if (m) entities.set(Number(m[1]), { type: m[2], args: splitArgs(m[3]) });
}
const get = (ref, type) => {
  const e = entities.get(Number(String(ref).replace('#', '')));
  if (!e) fail(`${ref} is missing`);
  if (type && e.type !== type) fail(`${ref} is ${e.type}, expected ${type}`);
  return e;
};
const refs = (list) => [...list.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
const nums = (list) => list.replace(/[()]/g, '').split(',').map(Number);
/** A STEP string decoded (\X2\hhhh\X0\ and \X\hh escapes). */
const decode = (s) => s.slice(1, -1).replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, hex) => String.fromCharCode(...hex.match(/.{4}/g).map((h) => parseInt(h, 16))))
  .replace(/\\X\\([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/''/g, "'");
/** A string for STEP: ASCII as is, anything else as \X2\hhhh\X0\. */
const encode = (s) => `'${[...s].map((c) => (c.charCodeAt(0) < 128 ? (c === "'" ? "''" : c) : `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)).join('')}'`;

const associated = new Set();
for (const e of entities.values()) if (e.type === 'IFCRELASSOCIATESMATERIAL') for (const id of refs(e.args[4])) associated.add(id);

/** The one swept solid of an element's Body (through boolean clippings), checked to sit on the element's own axes. */
function sweptSolid(element, id) {
  const shape = get(element.args[6], 'IFCPRODUCTDEFINITIONSHAPE');
  const bodies = refs(shape.args[2]).map((r) => get(r, 'IFCSHAPEREPRESENTATION')).filter((r) => r.args[1] === "'Body'");
  if (bodies.length !== 1 || refs(bodies[0].args[3]).length !== 1) fail(`#${id}: not one Body item`);
  let item = get(refs(bodies[0].args[3])[0]);
  while (item.type === 'IFCBOOLEANCLIPPINGRESULT') item = get(item.args[1]);
  if (item.type !== 'IFCEXTRUDEDAREASOLID') fail(`#${id}: Body is ${item.type}`);
  const pos = get(item.args[1], 'IFCAXIS2PLACEMENT3D');
  if (nums(get(pos.args[0]).args[0]).some((c) => Math.abs(c) > EPS) || pos.args[1] !== '$' || pos.args[2] !== '$') fail(`#${id}: the solid is moved off the element's axes`);
  if (Math.abs(nums(get(item.args[2], 'IFCDIRECTION').args[0])[2] - 1) > EPS) fail(`#${id}: not extruded up`);
  return { profile: get(item.args[0]), depth: Number(item.args[3]) };
}

// --- what each element is made of --------------------------------------------------------------------------------

/** The demo's new materials; `project/demo-project.ts` gives them their hatches by these names. */
const MATERIALS = {
  brick: { name: 'Brick masonry (zidărie de cărămidă)', category: 'Masonry' },
  aac: { name: 'AAC block masonry (zidărie BCA)', category: 'Masonry' },
  concrete: { id: REINFORCED_CONCRETE },
};
if (decode(get(REINFORCED_CONCRETE, 'IFCMATERIAL').args[0]) !== 'Reinforced concrete') fail(`#${REINFORCED_CONCRETE} is not Reinforced concrete`);

/** The material of a wall from its name and thickness. */
function wallMaterial(name, t, id) {
  if (/^(Casa scarii|Lift|Perete median)\b/.test(name)) return 'concrete';
  if (name.startsWith('Fatada ') &&(Math.abs(t - 0.35) < EPS || Math.abs(t - 0.3) < EPS)) return 'brick';
  if (Math.abs(t - 0.25) < EPS) return 'brick';
  if (Math.abs(t - 0.125) < EPS) return 'aac';
  return fail(`#${id} '${name}' (${t} m): no material for it`);
}

/** Elements by (material, axis, thickness): one layer set usage each. */
const groups = new Map();
const add = (material, axis, thickness, id) => {
  const key = `${material}|${axis}|${thickness}`;
  if (!groups.has(key)) groups.set(key, { material, axis, thickness, members: [] });
  groups.get(key).members.push(id);
};
const counts = { walls: 0, slabs: 0 };
for (const [id, e] of entities) {
  if (associated.has(id)) continue;
  if (e.type === 'IFCWALL') {
    const { profile } = sweptSolid(e, id);
    if (profile.type !== 'IFCRECTANGLEPROFILEDEF') fail(`#${id}: profile is ${profile.type}`);
    if (Math.abs(nums(get(get(profile.args[2], 'IFCAXIS2PLACEMENT2D').args[0]).args[0])[1]) > EPS) fail(`#${id}: the profile is off the wall's axis`);
    const t = Number(profile.args[4]);
    add(wallMaterial(decode(e.args[2]), t, id), 'AXIS2', t, id);
    counts.walls++;
  } else if (e.type === 'IFCSLAB') {
    const { depth } = sweptSolid(e, id);
    if (Math.abs(depth - 0.15) > EPS) fail(`#${id}: slab ${depth} m deep`);
    if (e.args[8] !== '.FLOOR.') fail(`#${id}: slab is ${e.args[8]}`);
    add('concrete', 'AXIS3', 0.15, id);
    counts.slabs++;
  }
}

// --- writing -----------------------------------------------------------------------------------------------------

const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
/** A fixed IfcGloballyUniqueId for `seed`: 128 bits of its SHA-1 in the IFC base-64 alphabet. */
function guid(seed) {
  let n = BigInt(`0x${createHash('sha1').update(`bloc-p4 materials ${seed}`).digest('hex').slice(0, 32)}`);
  let out = '';
  for (let i = 0; i < 22; i++) { out = B64[Number(n & 63n)] + out; n >>= 6n; }
  return `'${out}'`;
}

let next = BASE_LAST_ID + 1;
const added = [];
const emit = (type, args) => { const id = next++; added.push(`#${id}=${type}(${args.join(',')});`); return id; };
const num = (x) => { const s = String(x); return s.includes('.') || s.includes('e') ? s : `${s}.`; };

const materialIds = {};
for (const [key, m] of Object.entries(MATERIALS)) materialIds[key] = m.id ?? emit('IFCMATERIAL', [encode(m.name), '$', encode(m.category)]);

for (const g of groups.values()) {
  const cm = Math.round(g.thickness * 1000) / 10;
  const setName = g.axis === 'AXIS3' ? `Floor slab ${cm}` : `${g.material === 'concrete' ? 'Concrete wall' : g.material === 'aac' ? 'Partition' : 'Masonry wall'} ${cm}`;
  const layer = emit('IFCMATERIALLAYER', [`#${materialIds[g.material]}`, num(g.thickness), '$', '$', '$', '$', '$']);
  const set = emit('IFCMATERIALLAYERSET', [`(#${layer})`, encode(setName), '$']);
  // A wall's layer runs across its whole thickness from one face (the profile is centred on the wall's axis); a slab's up from its underside.
  const offset = g.axis === 'AXIS3' ? 0 : -Math.round((g.thickness / 2) * 1e6) / 1e6;
  const usage = emit('IFCMATERIALLAYERSETUSAGE', [`#${set}`, `.${g.axis}.`, '.POSITIVE.', num(offset), '$']);
  emit('IFCRELASSOCIATESMATERIAL', [guid(`${g.material}|${g.axis}|${g.thickness}`), OWNER_HISTORY, '$', '$', `(${g.members.map((m) => `#${m}`).join(',')})`, `#${usage}`]);
}

const out = [...baseLines.slice(0, endsec), ...added, ...baseLines.slice(endsec)].join('\n');
if (process.argv.includes('--check')) {
  if (out !== text) { console.error('bloc-p4.ifc is not what tools/bloc-p4/derive-materials.mjs writes: rerun it'); process.exit(1); }
  console.log('bloc-p4.ifc is up to date');
} else {
  writeFileSync(FILE, out);
  console.log(`bloc-p4.ifc: ${counts.walls} walls and ${counts.slabs} floor slabs given a material (${[...groups.values()].map((g) => `${g.members.length} ${g.material} ${g.axis} ${g.thickness}`).join(', ')}); ${added.length} entities after #${BASE_LAST_ID}`);
}
