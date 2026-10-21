/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The AutoCAD mode switch in the keyboard settings (#168): a checkbox named by
 * its label and described by what the mode does. Turning it on or off is
 * announced through the panel's status (`onChanged`).
 */

import { useTranslation } from '@/i18n';
import { setAutocadMode, useAutocadMode } from '@/lib/commands/autocad-mode';

export function AutocadModeSetting({ onChanged }: { onChanged: (text: string) => void }) {
  const { t } = useTranslation();
  const on = useAutocadMode((s) => s.on);
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          aria-describedby="autocad-mode-hint"
          onChange={(e) => {
            setAutocadMode(e.target.checked);
            onChanged(t(e.target.checked ? 'wall.keys.autocad.turnedOn' : 'wall.keys.autocad.turnedOff'));
          }}
        />
        <span>{t('wall.keys.autocad.label')}</span>
      </label>
      <p id="autocad-mode-hint" className="m-0 text-xs text-muted-foreground">{t('wall.keys.autocad.hint')}</p>
    </div>
  );
}
