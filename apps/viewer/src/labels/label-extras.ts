/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a label may carry for a model that does not say enough: a running
 * number for an element with neither Tag nor Name (`numbered`), and an area
 * taken from the room's footprint for a room with no area quantity
 * (`computedArea`, square metres, read in a template as `{Computed.Area}`).
 * A door or window carries the code of its kind (`markCode`). All are stamped on the label and used only where the model gives nothing,
 * so the label still follows the model the moment it does.
 */

import type { DraftParamValue } from '@/drafting/types';
import { resolveTemplate, type LabelElement } from './label-resolve';
import type { ParsedTemplate } from './label-template';
import type { MissingMode } from './label-resolve';

/** A model's mark is short enough to stand on a plan as it is up to this many characters. */
export const MAX_MARK_LENGTH = 6;

export interface LabelExtras {
  numbered?: number;
  computedArea?: number;
  /** The code of a door's or window's kind (`tagall/mark-codes.ts`) and the kind it stands for: shown where the model gives no short mark. */
  markCode?: string;
  markKey?: string;
}

export const COMPUTED_SET = 'Computed';
export const COMPUTED_AREA = 'Area';

export function extrasOf(params: Readonly<Record<string, DraftParamValue>>): LabelExtras {
  return {
    ...(typeof params.numbered === 'number' ? { numbered: params.numbered } : {}),
    ...(typeof params.computedArea === 'number' ? { computedArea: params.computedArea } : {}),
    ...(typeof params.markCode === 'string' ? { markCode: params.markCode } : {}),
    ...(typeof params.markKey === 'string' ? { markKey: params.markKey } : {}),
  };
}

function withComputedArea(el: LabelElement, area: number): LabelElement {
  return { ...el, quantitySets: () => [...el.quantitySets(), { name: COMPUTED_SET, quantities: [{ name: COMPUTED_AREA, value: area }] }] };
}

/** The text of a label for `el`: the template read from the element, else (where it comes out empty) the running number. */
export function resolveWithExtras(template: ParsedTemplate, el: LabelElement, missing: MissingMode, extras: LabelExtras = {}): string {
  if (extras.markCode !== undefined) {
    // The model's own mark wins the moment it gives a short one; its Name, however long, does not.
    const own = String(el.attribute('Mark') ?? '').trim();
    return own !== '' && own.length <= MAX_MARK_LENGTH ? own : extras.markCode;
  }
  const text = resolveTemplate(template, extras.computedArea === undefined ? el : withComputedArea(el, extras.computedArea), missing);
  return text === '' && extras.numbered !== undefined ? String(extras.numbered) : text;
}
