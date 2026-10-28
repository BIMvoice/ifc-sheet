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

import { asciiStem } from '@bimvoice/ifcsheet/handover';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import type { SheetSetEntry } from './ifcsheet-store.js';

export interface AnnotatedCopy {
  name: string;
  bytes: Uint8Array;
  /** What the result says about the copy, once it is written as `file`. */
  report(file: { file: string; bytes: number }): Record<string, unknown>;
}

export async function annotatedCopy(entry: SheetSetEntry): Promise<AnnotatedCopy> {
  const stem = entry.model.name.replace(/\.ifc$/i, '');
  const name = `${asciiStem(stem) || 'model'}.annotated.ifc`;
  const { buildAnnotatedIfc } = await import('@bimvoice/ifcsheet/annotated-ifc');
  let built;
  try {
    built = await buildAnnotatedIfc({ source: entry.model.bytes, views: [], fileName: name });
  } catch (err) {
    throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: `The annotated IFC cannot be made for '${entry.model.name}': ${(err as Error).message}. Nothing was written.` });
  }
  const drafts = (entry.set.document as { drafts?: unknown }).drafts;
  const skipped = Array.isArray(drafts) ? drafts.length : 0;
  return {
    name,
    bytes: built.bytes,
    report: (file) => ({
      file: file.file,
      bytes: file.bytes,
      schema: built.schema,
      annotations: built.annotations.length,
      marks: built.marked.length,
      drafts_not_written: skipped,
      warnings: built.warnings,
      note:
        `The drawing-set tools hold no drafts, so this copy has no annotations written into it (the app writes dimensions, tags and notes from its drafts)` +
        `${skipped > 0 ? `; the loaded project holds ${skipped} draft${skipped === 1 ? '' : 's'}, which are not converted here` : ''}. The opened IFC was not written to.`,
    }),
  };
}
