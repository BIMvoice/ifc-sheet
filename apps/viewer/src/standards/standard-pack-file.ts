/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A standards pack as a `.bvlib` file (#365). The file is a library file the library already reads, written by the
 * library's own writer: the graphic standard's id and its text and dimension styles are the library's `graphicStandard`,
 * `textStyles` and `dimStyles`. The pack's own part is one more key, `standardPack`, that the library reader ignores
 * (so importing a pack through "Import library" brings the styles and the pens, and "Install standard" brings all of it):
 * name, version, description, the title block layout, the units and number format, the numbering scheme.
 *
 * Read strictly, like the library: a file that is not a pack, or one that names a graphic standard this app does not
 * have, is refused with the reason and installs nothing.
 */

import { builtInLibrary } from '@/catalogue/catalogue-store';
import { emptyCatalogue, parseCatalogue, serializeCatalogue } from '@/catalogue/catalogue-file';
import { knownGraphicStandard } from '@/drafting/graphic-standard';
import { readNumberingScheme } from '@/project/numbering';
import { readTitleBlockTemplate } from '@/project/title-block-file';
import { readUnitsAndNumbers } from '@bimvoice/ifcsheet';
import { PACK_NOT_SET, partsOf, type PackNotSet, type StandardPack } from './standard-pack';

export const STANDARD_PACK_KEY = 'standardPack';

/** The pack as `.bvlib` text. */
export function serializeStandardPack(pack: StandardPack, now = new Date()): string {
  const catalogue = pack.graphicStandard !== undefined ? builtInLibrary(pack.graphicStandard).catalogue : emptyCatalogue();
  const file = JSON.parse(serializeCatalogue(catalogue, pack.name, now)) as Record<string, unknown>;
  file[STANDARD_PACK_KEY] = {
    id: pack.id, version: pack.version, description: pack.description, parts: partsOf(pack), notSet: pack.notSet,
    ...(pack.titleBlockTemplate ? { titleBlockTemplate: pack.titleBlockTemplate } : {}),
    ...(pack.unitsAndNumbers ? { unitsAndNumbers: pack.unitsAndNumbers } : {}),
    ...(pack.sheetNumbering ? { sheetNumbering: pack.sheetNumbering } : {}),
  };
  return JSON.stringify(file, null, 2);
}

const refuse = (reason: string): never => { throw new Error(`Not a standards pack: ${reason}`); };

/** Read a pack out of `.bvlib` text. Throws, installing nothing, when the file is not a pack. */
export function parseStandardPack(text: string): StandardPack {
  const { name, catalogue } = parseCatalogue(text);
  const raw = (JSON.parse(text) as Record<string, unknown>)[STANDARD_PACK_KEY];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return refuse(`"${STANDARD_PACK_KEY}" is missing`);
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || m.id.trim() === '') return refuse('the pack has no id');
  if (typeof m.version !== 'number' || !Number.isInteger(m.version) || m.version < 1) return refuse('the pack has no version');
  let graphicStandard: string | undefined;
  if (catalogue.graphicStandard !== undefined) {
    const known = knownGraphicStandard(catalogue.graphicStandard);
    if (known.unknown) return refuse(`the graphic standard "${known.unknown}" is not in this version of the app`);
    graphicStandard = known.id ?? catalogue.graphicStandard;
  }
  const titleBlockTemplate = m.titleBlockTemplate === undefined ? undefined : readTitleBlockTemplate(m.titleBlockTemplate) ?? refuse('the title block layout is not readable');
  const unitsAndNumbers = m.unitsAndNumbers === undefined ? undefined : readUnitsAndNumbers(m.unitsAndNumbers) ?? refuse('the units and number format are not readable');
  const sheetNumbering = m.sheetNumbering === undefined ? undefined : readNumberingScheme(m.sheetNumbering) ?? refuse('the numbering scheme is not readable');
  const notSet = Array.isArray(m.notSet) ? m.notSet.filter((v): v is PackNotSet => (PACK_NOT_SET as readonly unknown[]).includes(v)) : [];
  return {
    id: m.id, name, version: m.version, description: typeof m.description === 'string' ? m.description : '', notSet,
    ...(graphicStandard !== undefined ? { graphicStandard } : {}),
    ...(titleBlockTemplate ? { titleBlockTemplate } : {}),
    ...(unitsAndNumbers ? { unitsAndNumbers } : {}),
    ...(sheetNumbering ? { sheetNumbering } : {}),
  };
}
