/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ifcsheet_annotate` (#707): "Annotate the set" on the session's drawing set. The engine's `annotateViews` (through
 * `annotateSetHeadless`) drafts the dimension strings and the tags on the plans and the level marks on the elevations and
 * sections; the drafts are kept in the set (so the next PDF, DXF or issue prints them and a second call adds none), one undo
 * step. The result says per view what was added and what was left out and why, as message keys with their parameters.
 */

import { ANNOTATE_WORDS, readAnnotateSpec, readAnnotationPresets, readProjectSet, type DraftEntity, type TagParts } from '@bimvoice/ifcsheet';
import { annotateSetHeadless, annotatableViews, withDrafts } from '@bimvoice/ifcsheet/headless';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import { getSheetSet, replaceSheetDocument } from './ifcsheet-store.js';
import { DOCUMENT_ID, DRY_RUN, dryPrefix, findView, invalid, optBoolean, workingEntry } from './ifcsheet-shared.js';
import type { ToolGroup } from './ifcsheet-tool-group.js';
import type { Tool } from './types.js';
import { okResult } from './util.js';

const PARTS = ['doors', 'windows', 'rooms'] as const;

/** A list of strings from `input[key]`; undefined when absent. */
function strings(input: Record<string, unknown>, key: string): string[] | undefined {
  const v = input[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((s) => typeof s !== 'string' || s.trim() === '')) throw invalid(`${key} must be a list of non-empty strings.`);
  return v as string[];
}

/** The drafts a loaded project (or an earlier call) left in the set's document. */
function draftsOf(document: object): DraftEntity[] {
  const raw = document as Record<string, unknown>;
  return Array.isArray(raw.drafts) ? readProjectSet(raw).drafts : [];
}

export const ifcsheetAnnotate: Tool = {
  name: 'ifcsheet_annotate',
  description:
    `Annotate a drawing set the way the app's "Annotate the set" does: dimension strings and door, window and room tags on the plans, level marks on the elevations and sections. The annotation is drafted into the set (ifcsheet_export_pdf, ifcsheet_export_dxf and ifcsheet_issue print it) and a second call adds only what is missing. One undo step (ifcsheet_undo). Choose the commands with commands (any of ${ANNOTATE_WORDS.join(', ')}; default all) or with preset, the name of an annotation preset the loaded project saved; tag_parts limits the tags to doors, windows and rooms; views limits the views (names or ids of plans, elevations and sections; default all). Needs the model's geometry: a view with no drawing is left out. With dry_run true nothing is kept: the same result, as a plan. Returns, per view, its commands each with outcome (added, already: the view had everything, skipped), added (drafts) and messages [{key, params}] saying why a command did nothing, and what was added by kind (dimension, text, level, ...); a view that was left out has left_out {key, params}. Also the total added.`,
  scope: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID,
      dry_run: DRY_RUN,
      commands: { type: 'array', items: { type: 'string', enum: [...ANNOTATE_WORDS] }, description: 'dimension (DIMALL, plans), tag (TAGALL, plans), level (LEVELALL, elevations and sections). Default: all three.' },
      preset: { type: 'string', description: 'The name of an annotation preset of the loaded project (its commands and the kinds of tag). Not with commands.' },
      tag_parts: { type: 'array', items: { type: 'string', enum: [...PARTS] }, description: 'Which tags TAGALL places. Default: all (with a preset: its).' },
      views: { type: 'array', items: { type: 'string' }, description: 'Names or ids of the views to annotate. Default: every plan, elevation and section.' },
    },
    required: ['document_id'],
    additionalProperties: false,
  },
  async handler(input, ctx) {
    const session = getSheetSet(ctx, String(input.document_id ?? ''));
    const dry = optBoolean(input, 'dry_run') ?? false;
    const entry = workingEntry(session, dry);
    const doc = entry.set.document;
    const commands = strings(input, 'commands');
    const preset = typeof input.preset === 'string' ? input.preset : undefined;
    if (commands && preset !== undefined) throw invalid('Give commands or a preset, not both.');
    const presets = readAnnotationPresets((doc as unknown as Record<string, unknown>).annotationPresets);
    const spec = readAnnotateSpec(preset ?? commands?.join(',') ?? 'all', presets);
    if ('error' in spec) throw invalid(spec.error);
    const parts = strings(input, 'tag_parts');
    const tagParts: TagParts | undefined = parts ? { doors: parts.includes('doors'), windows: parts.includes('windows'), rooms: parts.includes('rooms') } : spec.tagParts;
    const names = strings(input, 'views');
    const viewIds = names ? new Set(names.map((n) => findView(doc, n).id)) : undefined;
    if (viewIds && annotatableViews(doc, viewIds).views.length === 0) throw invalid('None of the views is a plan, an elevation or a section: only those are annotated.');
    const existing = draftsOf(doc);
    const result = await annotateSetHeadless({ model: entry.model.model, set: entry.set, choices: spec.choices, ...(tagParts ? { tagParts } : {}), existing, ...(viewIds ? { viewIds } : {}) });
    const { summary } = result;
    if (summary.views.length === 0) throw new ToolExecutionError({ code: ToolErrorCode.UNSUPPORTED_OPERATION, message: 'The commands chosen have no view to run on in this set (dimension and tag are for plans, level for elevations and sections).' });
    const moved = [...result.drafts.values()].some((d) => d.update.size > 0);
    if (summary.added > 0 || moved) replaceSheetDocument(entry, withDrafts(doc, result.all));
    const views = summary.views.map((v) => {
      const added = result.drafts.get(v.viewId)?.add ?? [];
      const byKind: Record<string, number> = {};
      for (const d of added) byKind[d.shape.type] = (byKind[d.shape.type] ?? 0) + 1;
      return {
        view_id: v.viewId, name: v.name, kind: v.kind, added: byKind,
        ...(v.skipped ? { left_out: { key: v.skipped.key, ...(v.skipped.params ? { params: v.skipped.params } : {}) } } : {}),
        commands: v.results.map((r) => ({ command: r.command, outcome: r.outcome, added: r.added, messages: r.messages.map((m) => ({ key: m.key, ...(m.params ? { params: m.params } : {}) })) })),
      };
    });
    const left = views.filter((v) => v.left_out).length;
    return okResult(
      dryPrefix(dry, `${dry ? 'Would add' : 'Added'} ${summary.added} drafted item${summary.added === 1 ? '' : 's'} on ${views.length - left} view${views.length - left === 1 ? '' : 's'}${left > 0 ? `; ${left} left out (no drawing)` : ''}.${summary.added === 0 ? ' The views already have what the commands draw, or have nothing for them.' : ''}`),
      { document_id: entry.id, dry_run: dry, ...(spec.preset ? { preset: spec.preset } : {}), added: summary.added, views },
    );
  },
};

export const toolGroup: ToolGroup = { order: 70, tools: [ifcsheetAnnotate] };
