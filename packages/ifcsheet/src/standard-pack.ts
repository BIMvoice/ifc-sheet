/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A standards pack (#365): an office's drawing standard as ONE installable library item. It is not a new kind of
 * file. A pack is a `.bvlib` (`standard-pack-file.ts`): the library's own kinds carry what the library already knows
 * how to carry (the graphic standard with its pens, hatch weights and lettering, the text and dimension styles), and a
 * small manifest beside them carries the rest (the title block layout, the units and number format, the numbering
 * scheme) with the pack's name, version and description.
 *
 * Every part is optional and a part a pack does not carry leaves the project's value alone: installing never invents a
 * value. `notSet` names what the pack leaves out on purpose, so the drawer can say so.
 *
 * The pack definitions live in the engine package so the app ("Install standard") and the command line
 * (`ifcsheet build --standard ro`) apply the same one; the app re-exports them.
 */

import { ROMANIAN_PRACTICE } from './graphic-standard.js';
import type { NumberingScheme } from './document.js';
import type { UnitsAndNumbers } from './names.js';
import { TITLE_BLOCK_CAPTIONS_RO, romanianTitleBlock, type RoCaption } from './title-block-ro.js';
import type { TitleBlockTemplate } from './title-block-template.js';

/** The parts of a drawing standard a pack can set. */
export const PACK_PARTS = ['pens', 'titleBlock', 'units', 'numbering'] as const;
export type PackPart = (typeof PACK_PARTS)[number];

/** What a pack leaves to the project on purpose. Hatch patterns, materials and view templates are not parts yet: no built-in standard encodes any. */
export const PACK_NOT_SET = ['numbering', 'lengthUnit', 'decimals', 'hatchPatterns', 'viewTemplates'] as const;
export type PackNotSet = (typeof PACK_NOT_SET)[number];

export const STANDARD_PACK_VERSION = 1;

export interface StandardPack {
  /** Stable; what the project remembers it by. */
  id: string;
  name: string;
  /** The pack's own revision (a changed pack is a new version of the same id). */
  version: number;
  description: string;
  /** A built-in graphic standard by id (`drafting/graphic-standard.ts`): the pens, hatch weights, sheet pens, lettering and the styles. */
  graphicStandard?: string;
  titleBlockTemplate?: TitleBlockTemplate;
  /** Only the fields the pack sets; the project's other fields stay. */
  unitsAndNumbers?: UnitsAndNumbers;
  /** Applied to the sheets made from now on; the sheets already numbered, issued ones included, keep their numbers. */
  sheetNumbering?: NumberingScheme;
  notSet: readonly PackNotSet[];
}

/** The parts a pack sets, in the order the drawer lists them. */
export function packPartsOf(pack: StandardPack): PackPart[] {
  return PACK_PARTS.filter((p) => (p === 'pens' ? pack.graphicStandard !== undefined : p === 'titleBlock' ? pack.titleBlockTemplate !== undefined : p === 'units' ? pack.unitsAndNumbers !== undefined : pack.sheetNumbering !== undefined));
}

export const ROMANIA_PACK_ID = 'ro-stas';

/**
 * "România: STAS / ISO 128". Only values the app already encodes for Romanian practice:
 *  - pens: the Romanian graphic standard (`ROMANIAN_PRACTICE`): ISO 128 line widths, the hatch weights, the sheet's own
 *    pens, ISO 3098 lettering and its text and dimension styles;
 *  - title block: the Romanian layout (`romanianTitleBlock`, #54), drawn with those pens and heights, captions in the
 *    language of `t`;
 *  - units: a comma as the decimal separator. Area is m² and volume m³ in every project already.
 * Left to the project (`notSet`): the numbering scheme (no Romanian one is encoded), the length unit and the decimals,
 * hatch patterns and view templates. They are listed in the pull request as "to verify against STAS".
 */
export function romaniaPack(t: (key: RoCaption) => string): StandardPack {
  return {
    id: ROMANIA_PACK_ID,
    name: 'România: STAS / ISO 128',
    version: STANDARD_PACK_VERSION,
    description: 'Romanian drawing practice on ISO 128 line widths and ISO 3098 lettering: pens and hatch weights, the cartuș, a comma for decimals. Values are the ones IfcSheet already encodes; none is checked against a STAS text.',
    graphicStandard: ROMANIAN_PRACTICE.id,
    titleBlockTemplate: romanianTitleBlock(t, ROMANIAN_PRACTICE),
    unitsAndNumbers: { separator: 'comma' },
    notSet: PACK_NOT_SET,
  };
}

/** The packs that ship with the app. */
export const builtInPacks = (t: (key: RoCaption) => string): StandardPack[] => [romaniaPack(t)];

/** The ids `ifcsheet build --standard` takes, each the pack it applies. */
export const COMMAND_LINE_STANDARDS: Readonly<Record<string, string>> = { ro: ROMANIA_PACK_ID };

/** The ids `--standard` knows, in the order the message lists them. */
export const COMMAND_LINE_STANDARD_IDS: readonly string[] = Object.keys(COMMAND_LINE_STANDARDS);

/**
 * The pack a command-line id names (`ro`; the pack's own id `ro-stas` too), its captions in the language of the standard
 * (Romanian for `ro`), or undefined for an id that is not one.
 */
export function packForCommandLine(id: string): StandardPack | undefined {
  const packId = COMMAND_LINE_STANDARDS[id] ?? (Object.values(COMMAND_LINE_STANDARDS).includes(id) ? id : undefined);
  return packId === ROMANIA_PACK_ID ? romaniaPack((key) => TITLE_BLOCK_CAPTIONS_RO[key]) : undefined;
}
