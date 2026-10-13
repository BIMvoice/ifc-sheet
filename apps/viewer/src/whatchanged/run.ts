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
import type { DraftEntity } from '@/drafting/types';
import { resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { paperUnitOf } from '@/project/drafting-standards';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { viewBands } from './bands';
import { cloudRing, groupBoxes } from './cloud';
import { compareStates, type ModelChange } from './compare';
import { currentSnapshot } from './current';
import { annotationImpacts } from './impact';
import { sheetChanges } from './report';
import { sheetLines } from './say';
import type { ModelSnapshot } from './snapshot';
import { changesInView, drawingRect, toRenderFrame, type ViewBand } from './visibility';
import { renderFrameOffset } from '@/draft-set/body';

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

/** What changed between two snapshots, boxes in the render frame the views are drawn in (the snapshots' own are absolute). */
export function compareInRenderFrame(base: ModelSnapshot, head: ModelSnapshot, offset = renderFrameOffset()): ModelChange[] {
  return toRenderFrame(compareStates(base, head), offset);
}

/** At most this many clouds in one view: past it, changes that lie near each other share one. */
export const CLOUD_LIMIT = 100;

/** Revision clouds round each changed element in each view that shows it. */
function cloudsFor(changes: readonly ModelChange[], bands: readonly ViewBand[]): DraftEntity[] {
  const out: DraftEntity[] = [];
  for (const band of bands) {
    if (!band.plane) continue;
    const unit = paperUnitOf(band.viewId);
    const pad = 1.5 * unit;
    const boxes = changesInView(changes, band).flatMap((c) => {
      const box = c.after ?? c.before;
      if (!box) return [];
      const r = drawingRect(box, band.plane!);
      return [{ x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad }];
    });
    for (const rect of groupBoxes(boxes, CLOUD_LIMIT)) {
      out.push(newDraft(band.viewId, REVISIONS_LAYER, { type: 'polyline', pts: cloudRing(rect, 2 * unit), closed: true }, { revision: REVISION_STAMP }));
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
  const changes = compareInRenderFrame(baseline.snapshot, current);
  say(baseline.line(changes.length));
  const { sheets, views, levels, drafts } = useProjectStore.getState();
  const s = useViewerStore.getState();
  const { bands, unread } = viewBands(views, levels, mergedSectionBounds(s.models, s.geometryResult));
  const report = sheetChanges(sheets, bands, changes, annotationImpacts(drafts.filter((d) => !isCloud(d)), changes));
  const byGuid = new Map(changes.map((c) => [c.guid, c]));
  for (const line of sheetLines(report, (id) => views.find((v) => v.id === id)?.name ?? '', (g) => byGuid.get(g))) say(line);
  // Clouds replace the last run's.
  ensureLayer();
  const clouds = cloudsFor(changes, bands);
  const old = new Set(useProjectStore.getState().drafts.filter(isCloud).map((d) => d.id));
  editDrafts({ remove: old, add: clouds });
  say(t('clouds', { count: clouds.length }));
  if (unread.length > 0) say(t('unread', { count: unread.length }));
}

/** WHATCHANGED with the text after its name: nothing, CLEAR or ACCEPT. The lines arrive as the model is read. */
export function runWhatChangedCommand(args: string, say: (key: TranslationKey, params: Record<string, string | number>) => void): void {
  const line = (text: string) => say('whatchanged.msg.line' as TranslationKey, { text });
  const mode = parseWhatChanged(`WHATCHANGED ${args}`);
  if (!mode) { line(t('usage', { arg: args })); return; }
  void runWhatChanged(mode, line).catch((err: unknown) => line(t('failed', { reason: err instanceof Error ? err.message : String(err) })));
}
