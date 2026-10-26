/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * EXPORT IFC WITH ANNOTATIONS (#82): a copy of each open IFC, as loaded, with the drawing set's annotations written into it by the
 * engine (`@bimvoice/ifcsheet/annotated-ifc`). The copy is made from the bytes the model was opened from (like the handover's IFC,
 * not the edited export), so it carries the annotations and nothing the person has not exported on purpose; the file that was opened
 * is never written. The names and numbers it says are catalogue keys, worded by the panel.
 */

import { zipSync } from 'fflate';
import { federationFrameInfo, renderFrameWorldOffset } from '@ifc-lite/geometry/world-frame';
import type { AnnotatedIfcResult } from '@bimvoice/ifcsheet/annotated-ifc';
import { downloadFile, sanitizeFilename, stripExtension } from '@/lib/export/download';
import { getLocale, resolve } from '@/i18n/registry';
import type { TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { collectAnnotations } from './annotated-ifc-collect';

export interface AnnotatedIfcFile { name: string; bytes: Uint8Array }

export interface AnnotatedIfcRun {
  files: AnnotatedIfcFile[];
  lines: { key: TranslationKey; params: Record<string, string | number> }[];
  /** Set when the whole run was written (not "nothing to write"). */
  done: boolean;
}

export async function runAnnotatedIfc(): Promise<AnnotatedIfcRun> {
  const lines: AnnotatedIfcRun['lines'] = [];
  const say = (key: TranslationKey, params: Record<string, string | number> = {}) => lines.push({ key, params });
  const viewer = useViewerStore.getState();
  const models = [...viewer.models.values()].filter((m) => m.ifcDataStore);
  if (models.length === 0) { say('annotatedIfc.msg.noModel'); return { files: [], lines, done: false }; }

  const project = useProjectStore.getState();
  const frame = renderFrameWorldOffset(federationFrameInfo(viewer.models.values(), viewer.geometryResult));
  const collected = collectAnnotations(project, frame, getLocale());
  for (const l of collected.leftOut) say('annotatedIfc.msg.viewLeftOut', { view: l.name, kind: resolve(`annotatedIfc.kind.${l.kind}` as TranslationKey) });
  if (collected.hatches > 0) say('annotatedIfc.msg.hatches', { count: collected.hatches });
  if (collected.views.length === 0) { say('annotatedIfc.msg.nothing'); return { files: [], lines, done: false }; }

  const { buildAnnotatedIfc } = await import('@bimvoice/ifcsheet/annotated-ifc');
  const files: AnnotatedIfcFile[] = [];
  const written = new Set<string>();
  const found = new Set<string>();
  const unplaced = new Map<string, string>();
  const used = new Set<string>();
  for (const model of models) {
    const stem = sanitizeFilename(stripExtension(model.name), { fallback: 'model' });
    let name = `${stem} annotated.ifc`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} annotated (${n}).ifc`;
    let result: AnnotatedIfcResult;
    try {
      // materialize(): the bytes as loaded; the engine parses a copy of them and never writes to them.
      result = await buildAnnotatedIfc({ source: model.ifcDataStore!.source.materialize(), views: collected.views, marks: collected.marks, leftOut: [], fileName: name });
    } catch (error) {
      say('annotatedIfc.msg.failed', { model: model.name, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    for (const a of result.annotations) written.add(a.viewId);
    for (const m of result.marks) if (m.state !== 'noElement') found.add(m.globalId);
    for (const n of result.notes) {
      if (n.key === 'storeyFrame') say('annotatedIfc.msg.storeyFrame', { view: String(n.params.view), model: model.name });
    }
    if (result.annotations.length === 0 && result.marked.length === 0) continue;
    used.add(name.toLowerCase());
    files.push({ name, bytes: result.bytes });
    say('annotatedIfc.msg.done', { model: model.name, views: result.annotations.length, marks: result.marked.length, name });
  }
  for (const v of collected.views) if (!written.has(v.viewId) && !lines.some((l) => l.key === 'annotatedIfc.msg.storeyFrame' && l.params.view === v.name)) unplaced.set(v.viewId, v.name);
  for (const name of unplaced.values()) say('annotatedIfc.msg.noStorey', { view: name });
  const missing = collected.marks.filter((m) => !found.has(m.globalId)).length;
  if (missing > 0 && files.length > 0) say('annotatedIfc.msg.marksMissing', { count: missing });
  return { files, lines, done: files.length > 0 };
}

/** Hand the files over: one IFC as it is, several as one ZIP. */
export function deliverAnnotatedIfc(run: AnnotatedIfcRun): string | null {
  if (run.files.length === 0) return null;
  if (run.files.length === 1) {
    downloadFile(run.files[0].bytes, run.files[0].name, 'application/x-step');
    return run.files[0].name;
  }
  const zipName = `${sanitizeFilename(resolve('annotatedIfc.action'), { fallback: 'annotated' })}.zip`;
  downloadFile(zipSync(Object.fromEntries(run.files.map((f) => [f.name, f.bytes]))), zipName, 'application/zip');
  return zipName;
}
