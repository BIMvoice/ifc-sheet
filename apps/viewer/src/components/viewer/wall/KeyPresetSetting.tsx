/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The key set picker in the keyboard settings (#166): "IfcSheet default" or
 * "AutoCAD-like", with a line on what the person's own changes are on top of
 * it. Choosing the AutoCAD-like set OFFERS AutoCAD mode (`autocad-mode.ts`)
 * when it is off; it never turns it on by itself, and the two stay separate
 * choices.
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { setAutocadMode, useAutocadMode } from '@/lib/commands/autocad-mode';
import { KEY_PRESETS, isKeyPresetId } from '@/lib/commands/key-presets';
import { setKeyPreset, useKeyBindings } from '@/lib/commands/key-bindings';

const button = 'rounded border border-border px-2 py-1 text-sm hover:bg-muted';

export function KeyPresetSetting({ onChanged }: { onChanged: (text: string) => void }) {
  const { t } = useTranslation();
  const preset = useKeyBindings((s) => s.preset);
  const custom = useKeyBindings((s) => Object.keys(s.overrides).length);
  const autocadMode = useAutocadMode((s) => s.on);
  const [offering, setOffering] = useState(false);
  const current = KEY_PRESETS.find((p) => p.id === preset) ?? KEY_PRESETS[0];
  const name = t(current.labelKey);

  const choose = (id: string) => {
    if (!isKeyPresetId(id)) return;
    const { dropped } = setKeyPreset(id);
    const label = t(KEY_PRESETS.find((p) => p.id === id)?.labelKey ?? current.labelKey);
    onChanged(dropped > 0 ? t('wall.keys.preset.switchedDropped', { preset: label, count: dropped }) : t('wall.keys.preset.switched', { preset: label }));
    setOffering(id === 'autocad' && !autocadMode);
  };

  return (
    <div className="space-y-1">
      <label className="flex flex-wrap items-center gap-2">
        <span>{t('wall.keys.preset.label')}</span>
        <select
          value={preset}
          aria-describedby="key-preset-hint key-preset-custom"
          className="rounded border border-border bg-background px-2 py-1"
          onChange={(e) => choose(e.target.value)}
        >
          {KEY_PRESETS.map((p) => <option key={p.id} value={p.id}>{t(p.labelKey)}</option>)}
        </select>
      </label>
      <p id="key-preset-hint" className="m-0 text-xs text-muted-foreground">{t(current.hintKey)}</p>
      <p id="key-preset-custom" className="m-0 text-xs text-muted-foreground">
        {custom > 0 ? t('wall.keys.preset.custom', { count: custom, preset: name }) : t('wall.keys.preset.noCustom', { preset: name })}
      </p>
      {offering && !autocadMode ? (
        <fieldset aria-label={t('wall.keys.autocad.label')} className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0">
          <span>{t('wall.keys.preset.offerAutocad')}</span>
          <button type="button" className={button} onClick={() => { setAutocadMode(true); setOffering(false); onChanged(t('wall.keys.autocad.turnedOn')); }}>{t('wall.keys.preset.offerAutocadOn')}</button>
          <button type="button" className={button} onClick={() => setOffering(false)}>{t('wall.keys.preset.offerLater')}</button>
        </fieldset>
      ) : null}
    </div>
  );
}
