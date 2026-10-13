/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * WHATCHANGED: after a new version of the model is loaded, what changed on each
 * sheet. The model is compared with the last issue that recorded it, else with
 * the state the project recorded earlier (`WHATCHANGED ACCEPT` records one; the
 * first run does when there is none). It prints per sheet "A-101: 3 changes" with
 * the list, and marks what changed in each view with revision clouds on a
 * Revisions layer, drawn as ordinary polylines stamped `revision` so a run
 * replaces the last run's and `WHATCHANGED CLEAR` removes them.
 *
 *   WHATCHANGED          compare, list, mark
 *   WHATCHANGED CLEAR    remove the clouds
 *   WHATCHANGED ACCEPT   take the model as it is now as the state to compare with; remove the clouds
 */

import { newDraft, editDrafts } from '@/drafting/draft-store';
import { worldToDrawing } from '@/drafting/frame';
import type { DraftEntity } from '@/drafting/types';
import { resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { paperUnitOf } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { viewPlaneConfig } from '@/project/view-plane-config';
import { useViewerStore } from '@/store';
import { viewBands } from './bands';
import { cloudRing } from './cloud';
import { compareStates, type ModelChange } from './compare';
import { currentSnapshot } from './current';
import { annotationImpacts } from './impact';
import { sheetChanges } from './report';
import { sheetLines } from './say';
import type { ModelSnapshot } from './snapshot';
import { changesInView } from './visibility';

export const REVISION_STAMP = 'whatchanged';
export const REVISIONS_LAYER = 'revisions';
type Mode = 'compare' | 'clear' | 'accept';

const t = (key: string, params: Record<string, string | number> = {}) => resolve(`whatchanged.${key}` as TranslationKey, params);

export function parseWhatChanged(text: string): Mode | null {
  const m = /^WHATCHANGED(?:\s+(\w+))?\s*$/i.exec(text.trim());
  if (!m) return null;
  const arg = (m[1] ?? '').toLowerCase();
  return arg === '' ? 'compare' : arg === 'clear' ? 'clear' : arg === 'accept' ? 'accept' : null;
}

const isCloud = (d: DraftEntity) => d.params.revision === REVISION_STAMP;

function removeClouds(): number {
  const ids = new Set(useProjectStore.getState().drafts.filter(isCloud).map((d) => d.id));
  if (ids.size > 0) editDrafts({ remove: ids });
  return ids.size;
}

function ensureLayer(): void {
  const { draftLayers } = useProjectStore.getState();
  if (!draftLayers.some((l) => l.id === REVISIONS_LAYER)) useProjectStore.setState({ draftLayers: [...draftLayers, { id: REVISIONS_LAYER, name: t('layer'), color: '#dc2626', visible: true, locked: false }], dirty: true });
}

/** The state to compare with and a line saying what it is: the last issue that recorded the model, else the project's own record. */
export function baselineOf(): { snapshot: ModelSnapshot; line: (count: number) => string } | null {
  const { issues, modelState } = useProjectStore.getState();
  const issue = [...(issues ?? [])].reverse().find((i) => i.model);
  if (issue?.model) return { snapshot: issue.model, line: (count) => t('against.issue', { name: issue.name, date: issue.date, count }) };
  return modelState ? { snapshot: modelState, line: (count) => t('against.loaded', { count }) } : null;
}

/** Revision clouds round each changed element in each view that shows it. */
function cloudsFor(changes: readonly ModelChange[]): DraftEntity[] {
  const s = useViewerStore.getState();
  const { views, levels } = useProjectStore.getState();
  const bounds = mergedSectionBounds(s.models, s.geometryResult);
  const out: DraftEntity[] = [];
  for (const band of viewBands(views, levels, bounds)) {
    const view = views.find((v) => v.id === band.viewId);
    const plane = view ? viewPlaneConfig(view.detail ? views.find((o) => o.id === view.detail!.of) ?? view : view, levels, bounds) : null;
    if (!view || !plane) continue;
    const unit = paperUnitOf(view.id);
    for (const c of changesInView(changes, band)) {
      const box = c.after ?? c.before;
      if (!box) continue;
      const pts = [0, 3].flatMap((x) => [1, 4].flatMap((y) => [2, 5].map((z) => worldToDrawing(plane, { x: box[x], y: box[y], z: box[z] }))));
      const pad = 1.5 * unit;
      const rect = { x0: Math.min(...pts.map((p) => p.x)) - pad, y0: Math.min(...pts.map((p) => p.y)) - pad, x1: Math.max(...pts.map((p) => p.x)) + pad, y1: Math.max(...pts.map((p) => p.y)) + pad };
      out.push(newDraft(view.id, REVISIONS_LAYER, { type: 'polyline', pts: cloudRing(rect, 2 * unit), closed: true }, { revision: REVISION_STAMP, revisionOf: c.guid }));
    }
  }
  return out;
}

export async function runWhatChanged(mode: Mode, say: (text: string) => void): Promise<void> {
  if (mode === 'clear') { say(t('cleared', { count: removeClouds() })); return; }
  const current = await currentSnapshot();
  if (!current) { say(t('noModel')); return; }
  if (mode === 'accept') {
    const removed = removeClouds();
    useProjectStore.setState({ modelState: current, dirty: true });
    say(t('accepted', { count: removed }));
    return;
  }
  const baseline = baselineOf();
  if (!baseline) {
    useProjectStore.setState({ modelState: current, dirty: true });
    say(t('noBaseline'));
    return;
  }
  const changes = compareStates(baseline.snapshot, current);
  say(baseline.line(changes.length));
  const { sheets, views, levels, drafts } = useProjectStore.getState();
  const s = useViewerStore.getState();
  const bands = viewBands(views, levels, mergedSectionBounds(s.models, s.geometryResult));
  const report = sheetChanges(sheets, bands, changes, annotationImpacts(drafts.filter((d) => !isCloud(d)), changes));
  const byGuid = new Map(changes.map((c) => [c.guid, c]));
  for (const line of sheetLines(report, (id) => views.find((v) => v.id === id)?.name ?? '', (g) => byGuid.get(g))) say(line);
  // Clouds replace the last run's.
  ensureLayer();
  const clouds = cloudsFor(changes);
  const old = new Set(useProjectStore.getState().drafts.filter(isCloud).map((d) => d.id));
  editDrafts({ remove: old, add: clouds });
  say(t('clouds', { count: clouds.length }));
}

/** WHATCHANGED with the text after its name: nothing, CLEAR or ACCEPT. The lines arrive as the model is read. */
export function runWhatChangedCommand(args: string, say: (key: TranslationKey, params: Record<string, string | number>) => void): void {
  const line = (text: string) => say('whatchanged.msg.line' as TranslationKey, { text });
  const mode = parseWhatChanged(`WHATCHANGED ${args}`);
  if (!mode) { line(t('usage', { arg: args })); return; }
  void runWhatChanged(mode, line).catch((err: unknown) => line(t('failed', { reason: err instanceof Error ? err.message : String(err) })));
}
