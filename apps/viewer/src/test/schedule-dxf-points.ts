/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Reads a sheet's DXF back for the schedule tests (#186): where the schedule's own entities lie. */

/** The points of the entities on the schedule's layers (group codes 10/20 and 11/21 pairs, as the DXF has them). */
export function schedulePoints(dxf: string): { x: number; y: number }[] {
  const lines = dxf.slice(dxf.indexOf('ENTITIES') + 'ENTITIES'.length).split(/\r?\n/).slice(1);
  const out: { x: number; y: number }[] = [];
  let layer = '', pending: { x: number; y: number }[] = [];
  const lastX: Record<string, number> = {};
  const flush = () => { if (/^SCHEDULE/.test(layer)) out.push(...pending); layer = ''; pending = []; };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim(), value = Number(lines[i + 1]);
    if (code === '0') flush();
    else if (code === '8') layer = lines[i + 1].trim();
    else if (code === '10' || code === '11') lastX[code] = value;
    else if (code === '20' || code === '21') pending.push({ x: lastX[code === '20' ? '10' : '11'], y: value });
  }
  flush();
  return out;
}
