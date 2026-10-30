/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';
import { CLASS_WORDS_RO as word } from '@bimvoice/ifcsheet';

/**
 * Romanian (#602): the names of IFC classes in the tool names, the bulk editor's class list and the model-element kinds, as
 * `drafting.en.ts` and `bulk-property-editor.en.ts` say them. The words are the engine's own (`class-words.ts`), the ones the
 * quantities by type and the takeoff print, so a tool and the table it makes call a class the same thing; a test compares the two.
 * Term choices: `../ro-glossary.md`.
 */
export const ifcClassRo = {
  'drafting.bim.wall': word.Wall,
  'drafting.bim.slab': word.Slab,
  'drafting.bim.column': word.Column,
  'drafting.bim.beam': word.Beam,
  'drafting.bim.door': word.Door,
  'drafting.bim.window': word.Window,
  'drafting.bim.opening': word.OpeningElement,
  'drafting.bim.stair': word.Stair,
  'drafting.bim.railing': word.Railing,
  'drafting.bim.curtainWall': word.CurtainWall,
  'drafting.bim.roof': word.Roof,
  'drafting.bim.room': word.Space,
  'drafting.bim.kind.wall': 'Pereți',
  'drafting.bim.kind.beam': 'Grinzi',
  'drafting.bim.kind.railing': word.Railing,
  'drafting.bim.kind.slab': word.Slab,
  'drafting.bim.kind.roof': 'Sistem de acoperiș',
  'drafting.bim.kind.extrude': 'Extrudare',
  'bulkPropertyEditor.type.wall': word.Wall,
  'bulkPropertyEditor.type.wallStandard': `${word.WallStandardCase} (standard)`,
  'bulkPropertyEditor.type.door': word.Door,
  'bulkPropertyEditor.type.window': word.Window,
  'bulkPropertyEditor.type.slab': word.Slab,
  'bulkPropertyEditor.type.column': word.Column,
  'bulkPropertyEditor.type.beam': word.Beam,
  'bulkPropertyEditor.type.roof': word.Roof,
  'bulkPropertyEditor.type.stair': word.Stair,
  'bulkPropertyEditor.type.railing': word.Railing,
  'bulkPropertyEditor.type.curtainWall': word.CurtainWall,
  'bulkPropertyEditor.type.covering': word.Covering,
  'bulkPropertyEditor.type.plate': word.Plate,
  'bulkPropertyEditor.type.member': word.Member,
  'bulkPropertyEditor.type.furniture': word.Furniture,
  'bulkPropertyEditor.type.proxy': word.BuildingElementProxy,
  'bulkPropertyEditor.type.space': word.Space,
  'bulkPropertyEditor.type.opening': word.OpeningElement,
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
