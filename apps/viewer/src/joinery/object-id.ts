/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A number that stands for an object's identity: distinct objects get distinct
 * numbers, so a memo key that includes it changes whenever the object is
 * replaced (a collab room refresh swaps a model's data store under the same
 * model id).
 */

const ids = new WeakMap<object, number>();
let nextId = 1;

export const idOf = (o: object): number => {
  let id = ids.get(o);
  if (id === undefined) { id = nextId++; ids.set(o, id); }
  return id;
};
