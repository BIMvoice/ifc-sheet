/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PEN (#833): freehand ink. The pointer's path while it is down is simplified (`simplifyStroke`) and saved as a polyline
 * on the drawing in front (or the sheet), on the Markup pen layer: red, medium. One stroke is one undo step; the tool
 * stays on for the next stroke until Esc.
 */

import { editDrafts, newDraft } from '../draft-store';
import { simplifyStroke } from '../stroke';
import { resolve } from '@/i18n/registry';
import { useProjectStore } from '@/project/project-store';
import type { Pt } from '../types';
import type { DraftCommandDef } from './types';

export const PEN_LAYER = 'markup-pen';

/** The Markup pen layer (red, 0.35 mm: the medium pen), added when the project has none. */
export function ensurePenLayer(): void {
  const { draftLayers } = useProjectStore.getState();
  if (!draftLayers.some((l) => l.id === PEN_LAYER)) useProjectStore.setState({ draftLayers: [...draftLayers, { id: PEN_LAYER, name: resolve('pen.layer'), color: '#dc2626', visible: true, locked: false, lineWeight: 0.35 }], dirty: true });
}

export const penCommand: DraftCommandDef = {
  id: 'pen',
  aliases: ['PEN'],
  labelKey: 'drafting.cmd.pen',
  create(ctx) {
    let path: Pt[] = [];
    return {
      prompt: () => ({ key: 'drafting.prompt.penStroke' }),
      input: () => 'stroke',
      basePoint: () => null,
      stroke: {
        move(p) { path.push(p); },
        end(tolerance) {
          const pts = simplifyStroke(path, tolerance);
          path = [];
          if (pts.length >= 2) {
            ensurePenLayer();
            editDrafts({ add: [newDraft(ctx.viewId, PEN_LAYER, { type: 'polyline', pts, closed: false })] });
          }
          return 'continue';
        },
      },
      onEnter: () => 'done',
      preview: () => (path.length >= 2 ? [{ type: 'polyline', pts: path, closed: false }] : []),
    };
  },
};

export const draftCommands: readonly DraftCommandDef[] = [penCommand];
