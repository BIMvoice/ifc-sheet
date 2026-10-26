/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a label may carry for a model that does not say enough: a running
 * number for an element with neither Tag nor Name (`numbered`), and an area
 * taken from the room's footprint for a room with no area quantity
 * (`computedArea`, square metres, read in a template as `{Computed.Area}`).
 * Both are stamped on the label and used only where the model gives nothing,
 * so the label still follows the model the moment it does.
 */

import type { DraftParamValue } from '@/drafting/types';
import { resolveTemplate, type LabelElement } from './label-resolve';
import type { ParsedTemplate } from './label-template';
import type { MissingMode } from './label-resolve';
import type { SheetLocale } from '@bimvoice/ifcsheet/names';

export interface LabelExtras {
  numbered?: number;
  computedArea?: number;
}

export const COMPUTED_SET = 'Computed';
export const COMPUTED_AREA = 'Area';

export function extrasOf(params: Readonly<Record<string, DraftParamValue>>): LabelExtras {
  return {
    ...(typeof params.numbered === 'number' ? { numbered: params.numbered } : {}),
    ...(typeof params.computedArea === 'number' ? { computedArea: params.computedArea } : {}),
  };
}

function withComputedArea(el: LabelElement, area: number): LabelElement {
  return { ...el, quantitySets: () => [...el.quantitySets(), { name: COMPUTED_SET, quantities: [{ name: COMPUTED_AREA, value: area }] }] };
}

/** The text of a label for `el`: the template read from the element, else (where it comes out empty) the running number. */
export function resolveWithExtras(template: ParsedTemplate, el: LabelElement, locale: SheetLocale, missing: MissingMode, extras: LabelExtras = {}): string {
  const text = resolveTemplate(template, extras.computedArea === undefined ? el : withComputedArea(el, extras.computedArea), locale, missing);
  // A room without a number leaves its first line empty: a label does not start with a blank line.
  const shown = text.replace(/^\s*\n/, '');
  return shown === '' && extras.numbered !== undefined ? String(extras.numbered) : shown;
}
