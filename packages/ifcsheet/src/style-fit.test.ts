/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { DEFAULT_DIM_STYLE } from './draft-styles.js';
import { DEFAULT_TEXT_STYLE } from './draft-look.js';
import { paperUnitFor, styleBookOf, styledParamsIn } from './style-fit.js';

describe('style fit (#707)', () => {
  it('falls back to the default styles when the project has none', () => {
    expect(styleBookOf(undefined, [])).toEqual({ textStyles: [DEFAULT_TEXT_STYLE], dimStyles: [DEFAULT_DIM_STYLE] });
  });

  it('takes 1 on a sheet, scale / 1000 on a view and 0.1 on an unknown id', () => {
    const views = [{ id: 'v', scale: 50 }];
    expect(paperUnitFor('s', [{ id: 's' }], views)).toBe(1);
    expect(paperUnitFor('v', [{ id: 's' }], views)).toBe(0.05);
    expect(paperUnitFor('x', [], views)).toBe(0.1);
  });

  it('keeps the style height without an override and overrides a different one in paper mm', () => {
    const book = styleBookOf(undefined, undefined);
    const current = { textStyle: DEFAULT_TEXT_STYLE.id, dimStyle: DEFAULT_DIM_STYLE.id };
    const text = (height: number) => ({ type: 'text' as const, p: { x: 0, y: 0 }, text: 't', height, rotation: 0 });
    const unit = 0.1;
    expect(styledParamsIn(book, unit, text(DEFAULT_TEXT_STYLE.height * unit), current)).toEqual({ textStyle: current.textStyle });
    expect(styledParamsIn(book, unit, text(5 * unit), current)).toEqual({ textStyle: current.textStyle, 'o.height': 5 });
  });
});
