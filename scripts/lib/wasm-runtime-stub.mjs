/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * For tests: a stand-in ifc-lite.js that provides every export and class
 * method an ifc-lite.d.ts declares, except the names in `lacking`. Paired with
 * the real committed .d.ts it gives a runtime the parity check accepts, and
 * with one name left out, one it must refuse.
 */

import { readFileSync } from 'node:fs';
import { classMembers, declaredExports } from './wasm-export-parity.mjs';

export function stubRuntimeFor(dtsPath, lacking = []) {
  const dts = readFileSync(dtsPath, 'utf8');
  const classes = new Map();
  for (const full of classMembers(dts, true)) {
    const [c, m] = full.split('.');
    if (!classes.has(c)) classes.set(c, []);
    if (!lacking.includes(m)) classes.get(c).push(m);
  }
  const skip = new Set(['default', ...classes.keys(), ...lacking]);
  return (
    [...classes].map(([c, ms]) => `export class ${c} {\n${ms.map((m) => `    ${m}() {}\n`).join('')}}\n`).join('') +
    [...declaredExports(dts)].filter((n) => !skip.has(n)).map((n) => `export function ${n}() {}\n`).join('') +
    'async function init() {}\nexport { init as default };\n'
  );
}
