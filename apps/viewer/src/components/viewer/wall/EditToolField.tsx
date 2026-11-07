/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The number Offset, Fillet and Chamfer work with, as a field on the tool
 * card (#168): the offset distance, the fillet radius, the chamfer distance.
 * It writes the drafting session's setting the commands read at every pick,
 * the same one a number typed into the command line sets, so changing it
 * during the tool applies to the next pick.
 */

import { baseDraftSettings, patchDraftSettings, useDraftingSession } from '@/drafting/session';
import type { DraftSettings } from '@/drafting/commands/types';
import { useTranslation } from '@/i18n';
import type { TranslationKey } from '@/i18n/en';
import { DraftNumber } from './DraftNumber';

const FIELDS = {
  offset: { setting: 'offsetDistance', labelKey: 'wall.edit.distance', min: 0.001 },
  fillet: { setting: 'filletRadius', labelKey: 'wall.edit.radius', min: 0 },
  chamfer: { setting: 'chamferDistance', labelKey: 'wall.edit.distance', min: 0 },
} as const satisfies Record<string, { setting: keyof DraftSettings; labelKey: TranslationKey; min: number }>;

export type EditTool = keyof typeof FIELDS;

export const isEditTool = (tool: string): tool is EditTool => tool in FIELDS;

export function EditToolField({ tool }: { tool: EditTool }) {
  const { t } = useTranslation();
  useDraftingSession((s) => s.revision);
  const { setting, labelKey, min } = FIELDS[tool];
  // An offset needs a distance above zero; a fillet or chamfer of 0 is a sharp corner.
  const accept = (v: number) => (tool === 'offset' ? v > 0 : v >= 0);
  return (
    <label className="mt-4 block text-xs text-sky-200">
      {t(labelKey)}
      <DraftNumber value={baseDraftSettings()[setting]} min={min} step={0.1} accept={accept} onValid={(v) => patchDraftSettings({ [setting]: v })} />
    </label>
  );
}
