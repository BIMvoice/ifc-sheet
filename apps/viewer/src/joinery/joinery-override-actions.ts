/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Typing over a cell of a joinery schedule from the sheet (#446): the project keeps the text by the type's identity and the row, and the type's
 * cell prints it in every joinery schedule. The rules are the engine's (`joinery-overrides.ts`); these write the result to the project, each
 * edit as one undo step (`joineryOverrides` is one of the whole fields a step keeps).
 */

import { clearJoineryOverride, dropJoineryOverrides, setJoineryOverride, type TypeFacts } from '@bimvoice/ifcsheet';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { useProjectStore } from '@/project/project-store';

const write = (overrides: ReturnType<typeof clearJoineryOverride>): void => {
  useProjectStore.setState({ joineryOverrides: overrides.length ? overrides : undefined, dirty: true });
};

/** The type's cell in `row` prints `value` in every joinery schedule (`about`: what the type is called). One undo step. */
export function setJoineryCellOverride(type: TypeFacts, row: string, value: string, about: string): void {
  runAsOneUndoStep(() => write(setJoineryOverride(useProjectStore.getState().joineryOverrides, type, row, value, about)));
}

/** The cell prints the model's text again ("Reset to model value"). One undo step. */
export function resetJoineryCellOverride(type: TypeFacts, row: string): void {
  runAsOneUndoStep(() => write(clearJoineryOverride(useProjectStore.getState().joineryOverrides, type, row)));
}

/** Drop every override of the types `types` (identities, the ones no longer in the model). One undo step. */
export function dropJoineryOverridesOf(types: readonly string[]): void {
  runAsOneUndoStep(() => write(dropJoineryOverrides(useProjectStore.getState().joineryOverrides, types)));
}
