/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** An edit of a model line whose line the regenerated drawing no longer has is reported once; with the line there, nothing (#189). */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newDraft } from '@/drafting/draft-store';
import { trimCommand } from '@/drafting/commands/edit';
import type { DraftContext, ModelLinePick } from '@/drafting/commands/types';
import { useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';
import { checkSet } from './findings';
import type { CheckInput } from './types';

const GID = '2O2Fr$t4X7Zf8NOew3FNr2';
const pick: ModelLinePick = { globalId: GID, a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
const orphans = (modelLines: CheckInput['modelLines']) => {
  const s = useProjectStore.getState();
  const input: CheckInput = { views: s.views, sheets: [], projectName: '', drafts: s.drafts, planElements: () => [], elementExists: () => true, modelLines };
  return checkSet(input).filter((f) => f.kind === 'orphanedLineEdit');
};

describe('an edit of a model line whose line is gone (#189)', () => {
  beforeEach(() => {
    const boundary = newDraft('v', 'walls', { type: 'line', a: { x: 4, y: -1 }, b: { x: 4, y: 1 } }, {});
    useProjectStore.setState({ views: [{ id: 'v', name: 'Ground floor', kind: 'plan' } as unknown as ProjectView], drafts: [boundary], dirty: false });
    const ctx = {
      viewId: 'v', layerId: 'walls', entities: () => useProjectStore.getState().drafts,
      referenceShapes: () => [{ type: 'line', a: pick.a, b: pick.b }], say: () => undefined,
    } as unknown as DraftContext;
    trimCommand.create(ctx).onPickModelLine?.(pick, { x: 8, y: 0 });
  });

  it('is listed once, pointing at the drafted line, when the regenerated drawing has no such line', () => {
    const found = orphans(() => []);
    assert.equal(found.length, 1);
    assert.equal(found[0].viewId, 'v');
    const drafted = useProjectStore.getState().drafts.find((d) => d.params.replaces !== undefined);
    assert.ok(drafted, 'the edit recorded which model line it replaced');
    assert.equal(found[0].draftId, drafted.id);
  });

  it('is not listed while the line is in the drawing, nor while the view has no drawing', () => {
    assert.deepEqual(orphans(() => [{ globalId: GID, line: { start: pick.a, end: pick.b } }]), []);
    assert.deepEqual(orphans(() => null), []);
  });
});
