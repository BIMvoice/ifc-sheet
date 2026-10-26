/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model as an issue went out (#335), so the next issue can list the sheets a change in the model reaches.
 *
 * WHAT IS KEPT. The issue record keeps a reference (`ProjectIssue.model`: a fingerprint of the model state, its
 * size and time); the state itself is What changed's own snapshot (`whatchanged/snapshot.ts`), kept with the
 * project's `modelState` as `modelState.issued`: for the LAST issue only (only the last is ever compared with),
 * and not at all when it is the reference itself. So the record stays a few dozen bytes however big the model is.
 *
 * WHAT IS COMPARED. The model as it is now against the model as issued, never against the reference (which
 * moves when the user accepts a version): by What changed's own comparison (`compareInRenderFrame`) and its
 * per-sheet answer (`sheetImpact`). A sheet is changed by the model when that answer finds changes on it.
 */

import { useProjectStore } from '@/project/project-store';
import { cyrb53 } from '@/project/sheet-fingerprint';
import { useViewerStore } from '@/store';
import { currentSnapshot } from '@/whatchanged/current';
import { compareInRenderFrame, sheetImpact } from '@/whatchanged/run';
import type { ModelChange } from '@/whatchanged/compare';
import type { ModelSnapshot, SnapshotBody } from '@/whatchanged/snapshot';
import type { IssuedModel, ProjectIssue } from './types';

/**
 * What the model says about the sheets going out, against the last issue.
 *   `compared`  the models were compared;
 *   `unknown`   the last issue did not record the model (or its state is gone): not listed, and said;
 *   `noModel`   the last issue recorded one and none is loaded now (or it is still loading): not listed, and said;
 *   `none`      nothing to compare and nothing to say (no earlier issue, or a project with no model at all).
 */
export type ModelFindings =
  | { status: 'compared'; changes: ModelChange[] }
  | { status: 'unknown' | 'noModel' | 'none' };

/** What `issueChanges` takes: the findings as the sheets they reach. `pending`: still being read. */
export type ModelImpact =
  | { status: 'compared'; sheetIds: ReadonlySet<string> }
  | { status: 'unknown' | 'noModel' | 'none' | 'pending' };

const hashes = new WeakMap<SnapshotBody, string>();

/** A fingerprint of the elements of a state (not of when it was taken). */
export function stateHash(state: SnapshotBody): string {
  let h = hashes.get(state);
  if (!h) { h = cyrb53(state.rows); hashes.set(state, h); }
  return h;
}

export function modelRecord(state: SnapshotBody): IssuedModel {
  return { hash: stateHash(state), count: state.count, takenAt: state.takenAt };
}

/** Whether a model is in the viewer, even if still being read. */
export function modelPresent(): boolean {
  return useViewerStore.getState().models.size > 0;
}

/** The model as it is now; null while there is none or it is still being read or drawn (its boxes would be missing). */
export async function readModel(read: () => Promise<ModelSnapshot | null> = currentSnapshot): Promise<ModelSnapshot | null> {
  const s = useViewerStore.getState();
  if (s.models.size === 0 || s.loading || s.geometryStreamingActive) return null;
  try {
    return await read();
  } catch (err) {
    // A model that cannot be read must not stop the set from being issued: the model's part is then left out, and said.
    console.warn('[issue] the model could not be read for the issue', err);
    return null;
  }
}

/** The model as `previous` went out, from where the project keeps it; null when it is not the one the record refers to. */
export function issuedState(previous: Pick<ProjectIssue, 'id' | 'model'>, reference = useProjectStore.getState().modelState): SnapshotBody | null {
  const issued = reference?.issued;
  if (!previous.model || !reference || !issued || issued.issueId !== previous.id) return null;
  const { issued: _own, ...body } = reference;
  const state = issued.state ?? body;
  return stateHash(state) === previous.model.hash ? state : null;
}

/** The model now against the model as `previous` went out. `current` is `readModel()`'s. */
export function modelFindings(previous: Pick<ProjectIssue, 'id' | 'model'> | undefined, current: SnapshotBody | null): ModelFindings {
  if (!previous) return { status: 'none' };
  if (!previous.model) return { status: modelPresent() ? 'unknown' : 'none' };
  const was = issuedState(previous);
  if (!was) return { status: 'unknown' };
  if (!current) return { status: 'noModel' };
  return { status: 'compared', changes: compareInRenderFrame(was, current) };
}

/** The findings as the sheets they reach, by the project as it is now. */
export function modelImpact(findings: ModelFindings): ModelImpact {
  if (findings.status !== 'compared') return { status: findings.status };
  return { status: 'compared', sheetIds: new Set(sheetImpact(findings.changes).report.filter((s) => s.count > 0).map((s) => s.sheetId)) };
}

/**
 * The model state with the model of issue `issueId` riding on it: the reference when there is one (the model as
 * it is, recorded as the reference, when the project has none yet, as the first What changed run does).
 */
export function withIssuedModel(reference: ModelSnapshot | undefined, current: SnapshotBody, issueId: string): ModelSnapshot {
  const { issued: _old, ...base } = (reference ?? current) as ModelSnapshot;
  return { ...base, issued: stateHash(base) === stateHash(current) ? { issueId } : { issueId, state: { takenAt: current.takenAt, count: current.count, rows: current.rows } } };
}
