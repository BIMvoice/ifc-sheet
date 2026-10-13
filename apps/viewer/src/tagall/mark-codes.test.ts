/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The codes of doors and windows: the model's short mark, else one code per kind, the same every time. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assignMarkCodes, type MarkSubject } from './mark-codes.js';

const s = (guid: string, className: string, over: Partial<MarkSubject> = {}): MarkSubject => ({ guid, className, mark: '', typeName: '', name: guid, width: 1, ...over });

describe('mark codes', () => {
  it('keeps a short mark and codes the rest by kind, windows and doors apart', () => {
    const codes = assignMarkCodes([
      s('a', 'IfcWindow', { typeName: 'Fixed', width: 1.2 }), s('b', 'IfcWindow', { typeName: 'Fixed', width: 1.2 }),
      s('c', 'IfcWindow', { typeName: 'Casement', width: 0.9 }), s('d', 'IfcDoor', { typeName: 'Single', width: 0.9 }), s('e', 'IfcDoor', { mark: 'T-04' }),
    ]);
    assert.deepEqual([...codes].map(([g, c]) => `${g}:${c.code}`), ['e:T-04', 'a:W2', 'b:W2', 'c:W1', 'd:D1']);
  });
  it('is the same whatever order the elements come in', () => {
    const list = [s('a', 'IfcWindow', { typeName: 'Z' }), s('b', 'IfcWindow', { typeName: 'A' }), s('c', 'IfcDoor', { typeName: 'M' })];
    const one = assignMarkCodes(list), two = assignMarkCodes([...list].reverse());
    for (const g of ['a', 'b', 'c']) assert.equal(one.get(g)?.code, two.get(g)?.code);
  });
  it('without a type, windows named alike share a code but not when their width differs', () => {
    const codes = assignMarkCodes([s('a', 'IfcWindow', { name: 'EG-Fenster-1' }), s('b', 'IfcWindow', { name: 'EG-Fenster-2' }), s('c', 'IfcWindow', { name: 'EG-Fenster-3', width: 2 })]);
    assert.equal(codes.get('a')?.code, codes.get('b')?.code);
    assert.notEqual(codes.get('a')?.code, codes.get('c')?.code);
  });
  it('a long mark and a unique id are not marks', () => {
    const codes = assignMarkCodes([s('a', 'IfcDoor', { mark: 'Entrance door north' }), s('b', 'IfcDoor', { mark: '' })]);
    assert.equal(codes.get('a')?.code, 'D1');
  });
  it('keeps the codes it was given and numbers a new kind after the highest', () => {
    const first = assignMarkCodes([s('a', 'IfcWindow', { typeName: 'M' })]);
    const known = new Map([[first.get('a')!.key!, first.get('a')!.code]]);
    const next = assignMarkCodes([s('a', 'IfcWindow', { typeName: 'M' }), s('b', 'IfcWindow', { typeName: 'A' })], known);
    assert.equal(next.get('a')?.code, 'W1');
    assert.equal(next.get('b')?.code, 'W2');
  });
  it('does not give a code an element\'s own mark already uses', () => {
    const codes = assignMarkCodes([s('a', 'IfcWindow', { mark: 'W1' }), s('b', 'IfcWindow', { typeName: 'X' })]);
    assert.equal(codes.get('b')?.code, 'W2');
  });
  it('does not give a kind a mark that stands for something else: a catalogue type\'s, or another element\'s own', () => {
    const codes = assignMarkCodes([s('a', 'IfcWindow', { typeName: 'X' }), s('b', 'IfcDoor', { typeName: 'Y' })], new Map(), ['W1', 'W2', 'D1']);
    assert.equal(codes.get('a')?.code, 'W3');
    assert.equal(codes.get('b')?.code, 'D2');
  });
});
