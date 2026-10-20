/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The FZK-Haus with phases, made from the FZK-Haus sample when a test loads it, so the
 * repo carries no second copy of the model: `Pset_WallCommon.Status` set on some
 * ground-floor walls (FZK-Haus itself carries no Status). Per listed wall one
 * IfcPropertyEnumeratedValue (Name 'Status', no Description, one IfcLabel) is appended
 * before ENDSEC, with a fresh id after the sample's last, and added to the wall's own
 * Pset_WallCommon (a new set where the wall has none). Walls not listed get no Status.
 * Deterministic: the same sample gives the same file, and the same express ids. The header's
 * FILE_DESCRIPTION gains a first entry saying the file was modified, and how.
 *
 * Base model: AC20-FZK-Haus.ifc, the FZK-Haus exported from ARCHICAD 20 (FILE_NAME dated
 * 2016-12-21), from the KIT IFC Examples published by the Institute for Automation and Applied
 * Informatics (IAI), Karlsruhe Institute of Technology (KIT), on ifcwiki.org. Terms there: the
 * examples are "for unrestricted use"; publications cite "Institute for Automation and Applied
 * Informatics (IAI) / Karlsruhe Institute of Technology (KIT)". The repo does not carry it: it is
 * `ara3d/AC20-FZK-Haus.ifc` in `tests/models/manifest.json`, fetched by `pnpm fixtures`.
 */

/** The first FILE_DESCRIPTION entry of the made file, marking it as modified. */
export const MODIFIED_NOTE = 'Modified for ifcsheet tests from AC20-FZK-Haus.ifc (IAI / KIT): Pset_WallCommon.Status added on five walls';

/** Wall name in the sample -> Status. Wand-Ext-ERDG-4 is deliberately left out: no Status. */
export const PHASE_STATUS = {
  'Wand-Ext-ERDG-1': 'EXISTING',
  'Wand-Ext-ERDG-2': 'EXISTING',
  'Wand-Ext-ERDG-3': 'EXISTING',
  'Wand-Int-ERDG-1': 'DEMOLISH',
  'Wand-Int-ERDG-2': 'NEW',
} as const;

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** The sample's STEP text (latin1) with the Status properties added. */
export function withPhaseStatus(text: string): string {
  const idOf = (name: string): number => {
    const m = new RegExp(`^#(\\d+)= IFCWALLSTANDARDCASE\\('[^']*',#\\d+,'${name}'`, 'm').exec(text);
    if (!m) throw new Error(`wall ${name} not found`);
    return Number(m[1]);
  };
  let next = 1;
  for (const m of text.matchAll(/^#(\d+)=/gm)) next = Math.max(next, Number(m[1]) + 1);
  const owner = /^#(\d+)= IFCOWNERHISTORY/m.exec(text)?.[1];
  if (!owner) throw new Error('no IfcOwnerHistory in the sample');
  let seed = 0x9e3779b1;
  const guid = (): string => {
    let out = '';
    for (let i = 0; i < 22; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      out += ALPHABET[(seed >>> 24) % (i === 0 ? 4 : 64)];
    }
    return out;
  };
  const lines: string[] = [];
  let out = text;
  for (const [name, status] of Object.entries(PHASE_STATUS)) {
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
      out = out.replace(set, (_, head: string, props: string, tail: string) => `${head}${props},#${value}${tail}`);
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
  if (!/FILE_DESCRIPTION\(\(/.test(out)) throw new Error('no FILE_DESCRIPTION in the sample');
  out = out.replace(/FILE_DESCRIPTION\(\(/, `FILE_DESCRIPTION(('${MODIFIED_NOTE}',`);
  const at = out.lastIndexOf('ENDSEC;');
  return `${out.slice(0, at)}${lines.join('\n')}\n${out.slice(at)}`;
}
