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
 */

import type { TranslationKey } from '@/i18n';
import { ROMANIAN_PRACTICE } from '@/drafting/graphic-standard';
import type { NumberingScheme } from '@/project/types';
import { romanianTitleBlock } from '@/project/title-block-ro';
import type { TitleBlockTemplate } from '@/project/title-block-template';
import type { UnitsAndNumbers } from '@bimvoice/ifcsheet';

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
export function partsOf(pack: StandardPack): PackPart[] {
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
export function romaniaPack(t: (key: TranslationKey) => string): StandardPack {
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
export const builtInPacks = (t: (key: TranslationKey) => string): StandardPack[] => [romaniaPack(t)];
