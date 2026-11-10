/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The project's own symbols as the engine reads them (#479): the app's reader, in the engine, with the app's messages. */

import { describe, expect, it } from 'vitest';
import { readProjectSet } from './project-set.js';
import { readSymbol } from './symbol-read.js';

const line = { type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } };

describe('reading a symbol', () => {
  it('reads its shapes and defaults its unit to paper', () => {
    expect(readSymbol({ id: 's', name: 'S', shapes: [line] }, '/symbols/0')).toEqual({ id: 's', name: 'S', unit: 'paper', shapes: [line] });
    expect(readSymbol({ id: 's', name: 'S', unit: 'model', shapes: [] }, '/symbols/0').unit).toBe('model');
  });

  it('refuses what the app refuses, in its words and for the kind of file read', () => {
    expect(() => readSymbol({ id: 's', name: ' ', shapes: [] }, '/symbols/0')).toThrow('Not a project file: /symbols/0 must be a symbol { id, name, shapes }');
    expect(() => readSymbol({ id: 's', name: 'S' }, '/symbols/0', 'catalogue file')).toThrow('Not a catalogue file: /symbols/0.shapes must be an array');
    expect(() => readSymbol({ id: 's', name: 'S', shapes: [{ type: 'hatch' }] }, '/symbols/0')).toThrow();
  });

  it("a project's set holds its symbols, none when the file has none", () => {
    expect(readProjectSet({ symbols: [{ id: 's', name: 'S', shapes: [line] }] }).symbols.map((s) => s.id)).toEqual(['s']);
    expect(readProjectSet({}).symbols).toEqual([]);
  });
});
