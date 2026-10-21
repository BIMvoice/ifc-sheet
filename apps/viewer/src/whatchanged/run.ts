/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * WHATCHANGED: after a new version of the model is loaded, what changed on each sheet. The model is
 * compared with the state the project recorded (`modelState`): the first run records one, ACCEPT
 * replaces it. It lists per sheet "A-101: 3 changes" with what changed, and marks what changed in each
 * view with revision clouds on a Revisions layer, drawn as ordinary polylines stamped `revision` so a
 * run replaces the last run's and CLEAR removes them.
 *
 *   WHATCHANGED          compare, list, mark
 *   WHATCHANGED CLEAR    remove the clouds
 *   WHATCHANGED ACCEPT   take the model as it is now as the state to compare with; remove the clouds
 */

import { editDrafts } from '@/drafting/draft-store';
import type { DraftEntity } from '@/drafting/types';
import { resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { paperUnitOf } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { setResult, useWhatChanged } from './baseline';
import { viewBands } from './bands';
import { cloudBoxes, cloudDraft, ensureRevisionsLayer, groupBoxes, REVISIONS_LAYER } from './cloud';
import { latestRevisionId, REVISION_ID_PARAM } from '@/project/revisions';
import { compareStates, type ModelChange } from './compare';
import { currentSnapshot } from './current';
import { renderFrameOffset } from './frame';
import { annotationImpacts } from './impact';
import { sheetChanges } from './report';
import { sheetLines } from './say';
import type { ModelSnapshot } from './snapshot';
import { toRenderFrame, type ViewBand } from './visibility';

export const REVISION_STAMP = 'whatchanged';
export { REVISIONS_LAYER };
export type Mode = 'compare' | 'clear' | 'accept';

const t = (key: string, params: Record<string, string | number> = {}) => resolve(`whatchanged.${key}` as TranslationKey, params);

/** The mode the words after WHATCHANGED mean: nothing, CLEAR or ACCEPT; none for anything else. */
export function parseMode(args: string): Mode | null {
  const arg = args.trim().toLowerCase();
  return arg === '' ? 'compare' : arg === 'clear' ? 'clear' : arg === 'accept' ? 'accept' : null;
}

const isCloud = (d: DraftEntity) => d.params.revision === REVISION_STAMP;

function removeClouds(): number {
  const ids = new Set(useProjectStore.getState().drafts.filter(isCloud).map((d) => d.id));
  if (ids.size > 0) editDrafts({ remove: ids });
  return ids.size;
}

/** What changed between two snapshots, boxes in the render frame the views are drawn in (the snapshots' own are absolute). */
export function compareInRenderFrame(base: ModelSnapshot, head: ModelSnapshot, offset = renderFrameOffset()): ModelChange[] {
  return toRenderFrame(compareStates(base, head), offset);
}

/** At most this many clouds in one view: past it, changes that lie near each other share one. */
export const CLOUD_LIMIT = 100;

/** Revision clouds round each changed element in each view that shows it; `revisionId` is the revision they belong to, when the project has one. */
export function cloudsFor(changes: readonly ModelChange[], bands: readonly ViewBand[], revisionId: string | null = null): DraftEntity[] {
  return bands.flatMap((band) => {
    const unit = paperUnitOf(band.viewId);
    const pad = 1.5 * unit;
    const boxes = cloudBoxes(changes, band).map((r) => ({ x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad }));
    return groupBoxes(boxes, CLOUD_LIMIT).map((rect) => cloudDraft(band.viewId, rect, unit, { revision: REVISION_STAMP, ...(revisionId ? { [REVISION_ID_PARAM]: revisionId } : {}) }));
  });
}

/** True while the models are still being read or drawn: their boxes would be missing. */
function stillLoading(): boolean {
  const s = useViewerStore.getState();
  return s.loading || s.geometryStreamingActive;
}

/** `read` gives the model as it is now (`currentSnapshot`: from the viewer's models). */
export async function runWhatChanged(mode: Mode, say: (text: string) => void, read: () => Promise<ModelSnapshot | null> = currentSnapshot): Promise<void> {
  if (mode === 'clear') {
    const count = removeClouds();
    const last = useWhatChanged.getState().result;
    if (last) setResult({ ...last, clouds: 0 });
    say(t('cleared', { count }));
    return;
  }
  if (stillLoading()) { say(t('loading')); return; }
  const current = await read();
  if (!current) { say(t('noModel')); return; }
  if (mode === 'accept') {
    const removed = removeClouds();
    useProjectStore.setState({ modelState: current, dirty: true });
    setResult(null);
    say(t('accepted', { count: removed }));
    return;
  }
  const reference = useProjectStore.getState().modelState;
  if (!reference) {
    useProjectStore.setState({ modelState: current, dirty: true });
    say(t('noBaseline'));
    return;
  }
  const changes = compareInRenderFrame(reference, current);
  say(t('against', { count: changes.length }));
  const { sheets, views, levels, drafts } = useProjectStore.getState();
  const s = useViewerStore.getState();
  const { bands, unread } = viewBands(views, levels, mergedSectionBounds(s.models, s.geometryResult));
  const report = sheetChanges(sheets, bands, changes, annotationImpacts(drafts.filter((d) => !isCloud(d)), changes));
  const byGuid = new Map(changes.map((c) => [c.guid, c]));
  for (const line of sheetLines(report, (id) => views.find((v) => v.id === id)?.name ?? '', (g) => byGuid.get(g))) say(line);
  // Clouds replace the last run's.
  ensureRevisionsLayer();
  const clouds = cloudsFor(changes, bands, latestRevisionId(useProjectStore.getState()));
  const old = new Set(useProjectStore.getState().drafts.filter(isCloud).map((d) => d.id));
  editDrafts({ remove: old, add: clouds });
  setResult({ changed: changes.length, sheets: report, unread: unread.length, clouds: clouds.length });
  say(t('clouds', { count: clouds.length }));
  if (unread.length > 0) say(t('unread', { count: unread.length }));
}

/** The whole run as the panel and the command line start it: one at a time, and a failure is said, not swallowed. */
export async function runGuarded(mode: Mode, say: (text: string) => void): Promise<void> {
  if (useWhatChanged.getState().running) { say(t('busy')); return; }
  useWhatChanged.setState({ running: true, message: null });
  const sayAndKeep = (text: string): void => {
    if (useWhatChanged.getState().message === null) useWhatChanged.setState({ message: text });
    say(text);
  };
  try {
    await runWhatChanged(mode, sayAndKeep);
  } catch (err: unknown) {
    console.warn('[whatchanged] stopped', err);
    sayAndKeep(t('failed', { reason: err instanceof Error ? err.message : String(err) }));
  } finally {
    useWhatChanged.setState({ running: false });
  }
}
