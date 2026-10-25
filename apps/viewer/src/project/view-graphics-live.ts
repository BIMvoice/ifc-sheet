/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The graphics a view draws with right now (#44): its template's, then its own over them (`resolveViewGraphics`, the engine's one
 * layering), read from the project store. For code that is not a React component (overlays, the DXF walk); a component subscribes to
 * `viewTemplates` itself and calls `resolveViewGraphics` in a memo, so it redraws when a template changes.
 */

import { resolveViewGraphics, type ViewGraphics } from '@bimvoice/ifcsheet';
import { useProjectStore } from './project-store';
import type { ProjectView } from './types';

export const liveGraphics = (view: ProjectView | undefined): ViewGraphics | undefined => resolveViewGraphics(view, useProjectStore.getState().viewTemplates);
