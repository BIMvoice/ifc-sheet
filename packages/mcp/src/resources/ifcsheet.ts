/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Resources of the drawing-set tools (#165): the schema of the project document, and the project document and the sheets of the
 * set the session is working on. Read-only; the session ones are what `ifcsheet_save_project` and `ifcsheet_list_sheets` say,
 * built by the same functions.
 */

import type { ToolContext } from '../context.js';
import { ToolErrorCode, ToolExecutionError } from '../errors.js';
import type { ResourceContents, ResourceDefinition } from '../protocol/index.js';
import { projectFileBody } from '../tools/ifcsheet-project-file.js';
import { PROJECT_SCHEMA_URI, projectSchema } from '../tools/ifcsheet-project-schema.js';
import { sheetListing } from '../tools/ifcsheet-shared.js';
import { currentSheetSet } from '../tools/ifcsheet-store.js';
import type { ResourceProvider } from './types.js';

export const SESSION_PROJECT_URI = 'ifcsheet://session/project';
export const SESSION_SHEETS_URI = 'ifcsheet://session/sheets';

const json = (uri: string, mimeType: string, value: unknown): ResourceContents => ({ uri, mimeType, text: JSON.stringify(value, null, 2) });

export class IfcSheetResources implements ResourceProvider {
  name = 'ifcsheet';

  list(ctx: ToolContext): ResourceDefinition[] {
    const schema: ResourceDefinition = {
      uri: PROJECT_SCHEMA_URI,
      name: 'IfcSheet project schema',
      description: 'JSON Schema of the project document ifcsheet_save_project writes and ifcsheet_load_project reads.',
      mimeType: 'application/schema+json',
    };
    const current = currentSheetSet(ctx);
    if (!current) return [schema];
    const label = `${current.set.document.name} (${current.id})`;
    return [
      schema,
      { uri: SESSION_PROJECT_URI, name: `Project document: ${label}`, description: 'The project document of the drawing set this session made or loaded last, as ifcsheet_save_project would write it. Read-only.', mimeType: 'application/json' },
      { uri: SESSION_SHEETS_URI, name: `Sheets: ${label}`, description: 'The sheets and unplaced views of that set: what ifcsheet_list_sheets returns. Read-only.', mimeType: 'application/json' },
    ];
  }

  match(uri: string): boolean {
    return uri === PROJECT_SCHEMA_URI || uri === SESSION_PROJECT_URI || uri === SESSION_SHEETS_URI;
  }

  read(uri: string, ctx: ToolContext): ResourceContents[] {
    if (uri === PROJECT_SCHEMA_URI) return [json(uri, 'application/schema+json', projectSchema())];
    const current = currentSheetSet(ctx);
    if (!current) {
      throw new ToolExecutionError({
        code: ToolErrorCode.ENTITY_NOT_FOUND,
        message: 'This session holds no drawing set yet.',
        hint: 'Call ifcsheet_open_model, then ifcsheet_generate_set (or ifcsheet_load_project) first.',
      });
    }
    return [uri === SESSION_PROJECT_URI ? json(uri, 'application/json', projectFileBody(current)) : json(uri, 'application/json', sheetListing(current))];
  }
}
