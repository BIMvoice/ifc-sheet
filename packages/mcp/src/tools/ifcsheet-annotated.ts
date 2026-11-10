/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The annotated copy of the IFC for `ifcsheet_issue_set` with `annotated_ifc` (#165, from #82/#326): the engine's
 * `@bimvoice/ifcsheet/annotated-ifc` run over the IFC as it was opened.
 *
 * The annotations of a set are its drafts (dimensions, tags, notes), and those belong to the app: the project document the tools hold
 * has none, and turning a draft into IFC shapes needs the app's frame and view code. So the copy written here carries no annotations
 * and the result says so, with how many drafts a loaded project held that were not written. It is still the engine's own output,
 * the source's STEP lines followed by nothing new, in the file's schema.
 */

import type { AnnotatedSheet, AnnotatedView } from '@bimvoice/ifcsheet/annotated-ifc';
import { asciiStem } from '@bimvoice/ifcsheet/handover';
import type { SheetGraphic } from '@bimvoice/ifcsheet/headless';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import type { SheetSetEntry } from './ifcsheet-store.js';

export interface AnnotatedCopy {
  name: string;
  bytes: Uint8Array;
  /** The SVG files the copy's drawing and sheet references name (#548), at their paths relative to the IFC. */
  files: { path: string; text: string }[];
  /** What the result says about the copy, once it is written as `file`. */
  report(file: { file: string; bytes: number }): Record<string, unknown>;
}

/**
 * The set's plan views and sheets as the Bonsai drawings and sheets of the copy (#548), each with its SVG from the sheets as drawn
 * (`exportSvg`, the same graphics as the PDF). A plan view that is on no sheet has no SVG to write. Elevations and sections need
 * a camera from the model's extent, which the headless set does not hold yet: they are not written.
 */
export async function bonsaiInput(entry: SheetSetEntry, drawn: readonly SheetGraphic[]): Promise<{ views: AnnotatedView[]; sheets: AnnotatedSheet[] }> {
  const { exportSvg } = await import('@bimvoice/ifcsheet/headless');
  const doc = entry.set.document;
  const onSheet = (viewId: string): SheetGraphic | undefined => drawn.find((g) => g.viewports.some((v) => v.viewId === viewId));
  const views: AnnotatedView[] = [];
  for (const v of doc.views) {
    if (v.kind !== 'plan' || v.level.storeyGlobalIds.length === 0) continue;
    const graphic = onSheet(v.id);
    views.push({
      viewId: v.id, name: v.name, scale: v.scale ?? 100, storeyGlobalIds: v.level.storeyGlobalIds, cutHeight: v.cutHeight, viewDepth: v.viewDepth ?? undefined,
      curves: [], texts: [], ...(graphic ? { svg: exportSvg(graphic, { viewId: v.id }) } : {}),
    });
  }
  const sheets: AnnotatedSheet[] = doc.sheets.flatMap((s) => {
    const viewIds = [...new Set((s.viewports ?? []).map((vp) => vp.viewId))].filter((id) => views.some((v) => v.viewId === id));
    const graphic = drawn.find((g) => g.sheetId === s.id);
    return viewIds.length === 0 ? [] : [{ name: s.name, identification: s.number, viewIds, ...(graphic ? { svg: exportSvg(graphic) } : {}) }];
  });
  return { views, sheets };
}

export async function annotatedCopy(entry: SheetSetEntry, drawn: readonly SheetGraphic[]): Promise<AnnotatedCopy> {
  const stem = entry.model.name.replace(/\.ifc$/i, '');
  const name = `${asciiStem(stem) || 'model'}.annotated.ifc`;
  const { buildAnnotatedIfc } = await import('@bimvoice/ifcsheet/annotated-ifc');
  let built;
  try {
    built = await buildAnnotatedIfc({ source: entry.model.bytes, ...(await bonsaiInput(entry, drawn)), fileName: name });
  } catch (err) {
    throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: `The annotated IFC cannot be made for '${entry.model.name}': ${(err as Error).message}. Nothing was written.` });
  }
  const drafts = (entry.set.document as { drafts?: unknown }).drafts;
  const skipped = Array.isArray(drafts) ? drafts.length : 0;
  return {
    name,
    bytes: built.bytes,
    files: built.files,
    report: (file) => ({
      file: file.file,
      bytes: file.bytes,
      schema: built.schema,
      annotations: built.annotations.length,
      marks: built.marked.length,
      drafts_not_written: skipped,
      drawings: built.drawings.length,
      sheets: built.sheets.length,
      svg_files: built.files.map((f) => f.path),
      warnings: built.warnings,
      note:
        `The drawing-set tools hold no drafts, so this copy has no annotations written into it (the app writes dimensions, tags and notes from its drafts)` +
        `${skipped > 0 ? `; the loaded project holds ${skipped} draft${skipped === 1 ? '' : 's'}, which are not converted here` : ''}. The opened IFC was not written to.`,
    }),
  };
}
