/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The underlays of a drawing tab (#457): add a PDF page or an image to trace over, set its scale from a distance
 * you know (UNDERLAYSCALE), move, turn, fade and lock it, and choose, sheet by sheet, whether it prints. The
 * pictures are kept in the project (`underlay/`).
 */

import { useRef, useState } from 'react';
import { ImageUp } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { IconButton } from '@/components/ui/icon-button';
import { toast } from '@/components/ui/toast';
import { useProjectStore } from '@/project/project-store';
import { startDraftCommand } from '@/drafting/session';
import { addUnderlay, placeUnderlay, removeUnderlay, setUnderlayLocked, setUnderlayOpacity, setUnderlayPrintsOn } from '@/underlay/underlay-actions';
import { underlayFromFile } from '@/underlay/underlay-import';
import { underlaysOfView, type ViewUnderlay } from '@/underlay/underlay';

const DEG = 180 / Math.PI;

function Card({ u }: { u: ViewUnderlay }) {
  const { t } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets).filter((sheet) => (sheet.viewports ?? []).some((vp) => vp.viewId === u.viewId));
  const number = (label: string, value: number, step: number, commit: (n: number) => void) => (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <input type="number" step={step} disabled={u.locked} value={+value.toFixed(4)} onChange={(e) => { if (e.target.value !== '') commit(Number(e.target.value)); }} className="h-6 w-24 rounded-sm border border-zinc-300 bg-transparent px-1 dark:border-zinc-700" />
    </label>
  );
  return (
    <div className="space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-800" data-underlay-card={u.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold" title={u.name}>{u.name}{u.page ? ` · ${t('underlay.pageShort', { page: u.page })}` : ''}</span>
        <button type="button" className="text-red-600 hover:underline" onClick={() => removeUnderlay(u.id)}>{t('underlay.remove')}</button>
      </div>
      <button type="button" disabled={u.locked} className="h-6 rounded-sm border border-zinc-300 px-2 disabled:opacity-50 dark:border-zinc-700" onClick={() => startDraftCommand('underlayscale')}>{t('underlay.scaleByPoints')}</button>
      {number(t('underlay.scale'), u.mPerPx * 1000, 0.1, (n) => placeUnderlay(u.id, { mPerPx: n / 1000 }))}
      {number(t('underlay.x'), u.at.x, 0.1, (n) => placeUnderlay(u.id, { at: { x: n, y: u.at.y } }))}
      {number(t('underlay.y'), u.at.y, 0.1, (n) => placeUnderlay(u.id, { at: { x: u.at.x, y: n } }))}
      {number(t('underlay.rotation'), u.rotation * DEG, 0.5, (n) => placeUnderlay(u.id, { rotation: n / DEG }))}
      <label className="flex items-center justify-between gap-2">
        <span>{t('underlay.opacity')}</span>
        <input type="range" min={0} max={1} step={0.05} value={u.opacity} onChange={(e) => setUnderlayOpacity(u.id, Number(e.target.value))} className="w-24" />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={u.locked} onChange={(e) => setUnderlayLocked(u.id, e.target.checked)} />
        <span>{t('underlay.lock')}</span>
      </label>
      <div className="pt-1 font-semibold">{t('underlay.printsHeading')}</div>
      {sheets.length === 0 ? <div className="text-zinc-500">{t('underlay.noSheets')}</div> : sheets.map((sheet) => (
        <label key={sheet.id} className="flex items-center gap-2">
          <input type="checkbox" checked={u.printOnSheets?.includes(sheet.id) === true} onChange={(e) => setUnderlayPrintsOn(u.id, sheet.id, e.target.checked)} />
          <span className="truncate">{sheet.number} {sheet.name}</span>
        </label>
      ))}
    </div>
  );
}

export function UnderlayPanel({ viewId }: { viewId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const underlays = underlaysOfView(useProjectStore((s) => s.underlays), viewId);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      addUnderlay(await underlayFromFile(file, viewId, Math.max(1, Math.floor(page) || 1)));
    } catch (error) {
      toast.error(t('underlay.failed', { reason: error instanceof Error ? error.message : String(error) }), 'underlay-import');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <span className="relative">
      <IconButton label={t('underlay.open')} className="size-7" onClick={() => setOpen(!open)}><ImageUp className="size-4" /></IconButton>
      {open ? (
        <section aria-label={t('underlay.title')} className="absolute right-0 top-8 z-30 w-72 space-y-2 rounded-md border border-zinc-300 bg-white p-3 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-zinc-500">{t('underlay.hint')}</p>
          <label className="flex items-center justify-between gap-2">
            <span>{t('underlay.page')}</span>
            <input type="number" min={1} step={1} value={page} onChange={(e) => setPage(Number(e.target.value))} className="h-6 w-16 rounded-sm border border-zinc-300 bg-transparent px-1 dark:border-zinc-700" />
          </label>
          <label className="block">
            <span className="sr-only">{t('underlay.add')}</span>
            <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); }} />
          </label>
          {busy ? <output className="block">{t('underlay.importing')}</output> : null}
          {underlays.map((u) => <Card key={u.id} u={u} />)}
        </section>
      ) : null}
    </span>
  );
}
