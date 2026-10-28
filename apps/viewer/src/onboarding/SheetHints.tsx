/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hint inside a sheet (#455), one at a time, the one that applies now: in
 * a line or section tool, the ortho state and its key; on a chosen drawing
 * that has grips, that its edges resize it; otherwise that a double-click
 * draws in a drawing.
 */

import { useDraftingSession } from '@/drafting/session';
import { useTranslation } from '@/i18n';
import { shortcutLabel } from '@/lib/commands/shortcut-label';
import { Hint } from './Hint';

/** The tools whose points ortho constrains from a base point: the ones that draw a line. */
const ORTHO_TOOLS: ReadonlySet<string> = new Set(['line', 'polyline', 'sectionline']);

export function SheetHints({ resizing, hasDrawings }: { resizing: boolean; hasDrawings: boolean }) {
  const { t } = useTranslation();
  const commandId = useDraftingSession((s) => s.commandId);
  const ortho = useDraftingSession((s) => s.ortho || s.orthoHeld);
  if (commandId !== null && ORTHO_TOOLS.has(commandId)) {
    return (
      <Hint id="ortho">
        {t(ortho ? 'onboarding.hint.orthoOn' : 'onboarding.hint.orthoOff', { key: shortcutLabel('drafting.ortho') })}
      </Hint>
    );
  }
  if (resizing) return <Hint id="viewportResize">{t('onboarding.hint.viewportResize')}</Hint>;
  if (hasDrawings) return <Hint id="openView">{t('onboarding.hint.openView')}</Hint>;
  return null;
}
