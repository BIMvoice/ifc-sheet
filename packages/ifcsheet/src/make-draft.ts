/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing entity a command makes: the pure part of creating a draft. The
 * id is passed in (the app takes it from `freshProjectId('draft')`), so the
 * planners that run in the app, the command line and MCP build the same
 * entity, and a test can fix the id (#707).
 */

import type { DraftEntity, DraftParamValue, EntityShape } from './draft-types.js';

export interface MakeDraftOptions {
  id: string;
  viewId: string;
  layerId: string;
  params?: Record<string, DraftParamValue>;
}

export function makeDraft(shape: EntityShape, opts: MakeDraftOptions): DraftEntity {
  return { id: opts.id, viewId: opts.viewId, layerId: opts.layerId, shape, params: opts.params ?? {} };
}
