/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading a project's own symbols (`symbols` in the project file, and in a catalogue file): the one reader the app's file and
 * catalogue readers and the engine's `readProjectSet` share, so a symbol the app opens is read the same here.
 */

import { readShape } from './draft-read.js';
import { isObject, isString } from './set-read.js';
import type { DraftSymbol, SymbolShape } from './symbols.js';

/** Fails with the path, in the words of the file kind read (`what`). */
function fail(path: string, message: string, what: string): never {
  throw new Error(`Not a ${what}: ${path} ${message}`);
}

/** One symbol of a file. `what` names the kind of file in the message (default `project file`). */
export function readSymbol(v: unknown, path: string, what = 'project file'): DraftSymbol {
  if (!isObject(v) || !isString(v.id) || !isString(v.name) || !v.name.trim()) fail(path, 'must be a symbol { id, name, shapes }', what);
  if (!Array.isArray(v.shapes)) fail(`${path}.shapes`, 'must be an array', what);
  const shapes = v.shapes.map((s, i): SymbolShape => {
    const shape = readShape(s, `${path}.shapes/${i}`);
    if (shape.type === 'line' || shape.type === 'polyline' || shape.type === 'circle' || shape.type === 'arc' || shape.type === 'text') return shape;
    return fail(`${path}.shapes/${i}.type`, 'must be a line, polyline, circle, arc or text', what);
  });
  return { id: v.id, name: v.name, unit: v.unit === 'model' ? 'model' : 'paper', shapes };
}
