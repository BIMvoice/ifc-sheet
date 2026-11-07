/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Symbol tool's Size and Rotation on its card (#168). They are the drafting settings the SYMBOL command reads for
 * its next placement (`symbolScale`, `symbolRotation`, the ones S and R type), so a change here applies to the next
 * symbol placed, with the tool running or not. The text being typed is kept apart from the setting so "1." or an
 * empty field is not forced back; a value that is not a number (or a size not above zero) leaves the setting alone.
 */

import { useEffect, useState } from 'react';
import { baseDraftSettings, patchDraftSettings, useDraftingSession } from '@/drafting/session';
import { useTranslation } from '@/i18n';
import { WALL_FIELD, WALL_PILL } from './wall-type';

const QUICK_ROTATIONS = [0, 90, 180, 270] as const;

/** A number field that writes a drafting setting when what is typed is acceptable, and shows the setting again when it changes elsewhere. */
function NumberField({ label, value, accepts, onValue }: { label: string; value: number; accepts: (n: number) => boolean; onValue: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((now) => (Number(now) === value ? now : String(value)));
  }, [value]);
  return (
    <label className="mt-4 block text-xs text-sky-200">
      {label}
      <input
        className={WALL_FIELD}
        type="number"
        inputMode="decimal"
        step="any"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = e.target.value.trim() === '' ? NaN : Number(e.target.value);
          if (Number.isFinite(n) && accepts(n)) onValue(n);
        }}
      />
    </label>
  );
}

export function SymbolToolFields() {
  const { t } = useTranslation();
  useDraftingSession((s) => s.revision);
  const settings = baseDraftSettings();
  return (
    <>
      <NumberField label={t('symbolTool.size')} value={settings.symbolScale} accepts={(n) => n > 0} onValue={(n) => patchDraftSettings({ symbolScale: n })} />
      <NumberField label={t('symbolTool.rotation')} value={settings.symbolRotation} accepts={() => true} onValue={(n) => patchDraftSettings({ symbolRotation: n })} />
      <fieldset className="m-0 mt-2 flex flex-wrap gap-2 border-0 p-0" aria-label={t('symbolTool.rotationQuick')}>
        {QUICK_ROTATIONS.map((deg) => (
          <button
            key={deg}
            type="button"
            className={WALL_PILL}
            aria-pressed={settings.symbolRotation === deg}
            aria-label={t('symbolTool.rotationTo', { degrees: deg })}
            onClick={() => patchDraftSettings({ symbolRotation: deg })}
          >
            {deg}
          </button>
        ))}
      </fieldset>
    </>
  );
}
