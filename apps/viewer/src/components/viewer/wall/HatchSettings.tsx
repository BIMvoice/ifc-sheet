/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hatched zone's pattern, scale and angle: the built-in patterns and the
 * project's imported ones. They are the settings the hatch tool reads, so the
 * next zone filled takes them.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { builtInPatterns } from '@/drafting/hatch/library';
import { parsePat } from '@/drafting/hatch/pattern';
import { baseDraftSettings, patchDraftSettings, useDraftingSession } from '@/drafting/session';
import { useProjectStore } from '@/project/project-store';
import { WALL_FIELD } from './wall-type';

const field = WALL_FIELD;

export function HatchSettings() {
  const { t } = useTranslation();
  useDraftingSession((s) => s.revision);
  const patternText = useProjectStore((s) => s.hatchPatterns ?? '');
  const names = useMemo(() => [...new Set([...builtInPatterns(), ...parsePat(patternText).patterns].map((p) => p.name))], [patternText]);
  const settings = baseDraftSettings();
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-sky-200">
      <label className="col-span-2">
        {t('wall.hatch.pattern')}
        <select className={field} value={settings.hatchPattern} onChange={(e) => patchDraftSettings({ hatchPattern: e.target.value })}>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>
        {t('wall.hatch.scale')}
        <input className={field} type="number" min={0.05} step={0.05} value={settings.hatchScale} onChange={(e) => {
          const v = Number(e.target.value);
          if (v > 0) patchDraftSettings({ hatchScale: v });
        }} />
      </label>
      <label>
        {t('wall.hatch.angle')}
        <input className={field} type="number" step={15} value={settings.hatchAngle} onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) patchDraftSettings({ hatchAngle: v });
        }} />
      </label>
    </div>
  );
}
