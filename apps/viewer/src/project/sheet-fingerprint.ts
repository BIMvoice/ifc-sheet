/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A content fingerprint of a sheet: the sheet itself, the views, schedules,
 * legends and road drawings placed on it, the drafted shapes on the sheet
 * and on those views, and where the views its plans' cross-reference marks
 * name are drawn (another sheet's number reprints those marks). Two issues carrying the same fingerprint for a sheet
 * mean the sheet was not edited in between. It does not see the model: a
 * changed model with an unchanged project gives the same fingerprint.
 * Pure; the hash is 53-bit (cyrb53), written as 14 hex digits.
 */

import type { DraftEntity } from '@/drafting/types';
import { viewReference, type ViewReference } from '@/drafting/cross-ref';
import { viewsNamedOnPlan } from '@/drafting/cross-ref-marks';
import { sheetRevisions } from './revisions';
import type { ProjectDocument, ProjectRevision, ProjectSheet, ProjectView } from './types';

/** What a sheet's content is looked up in. */
export interface FingerprintSources {
  /** Views, schedules, legends and road drawings: anything a viewport's `viewId` can name. */
  documents: readonly { id: string; createdAt?: unknown }[];
  drafts: readonly DraftEntity[];
  /** The project's views and sheets: what the cross-reference marks on the sheet's plans are read from. */
  views: readonly ProjectView[];
  sheets: readonly Pick<ProjectSheet, 'number' | 'viewports'>[];
  /** The project's revisions: what the sheet's table and title block print comes from them. */
  revisions?: readonly ProjectRevision[];
}

/** JSON with object keys in order, so equal values give equal text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function cyrb53(text: string): string {
  let h1 = 0xdeadbeef; let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export function sheetFingerprint(sheet: ProjectSheet, sources: FingerprintSources): string {
  const ids = new Set([sheet.id, ...(sheet.viewports ?? []).map((v) => v.viewId)]);
  const documents = sources.documents.filter((d) => ids.has(d.id)).sort((a, b) => a.id.localeCompare(b.id)).map(({ createdAt: _c, ...rest }: { id: string; createdAt?: unknown }) => rest);
  const drafts = sources.drafts.filter((d) => ids.has(d.viewId)).sort((a, b) => a.id.localeCompare(b.id));
  // When a sheet was made is not what it holds.
  const { createdAt: _created, ...held } = sheet;
  const references = markReferences(sheet, sources);
  // A sheet in a project with no revisions hashes as it always did.
  const revisions = sheetRevisions(sheet, { revisions: sources.revisions, drafts: sources.drafts as DraftEntity[] });
  return cyrb53(canonicalJson({ sheet: held, documents, drafts, ...(Object.keys(references).length ? { references } : {}), ...(revisions.length > 0 ? { revisions } : {}) }));
}

/**
 * Where each view named by a mark on the sheet's plans is drawn ("1 / A-201"), by view id: the marks are made
 * from the other sheets when the sheet is drawn, so renumbering one of those changes this sheet.
 */
function markReferences(sheet: ProjectSheet, sources: FingerprintSources): Record<string, ViewReference | null> {
  const viewIds = new Set(sources.views.map((v) => v.id));
  const out: Record<string, ViewReference | null> = {};
  for (const vp of sheet.viewports ?? []) {
    if (sources.views.find((v) => v.id === vp.viewId)?.kind !== 'plan') continue;
    const named = viewsNamedOnPlan(vp.viewId, sources.drafts.filter((d) => d.viewId === vp.viewId), sources.views);
    for (const id of named) out[id] = viewReference(id, viewIds, sources.sheets);
  }
  return out;
}

/** What an issue fingerprints a project's sheets against: everything a viewport can name, the drafts, the views and sheets the marks read, and the revision records. */
export function fingerprintSources(project: Pick<ProjectDocument, 'views' | 'sheets' | 'schedules' | 'legends' | 'civilDrawings' | 'drafts' | 'revisions'>): FingerprintSources {
  return {
    documents: [...project.views, ...(project.schedules ?? []), ...(project.legends ?? []), ...(project.civilDrawings ?? [])],
    drafts: project.drafts, views: project.views, sheets: project.sheets, revisions: project.revisions,
  };
}

/**
 * The issues of `after`, a migration of `saved` that changes how a sheet is
 * stored but not what it prints, with each recorded fingerprint that matched a
 * sheet of `saved` replaced by that sheet's fingerprint in `after`: a sheet
 * unchanged since an issue reads unchanged at the next one. A fingerprint that
 * did not match (the sheet had changed since) is kept, so it still reads
 * changed. The same document when nothing is replaced.
 */
export function carryIssueFingerprints(saved: ProjectDocument, after: ProjectDocument): ProjectDocument {
  if (!after.issues?.length || saved === after) return after;
  const before = fingerprintSources(saved);
  const now = fingerprintSources(after);
  const moved = new Map<string, string>();
  for (const sheet of saved.sheets) {
    const migrated = after.sheets.find((s) => s.id === sheet.id);
    if (!migrated) continue;
    const was = sheetFingerprint(sheet, before);
    const is = sheetFingerprint(migrated, now);
    if (was !== is) moved.set(`${sheet.number}\u0000${was}`, is);
  }
  if (moved.size === 0) return after;
  const issues = after.issues.map((issue) => ({
    ...issue,
    sheets: issue.sheets.map((row) => {
      const is = moved.get(`${row.number}\u0000${row.fingerprint}`);
      return is ? { ...row, fingerprint: is } : row;
    }),
  }));
  return { ...after, issues };
}
