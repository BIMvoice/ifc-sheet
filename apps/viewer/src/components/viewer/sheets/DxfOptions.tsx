/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The two choices of the sheet's DXF export (#831): layers by pen or element, units of the paper or the model. */

import { useTranslation } from '@/i18n';
import { DXF_LAYER_SCHEMES, DXF_UNITS } from '@bimvoice/ifcsheet/dxf';
import { useDxfExportOptions } from './dxf-export-options';

const SELECT = 'h-6 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1';

export function DxfOptions() {
  const { t } = useTranslation();
  const { layers, units } = useDxfExportOptions();
  return (
    <div className="flex w-full flex-col gap-1">
      <label className="flex items-center justify-between gap-2">
        <span className="shrink-0 text-zinc-500">{t('dxfWorkingFile.layers')}</span>
        <select className={SELECT} value={layers} onChange={(e) => useDxfExportOptions.setState({ layers: DXF_LAYER_SCHEMES.find((l) => l === e.target.value) ?? 'pen' })}>
          {DXF_LAYER_SCHEMES.map((l) => <option key={l} value={l}>{t(`dxfWorkingFile.layers.${l}`)}</option>)}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="shrink-0 text-zinc-500">{t('dxfWorkingFile.units')}</span>
        <select className={SELECT} value={units} onChange={(e) => useDxfExportOptions.setState({ units: DXF_UNITS.find((u) => u === e.target.value) ?? 'paper' })}>
          {DXF_UNITS.map((u) => <option key={u} value={u}>{t(`dxfWorkingFile.units.${u}`)}</option>)}
        </select>
      </label>
    </div>
  );
}
