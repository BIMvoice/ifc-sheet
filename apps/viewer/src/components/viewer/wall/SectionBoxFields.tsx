/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The section box of a cut-away in its drawing's card (#97): off, or the storey's extent, with the minimum and maximum of each
 * axis editable in metres, and a reset to the storey's extent. Each change is one undo step (`project/section-box.ts`).
 */

import { useState } from 'react';
import type { MeshData } from '@ifc-lite/geometry';
import { useTranslation, type TranslationKey } from '@/i18n';
import { BOX_AXES, setBoxEdge, setSectionBox, storeyBox, type BoxAxis, type BoxEnd } from '@/project/section-box';
import { useProjectStore } from '@/project/project-store';
import type { ThreeDProjectView } from '@/project/types';
import { WALL_FIELD, WALL_PILL } from './wall-type';

const OFF = 'off';
const STOREY = 'storey';
const round = (n: number): string => String(Math.round(n * 1000) / 1000);

/** `measure` gives the storey's extent; the card measures the loaded model, a test hands in its own. */
export function SectionBoxFields({ view, meshes, measure = storeyBox }: { view: ThreeDProjectView; meshes: MeshData[] | null; measure?: typeof storeyBox }) {
  const { t } = useTranslation();
  const levels = useProjectStore((s) => s.levels);
  // The text being typed in one field, until it is committed (on leaving the field).
  const [typing, setTyping] = useState<{ key: string; text: string } | null>(null);
  const box = view.cutaway?.box;
  const extent = () => measure(view.cutaway?.storey?.level, levels, meshes);
  const commit = (end: BoxEnd, axis: BoxAxis): void => {
    if (typing?.key === `${end}.${axis}`) {
      const n = Number(typing.text.replace(',', '.'));
      if (typing.text.trim() !== '' && n !== box?.[end][axis]) setBoxEdge(view.id, end, axis, n);
    }
    setTyping(null);
  };
  const noGeometry = !box && extent() === null;
  return (
    <fieldset className="space-y-2">
      <legend>{t('cutawayAxo.box')}</legend>
      <select
        className={WALL_FIELD}
        aria-label={t('cutawayAxo.box')}
        value={box ? STOREY : OFF}
        onChange={(e) => setSectionBox(view.id, e.target.value === STOREY ? extent() : null)}
      >
        <option value={OFF}>{t('cutawayAxo.box.off')}</option>
        <option value={STOREY} disabled={noGeometry}>{t('cutawayAxo.box.storey')}</option>
      </select>
      {noGeometry ? <p className="m-0 text-xs text-sky-300">{t('cutawayAxo.box.none')}</p> : null}
      {box ? (
        <>
          <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1 text-xs">
            <span />
            <span>{t('cutawayAxo.box.min')}</span>
            <span>{t('cutawayAxo.box.max')}</span>
            {BOX_AXES.map((axis) => (
              <div key={axis} className="contents">
                <span>{t(`cutawayAxo.box.${axis}` as TranslationKey)}</span>
                {(['min', 'max'] as const).map((end) => (
                  <input
                    key={end}
                    className={WALL_FIELD}
                    inputMode="decimal"
                    aria-label={`${t(`cutawayAxo.box.${axis}` as TranslationKey)} ${t(`cutawayAxo.box.${end}` as TranslationKey)}`}
                    data-box={`${end}.${axis}`}
                    value={typing?.key === `${end}.${axis}` ? typing.text : round(box[end][axis])}
                    onChange={(e) => setTyping({ key: `${end}.${axis}`, text: e.target.value })}
                    onBlur={() => commit(end, axis)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                ))}
              </div>
            ))}
          </div>
          <button type="button" className={WALL_PILL} disabled={extent() === null} onClick={() => setSectionBox(view.id, extent())}>{t('cutawayAxo.box.reset')}</button>
        </>
      ) : null}
    </fieldset>
  );
}
