/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The `.ifclite-project.json` sidecar: a project's views and sheets, saved
 * next to the IFC files it refers to (by content hash, else by name). The
 * IFC files themselves are never written. Parsing validates every view so a
 * hand-edited or truncated file fails loudly instead of half-loading.
 */

import { downloadFile, sanitizeFilename } from '@/lib/export/download.js';
import { declaredVersion, migrateProject, PROJECT_FILE_VERSION, PROJECT_MIGRATIONS, type ProjectMigration } from './project-migrations';
import { withoutModelState } from './autosave-snapshots';
import { markProjectSaved } from './project-saved';
import { loadProjectDocument, projectDocument } from './project-store';
import { fail, isObject } from './project-read';
import { readDocumentFields } from './fields';
import type { ProjectDocument } from './types';
import { isJoineryDraftViewId } from '@/joinery/view-draft-id';

export const PROJECT_FILE_SUFFIX = '.ifclite-project.json';
export const PROJECT_FILE_FORMAT = 'ifclite-project';
export { PROJECT_FILE_VERSION };
export { readMaterial } from '@bimvoice/ifcsheet/materials';

export interface ProjectFile extends ProjectDocument {
  format: typeof PROJECT_FILE_FORMAT;
  version: typeof PROJECT_FILE_VERSION;
  savedAt: string;
}

export function serializeProject(doc: ProjectDocument, now = new Date()): string {
  // The working copy of a joinery type's drafted view (#492) is not saved: the type holds the shapes.
  const drafts = doc.drafts?.some((d) => isJoineryDraftViewId(d.viewId)) ? doc.drafts.filter((d) => !isJoineryDraftViewId(d.viewId)) : doc.drafts;
  const file: ProjectFile = { format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, savedAt: now.toISOString(), ...doc, drafts };
  return JSON.stringify(file, null, 2);
}

/**
 * Open a project file the person chose: load it and note it as the last file opened, so its own
 * autosave is not offered back next session. Autosave restores load with `loadProjectDocument`
 * directly. Kept out of the store so the drafting session does not reach the file reader.
 */
export function openProjectDocument(doc: ProjectDocument, options: { dirty?: boolean; now?: number; storage?: Parameters<typeof markProjectSaved>[2] } = {}): void {
  loadProjectDocument(doc, { dirty: options.dirty });
  noteProjectFile(projectDocument(), options.now, options.storage);
}

export function exportProjectFile(doc: ProjectDocument): void {
  const stem = sanitizeFilename(doc.name, { fallback: 'project' });
  downloadFile(serializeProject(doc), `${stem}${PROJECT_FILE_SUFFIX}`, 'application/json');
  noteProjectFile(doc);
}

/**
 * Notes `doc` as what a project file holds now (`project-saved.ts`). The autosave is compared to it in the
 * form a file is read back in, so it is noted in that form: the reader fills defaults a live project lacks.
 */
export function noteProjectFile(doc: ProjectDocument, now?: number, storage?: Parameters<typeof markProjectSaved>[2]): void {
  markProjectSaved(parseProjectFile(serializeProject(withoutModelState(doc).slim)), now, storage);
}

/** The versions a reader brings files to: this build's, unless a test stands in a later one. */
export interface ProjectFileSchema {
  migrations: Readonly<Record<number, ProjectMigration>>;
  current: number;
}

const THIS_BUILD: ProjectFileSchema = { migrations: PROJECT_MIGRATIONS, current: PROJECT_FILE_VERSION };

/** Parse and validate a project file's text. Throws with the first problem found. */
export function parseProjectFile(text: string, schema: ProjectFileSchema = THIS_BUILD): ProjectDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not a project file: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!isObject(parsed) || parsed.format !== PROJECT_FILE_FORMAT) fail('/format', `must be "${PROJECT_FILE_FORMAT}"`);
  const version = declaredVersion(parsed);
  if (version === null) fail('/version', 'must be a whole number from 1');
  // Older files are brought up to this build's shape first; a newer one throws here, before anything is read.
  const raw = migrateProject(parsed, version, schema.migrations, schema.current);
  return readDocumentFields(raw);
}

export async function importProjectFile(file: File): Promise<ProjectDocument> {
  return parseProjectFile(await file.text());
}
