/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The golden-sheet benchmark's report (#363): the accepted digest against the
 * regenerated one, one line per changed field, each naming the sheet and the
 * field and what it was and is. A list of strings is compared as a set (a
 * text that moved shows as one removed and one added).
 */

type Leaf = string | number | boolean | null | readonly (string | number)[];

function flatten(value: unknown, path: string, out: Map<string, Leaf>): void {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out);
  } else out.set(path, value as Leaf);
}

const show = (v: Leaf | undefined): string => (v === undefined ? '(absent)' : JSON.stringify(v));

/** Lines naming each difference between `accepted` and `actual`, empty when they agree. Paths read `sheets.A-101.pens.<pen>.width`. */
export function diffDigests(accepted: unknown, actual: unknown): string[] {
  const a = new Map<string, Leaf>();
  const b = new Map<string, Leaf>();
  flatten(accepted, '', a);
  flatten(actual, '', b);
  const lines: string[] = [];
  // A sheet on one side only is one line, not one per field.
  const names = (d: unknown): string[] => Object.keys((d as { sheets?: object }).sheets ?? {});
  const [was, now] = [names(accepted), names(actual)];
  const gone = was.filter((n) => !now.includes(n));
  const fresh = now.filter((n) => !was.includes(n));
  for (const n of gone) lines.push(`sheet ${n}: removed (the accepted set has it, the set no longer makes it)`);
  for (const n of fresh) lines.push(`sheet ${n}: added (the set makes it, the accepted set lacks it)`);
  const lone = (key: string) => [...gone, ...fresh].some((n) => key.startsWith(`sheets.${n}.`));
  for (const key of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    if (lone(key)) continue;
    const [was, is] = [a.get(key), b.get(key)];
    if (JSON.stringify(was) === JSON.stringify(is)) continue;
    const label = key.replace(/^sheets\.([^.]+)\./, 'sheet $1: ').replace(/^figures\./, 'figures: ');
    if (Array.isArray(was) && Array.isArray(is) && was.some((x) => typeof x === 'string')) {
      const [out, added] = [was.filter((x) => !is.includes(x)), is.filter((x) => !was.includes(x))];
      for (const x of out) lines.push(`${label}: removed ${show(x)}`);
      for (const x of added) lines.push(`${label}: added ${show(x)}`);
      if (!out.length && !added.length) lines.push(`${label}: reordered`);
    } else lines.push(`${label}: ${show(was)} -> ${show(is)}`);
  }
  return lines;
}
