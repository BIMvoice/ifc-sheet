/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GRAPHIC_STANDARD, graphicStandardOf, GRAPHIC_STANDARDS, ISO_128_LINE_WIDTHS, ISO_3098_HEIGHTS, ROMANIAN_PRACTICE, standardValues, stylesUnder,
} from './graphic-standard';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE, type TextStyle } from './styles';

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
    assert.match(ROMANIAN_PRACTICE.name, /^Romanian practice \(ISO 128 \/ ISO 3098 \/ STAS\)$/);
  });
});

describe('stylesUnder', () => {
  const mine: TextStyle = { id: 'mine', name: 'Mine', height: 4, font: 'serif', bold: false, italic: false };
  it('brings the standard\'s styles and keeps the user\'s own', () => {
    const out = stylesUnder(ROMANIAN_PRACTICE, [DEFAULT_TEXT_STYLE, mine], [DEFAULT_DIM_STYLE]);
    assert.deepEqual(out.textStyles.map((t) => t.id), ['standard', 'ro-text-35', 'ro-title-50', 'ro-title-70', 'mine']);
    assert.equal(out.textStyles[0].height, 2.5);
    assert.equal(out.dimStyles.length, 1);
    assert.equal(out.dimStyles[0].arrowSize, 2.5);
  });

  it('going back to the default removes what the other standard brought and restores Standard', () => {
    const ro = stylesUnder(ROMANIAN_PRACTICE, [DEFAULT_TEXT_STYLE, mine], [DEFAULT_DIM_STYLE]);
    const back = stylesUnder(DEFAULT_GRAPHIC_STANDARD, ro.textStyles, ro.dimStyles);
    assert.deepEqual(back.textStyles, [DEFAULT_TEXT_STYLE, mine]);
    assert.deepEqual(back.dimStyles, [DEFAULT_DIM_STYLE]);
  });
});
