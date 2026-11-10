/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** The project drawer's "Drawing standard" section: standards packs (#365). */
export const standardsPacksEn = {
  'standards.pack.title': 'Drawing standard',
  'standards.pack.intro': 'Install an office drawing standard in one step. One undo takes all of it back, and "Reset" returns the project to its own values.',
  'standards.pack.ro-stas.description': 'Romanian drawing practice on ISO 128 line widths and ISO 3098 lettering: pens and hatch weights, the cartuș, a comma for decimals, material hatches by Romanian names, the default sheet numbering. These are the values IfcSheet already encodes; none is checked against a STAS text yet.',
  'standards.pack.de-din.description': 'German drawing practice on ISO 128 line widths and ISO 3098 lettering: pens and hatch weights, a title block with German captions, a comma for decimals, material hatches by German names, the default sheet numbering. These are the values IfcSheet can name an ISO source for; none is checked against DIN 1356-1 yet.',
  'standards.pack.part.pens': 'Pens, hatch weights and lettering',
  'standards.pack.part.titleBlock': 'Title block',
  'standards.pack.part.units': 'Number format',
  'standards.pack.part.numbering': 'Sheet numbering',
  'standards.pack.part.hatches': 'Material hatches',
  'standards.pack.notSet': 'Left as the project has it: {list}',
  'standards.pack.notSet.lengthUnit': 'length unit',
  'standards.pack.notSet.decimals': 'decimals',
  'standards.pack.notSet.viewTemplates': 'view templates',
  'standards.pack.install': 'Install standard',
  'standards.pack.applied': 'Installed',
  'standards.pack.current': 'Installed standard: {name}',
  'standards.pack.reset': 'Reset to previous values',
  'standards.pack.export': 'Save as .bvlib',
  'standards.pack.fromFile': 'Install from file...',
  'standards.pack.fromFile.label': 'Standards pack file',
  'standards.pack.refused': 'Not installed: {reason}',
} as const satisfies Record<string, TranslationValue>;
