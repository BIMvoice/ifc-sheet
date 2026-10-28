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

import { GERMAN_PRACTICE, ROMANIAN_PRACTICE } from './graphic-standard.js';
import type { NumberingScheme } from './document.js';
import type { ProjectMaterial } from './materials.js';
import { DEFAULT_SCHEME } from './numbering.js';
import { GERMAN_MATERIALS, ROMANIAN_MATERIALS } from './standard-pack-materials.js';
import type { UnitsAndNumbers } from './names.js';
import { TITLE_BLOCK_CAPTIONS_RO, romanianTitleBlock, type RoCaption } from './title-block-ro.js';
import { standardTitleBlock, type StandardCaption } from './title-block-standard.js';
import type { TitleBlockTemplate } from './title-block-template.js';

/** The parts of a drawing standard a pack can set. */
export const PACK_PARTS = ['pens', 'titleBlock', 'units', 'numbering', 'hatches'] as const;
export type PackPart = (typeof PACK_PARTS)[number];

/** What a pack leaves to the project on purpose: no built-in standard encodes a length unit, the decimals or view templates. */
export const PACK_NOT_SET = ['lengthUnit', 'decimals', 'viewTemplates'] as const;
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
  /** The material hatch rules (#90): which hatch each named material draws with where a view cuts it. A row replaces the project's row of the same name; the project's other rows stay. */
  materials?: readonly ProjectMaterial[];
  notSet: readonly PackNotSet[];
}

/** The parts a pack sets, in the order the drawer lists them. */
export function packPartsOf(pack: StandardPack): PackPart[] {
  const has: Record<PackPart, boolean> = {
    pens: pack.graphicStandard !== undefined, titleBlock: pack.titleBlockTemplate !== undefined, units: pack.unitsAndNumbers !== undefined,
    numbering: pack.sheetNumbering !== undefined, hatches: pack.materials !== undefined,
  };
  return PACK_PARTS.filter((p) => has[p]);
}

/**
 * The numbering scheme of both packs: A-001 general, A-101 plans, A-201 elevations, A-301 sections... (`DEFAULT_SCHEME`).
 * NO standard prescribes it: STAS, ISO 128 and DIN 1356-1 name no sheet numbering pattern, and the Romanian permit text
 * (Anexa 2) numbers no sheet. So the pack's value is the project's current default, stated outright: installing sets it
 * explicitly (the sheets made from now on, and a project's own scheme is put back by reset) but invents no "standard"
 * pattern. The discipline letter A (arhitectură / Architektur) is the same in both languages.
 */
const packNumbering = (): NumberingScheme => structuredClone(DEFAULT_SCHEME);

export const ROMANIA_PACK_ID = 'ro-stas';

/**
 * "România: STAS / ISO 128". Only values the app already encodes for Romanian practice:
 *  - pens: the Romanian graphic standard (`ROMANIAN_PRACTICE`): ISO 128 line widths, the hatch weights, the sheet's own
 *    pens, ISO 3098 lettering and its text and dimension styles;
 *  - title block: the Romanian layout (`romanianTitleBlock`, #54), drawn with those pens and heights, captions in the
 *    language of `t`;
 *  - units: a comma as the decimal separator. Area is m² and volume m³ in every project already.
 *  - numbering: the default scheme, stated (`packNumbering`: no standard prescribes one);
 *  - hatches: the material rows of `ROMANIAN_MATERIALS`, by Romanian names (patterns unverified against STAS).
 * Left to the project (`notSet`): the length unit, the decimals and view templates.
 */
export function romaniaPack(t: (key: RoCaption) => string): StandardPack {
  return {
    id: ROMANIA_PACK_ID,
    name: 'România: STAS / ISO 128',
    version: STANDARD_PACK_VERSION,
    description: 'Romanian drawing practice on ISO 128 line widths and ISO 3098 lettering: pens and hatch weights, the cartuș, a comma for decimals, material hatches by Romanian names, the default sheet numbering. Values are the ones IfcSheet already encodes; none is checked against a STAS text.',
    graphicStandard: ROMANIAN_PRACTICE.id,
    titleBlockTemplate: romanianTitleBlock(t, ROMANIAN_PRACTICE),
    unitsAndNumbers: { separator: 'comma' },
    sheetNumbering: packNumbering(),
    materials: ROMANIAN_MATERIALS(ROMANIA_PACK_ID),
    notSet: PACK_NOT_SET,
  };
}

export const GERMANY_PACK_ID = 'de-din';

/**
 * The title block's captions of the German pack: German practice names no title block layout (MBauVorlV § 3(3) only
 * requires that the Bauvorlagen state their Entwurfsverfasser), so the pack uses the standard layout with German words.
 * The pack is German, so these are its own data and do not follow the interface language.
 */
export const TITLE_BLOCK_CAPTIONS_DE: Record<StandardCaption, string> = {
  'sheets.tb.project': 'Bauvorhaben',
  'sheets.tb.address': 'Baugrundstück',
  'sheets.tb.client': 'Bauherr',
  'sheets.tb.organisation': 'Entwurfsverfasser',
  'sheets.tb.title': 'Planinhalt',
  'sheets.tb.drawnBy': 'Gezeichnet',
  'sheets.tb.checkedBy': 'Geprüft',
  'sheets.tb.date': 'Datum',
  'sheets.tb.revision': 'Index',
  'sheets.tb.number': 'Plan-Nr.',
  'sheets.tb.scale': 'Maßstab',
};

/**
 * "German practice (ISO 128 line series)". Only values IfcSheet can name a source for:
 *  - pens: the German graphic standard (`GERMAN_PRACTICE`): ISO 128 line widths and ISO 3098 lettering (the DIN EN ISO
 *    editions), the 0.5 line group; none checked against DIN 1356-1;
 *  - title block: the standard layout with German captions, the organisation field captioned Entwurfsverfasser;
 *  - units: a comma as the decimal separator (German usage; no DIN text was consulted).
 *  - numbering: the default scheme, stated (`packNumbering`: no standard prescribes one);
 *  - hatches: the material rows of `GERMAN_MATERIALS`, by German names (patterns unverified against DIN 1356-1).
 * Left to the project (`notSet`): length unit, decimals and view templates. The date format
 * (tt.mm.jjjj) is not a pack part: dates print as the project stores them.
 */
export function germanyPack(): StandardPack {
  return {
    id: GERMANY_PACK_ID,
    name: 'German practice (ISO 128 line series)',
    version: STANDARD_PACK_VERSION,
    description: 'German drawing practice on ISO 128 line widths and ISO 3098 lettering: pens and hatch weights, a title block with German captions, a comma for decimals, material hatches by German names, the default sheet numbering. Values are the ones IfcSheet can name an ISO source for; none is checked against DIN 1356-1.',
    graphicStandard: GERMAN_PRACTICE.id,
    titleBlockTemplate: standardTitleBlock((key) => TITLE_BLOCK_CAPTIONS_DE[key], GERMAN_PRACTICE),
    unitsAndNumbers: { separator: 'comma' },
    sheetNumbering: packNumbering(),
    materials: GERMAN_MATERIALS(GERMANY_PACK_ID),
    notSet: PACK_NOT_SET,
  };
}

/** The packs that ship with the app. */
export const builtInPacks = (t: (key: RoCaption) => string): StandardPack[] => [romaniaPack(t), germanyPack()];

/** The ids `ifcsheet build --standard` takes, each the pack it applies. */
export const COMMAND_LINE_STANDARDS: Readonly<Record<string, string>> = { ro: ROMANIA_PACK_ID, de: GERMANY_PACK_ID };

/** The ids `--standard` knows, in the order the message lists them. */
export const COMMAND_LINE_STANDARD_IDS: readonly string[] = Object.keys(COMMAND_LINE_STANDARDS);

/**
 * The pack a command-line id names (`ro`, `de`; the pack's own id `ro-stas`, `de-din` too), its captions in the language of the standard
 * (Romanian for `ro`, German for `de`), or undefined for an id that is not one.
 */
export function packForCommandLine(id: string): StandardPack | undefined {
  const packId = COMMAND_LINE_STANDARDS[id] ?? (Object.values(COMMAND_LINE_STANDARDS).includes(id) ? id : undefined);
  return packId === ROMANIA_PACK_ID ? romaniaPack((key) => TITLE_BLOCK_CAPTIONS_RO[key]) : packId === GERMANY_PACK_ID ? germanyPack() : undefined;
}
