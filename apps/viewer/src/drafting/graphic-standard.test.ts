/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GRAPHIC_STANDARD, graphicStandardOf, GRAPHIC_STANDARDS, ISO_128_LINE_WIDTHS, ISO_3098_HEIGHTS, ROMANIAN_PRACTICE, knownGraphicStandard, standardValues, stylesUnder,
} from './graphic-standard';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE, STANDARD, type DimStyle, type TextStyle } from './styles';

describe('the Romanian-practice standard draws only from the ISO series', () => {
  // The guard against invented values: every width is a member of the ISO 128 series, every height one of ISO 3098's.
  for (const [role, set, kind] of [['line width', ISO_128_LINE_WIDTHS, 'width'], ['text height', ISO_3098_HEIGHTS, 'height']] as const) {
    it(`every ${role} is in the series`, () => {
      const values = standardValues(ROMANIAN_PRACTICE).filter((v) => v.kind === kind);
      assert.ok(values.length >= (kind === 'width' ? 20 : 8), 'the standard is iterated, not skipped');
      const outside = values.filter((v) => !set.includes(v.value)).map((v) => `${v.role}=${v.value}`);
      assert.deepEqual(outside, []);
    });
  }

  it('the series are the published ones', () => {
    assert.deepEqual([...ISO_128_LINE_WIDTHS], [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2]);
    assert.deepEqual([...ISO_3098_HEIGHTS], [1.8, 2.5, 3.5, 5, 7, 10, 14, 20]);
  });

  it('a thick line is at least twice its thin partner, and the cut line is never thinner than the projection', () => {
    for (const [name, p] of Object.entries(ROMANIAN_PRACTICE.weights)) {
      assert.ok(p.cut >= p.projection, name);
      assert.ok(p.cut / p.projection >= 1.35, `${name}: at least one step of the series apart`);
    }
  });

  it('the default is not held to the series: it is what IfcSheet drew before', () => {
    assert.ok(standardValues(DEFAULT_GRAPHIC_STANDARD).some((v) => !(v.kind === 'width' ? ISO_128_LINE_WIDTHS : ISO_3098_HEIGHTS).includes(v.value)));
  });
});

describe('the registry', () => {
  it('names an unknown or absent id as the default', () => {
    assert.equal(graphicStandardOf(undefined), DEFAULT_GRAPHIC_STANDARD);
    assert.equal(graphicStandardOf('nope'), DEFAULT_GRAPHIC_STANDARD);
    assert.equal(graphicStandardOf('ro-practice'), ROMANIAN_PRACTICE);
    assert.equal(new Set(GRAPHIC_STANDARDS.map((g) => g.id)).size, GRAPHIC_STANDARDS.length);
  });

  it('does not claim certification', () => {
    assert.equal(ROMANIAN_PRACTICE.name, 'Romanian practice (ISO 128 / ISO 3098)');
    assert.doesNotMatch(ROMANIAN_PRACTICE.name, /STAS/, 'no STAS value was checked, so the label does not name it (PR #121 review)');
  });
});

describe('stylesUnder', () => {
  const mine: TextStyle = { id: 'mine', name: 'Mine', height: 4, font: 'serif', bold: false, italic: false };
  // The user's own edits to the Standard styles (PR #121 review: a preset must never overwrite them).
  const myStandard: TextStyle = { ...DEFAULT_TEXT_STYLE, height: 3.5, font: 'serif', bold: true };
  const myDim: DimStyle = { ...DEFAULT_DIM_STYLE, arrow: 'dot', arrowSize: 3 };

  it('adds the standard\'s own named styles after the user\'s, and leaves the user\'s Standard styles as they are', () => {
    const out = stylesUnder(ROMANIAN_PRACTICE, [myStandard, mine], [myDim]);
    assert.deepEqual(out.textStyles, [myStandard, mine, ...ROMANIAN_PRACTICE.textStyles]);
    assert.deepEqual(out.dimStyles, [myDim, ...ROMANIAN_PRACTICE.dimStyles]);
    for (const t of [...ROMANIAN_PRACTICE.textStyles, ...ROMANIAN_PRACTICE.dimStyles]) assert.notEqual(t.id, STANDARD, `${t.name} has its own id`);
  });

  it('round trip default -> preset -> default restores the user\'s styles exactly (PR #121 review)', () => {
    const ro = stylesUnder(ROMANIAN_PRACTICE, [myStandard, mine], [myDim]);
    const back = stylesUnder(DEFAULT_GRAPHIC_STANDARD, ro.textStyles, ro.dimStyles);
    assert.deepEqual(back.textStyles, [myStandard, mine]);
    assert.deepEqual(back.dimStyles, [myDim]);
  });

  it('treats a preset style the user edited as the user\'s: kept on switching back, not overwritten on choosing the preset again', () => {
    const ro = stylesUnder(ROMANIAN_PRACTICE, [DEFAULT_TEXT_STYLE], [DEFAULT_DIM_STYLE]);
    const edited = ro.textStyles.map((t) => (t.id === 'ro-text-35' ? { ...t, height: 5 } : t));
    const back = stylesUnder(DEFAULT_GRAPHIC_STANDARD, edited, ro.dimStyles);
    assert.deepEqual(back.textStyles.map((t) => [t.id, t.height]), [['standard', 2.5], ['ro-text-35', 5]]);
    const again = stylesUnder(ROMANIAN_PRACTICE, back.textStyles, back.dimStyles);
    assert.equal(again.textStyles.find((t) => t.id === 'ro-text-35')?.height, 5);
    assert.equal(new Set(again.textStyles.map((t) => t.id)).size, again.textStyles.length, 'no duplicate ids');
  });

  it('names the styles new annotations take under each standard, and they exist in it', () => {
    assert.deepEqual(DEFAULT_GRAPHIC_STANDARD.current, { textStyle: STANDARD, dimStyle: STANDARD });
    for (const g of GRAPHIC_STANDARDS.filter((x) => x !== DEFAULT_GRAPHIC_STANDARD)) {
      assert.ok(g.textStyles.some((t) => t.id === g.current.textStyle), g.id);
      assert.ok(g.dimStyles.some((d) => d.id === g.current.dimStyle), g.id);
      assert.ok(g.dimStyles.every((d) => g.textStyles.some((t) => t.id === d.textStyle)), `${g.id}: dimension text style is the standard's own`);
    }
  });
});

describe('an id a file names', () => {
  it('is known, absent, or unknown (and then falls back to the default)', () => {
    assert.deepEqual(knownGraphicStandard('ro-practice'), { id: 'ro-practice' });
    assert.deepEqual(knownGraphicStandard('default'), {});
    assert.deepEqual(knownGraphicStandard(undefined), {});
    assert.deepEqual(knownGraphicStandard('from-the-future'), { unknown: 'from-the-future' });
  });
});
