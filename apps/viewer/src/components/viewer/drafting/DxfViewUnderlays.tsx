/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The DXF underlays of a plan view (#547), in the underlay menu: add a DXF, align it by two points (DXFALIGN), switch its layers
 * on or off, fade and lock it, and choose the sheets that print it. The lines are kept in the project.
 */

import { useRef, useState } from 'react';
import { dxfUnderlaysOfView, type ViewDxfUnderlay } from '@bimvoice/ifcsheet/underlay';
import { useTranslation } from '@/i18n';
import { toast } from '@/components/ui/toast';
import { useProjectStore } from '@/project/project-store';
import { startDraftCommand } from '@/drafting/session';
import { addDxfUnderlayFromText, removeDxfUnderlay, setDxfLayerVisible, setDxfLocked, setDxfOpacity, setDxfPrintsOn } from '@/underlay/dxf-underlay-actions';

function Card({ u }: { u: ViewDxfUnderlay }) {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets).filter((sheet) => (sheet.viewports ?? []).some((vp) => vp.viewId === u.viewId));
  return (
    <div className="space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-800" data-dxf-underlay-card={u.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold" title={u.name}>{u.name}</span>
        <button type="button" className="text-red-600 hover:underline" onClick={() => removeDxfUnderlay(u.id)}>{t('dxfView.remove')}</button>
      </div>
      <button type="button" disabled={u.locked} className="h-6 rounded-sm border border-zinc-300 px-2 disabled:opacity-50 dark:border-zinc-700" onClick={() => startDraftCommand('dxfalign')}>{t('dxfView.align')}</button>
      <div className="font-semibold">{t('dxfView.layers')}</div>
      {u.layers.map((layer) => (
        <label key={layer.name} className="flex items-center gap-2">
          <input type="checkbox" checked={layer.visible} onChange={(e) => setDxfLayerVisible(u.id, layer.name, e.target.checked)} />
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: layer.colour }} />
          <span className="truncate">{layer.name}</span>
        </label>
      ))}
      <label className="flex items-center justify-between gap-2">
        <span>{t('dxfView.opacity')}</span>
        <input type="range" min={0} max={1} step={0.05} value={u.opacity} onChange={(e) => setDxfOpacity(u.id, Number(e.target.value))} className="w-24" />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={u.locked} onChange={(e) => setDxfLocked(u.id, e.target.checked)} />
        <span>{t('dxfView.lock')}</span>
      </label>
      <div className="pt-1 font-semibold">{t('dxfView.printsHeading')}</div>
      {sheets.length === 0 ? <div className="text-zinc-500">{t('dxfView.noSheets')}</div> : sheets.map((sheet) => (
        <label key={sheet.id} className="flex items-center gap-2">
          <input type="checkbox" checked={u.printOnSheets?.includes(sheet.id) === true} onChange={(e) => setDxfPrintsOn(u.id, sheet.id, e.target.checked)} />
          <span className="truncate">{sheet.number} {sheet.name}</span>
        </label>
      ))}
    </div>
  );
}

export function DxfViewUnderlays({ viewId }: { viewId: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = dxfUnderlaysOfView(useProjectStore((s) => s.dxfUnderlays), viewId);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      addDxfUnderlayFromText(await file.text(), file.name, viewId);
    } catch (error) {
      toast.error(t('dxfView.failed', { reason: error instanceof Error ? error.message : String(error) }), 'dxf-underlay-import');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <div className="font-semibold">{t('dxfView.heading')}</div>
      <p className="text-zinc-500">{t('dxfView.hint')}</p>
      <label className="block">
        <span className="sr-only">{t('dxfView.add')}</span>
        <input ref={input} type="file" accept=".dxf,application/dxf,image/vnd.dxf" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); }} />
      </label>
      {busy ? <output className="block">{t('dxfView.importing')}</output> : null}
      {list.map((u) => <Card key={u.id} u={u} />)}
    </div>
  );
}
