/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The manual check of a split schedule (#186, section 2): every type with the parts that list it, filterable by kind, storey and status,
 * so a reviewer can go through the split by hand and merge a type into one part, move it, or keep it apart on purpose (the duplicate
 * check then leaves it alone, in the app, the readiness list and `ifcsheet check --project`). The list is the engine's check
 * (`SubReportCheck.elements`, through `check/sub-report-check`), the same the card and "What the model lacks" read, so the three
 * cannot disagree. Every change is one undo step (`joinery/sub-report-review-actions`).
 *
 * Keyboard: Up and Down move between the types, Home and End to the first and last, Enter or Space opens one, Escape closes, Tab stays inside.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { canSplit, filterReview, reviewCounts, reviewTypes, type PartRef, type ReviewFilter, type ReviewStatus } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { subReportCheckOf } from '@/check/sub-report-check';
import { keepApartIds, placeTypes, resumeIds } from '@/joinery/sub-report-review-actions';
import { SubReportReviewType, STATUS_KEY, type TypeActions } from './SubReportReviewType';
import { WALL_FIELD, WALL_LABEL } from './wall-type';
import { useParentRows } from './SubReportChecks';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const STATUSES: ReviewStatus[] = ['duplicate', 'gap', 'kept', 'ok'];

export function SubReportReview({ scheduleId, onClose }: { scheduleId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const parent = schedules.find((s) => s.id === scheduleId && canSplit(s));
  const rows = useParentRows(parent?.kind ?? 'all');
  const check = useMemo(() => (parent ? subReportCheckOf(parent, schedules, () => rows) : null), [parent, schedules, rows]);
  const types = useMemo(() => (check ? reviewTypes(check) : []), [check]);
  const counts = useMemo(() => (check ? reviewCounts(check) : null), [check]);
  const [filter, setFilter] = useState<ReviewFilter>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [refocus, setRefocus] = useState<{ key: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const shown = useMemo(() => filterReview(types, filter), [types, filter]);
  const levels = useMemo(() => [...new Set(types.flatMap((x) => x.levels))], [types]);
  const kept = parent?.keptApart ?? [];

  // Keys belong to the dialog: focus goes in, Tab stays in, Esc closes, and focus is given back.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>('[data-close]')?.focus();
    const pull = (e: FocusEvent): void => {
      if (dialog.current && e.target instanceof Node && !dialog.current.contains(e.target)) dialog.current.querySelector<HTMLElement>('[data-close]')?.focus();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const stops = [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
        const first = stops[0], last = stops[stops.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('focusin', pull);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('focusin', pull);
      window.removeEventListener('keydown', onKey, true);
      before?.focus();
    };
  }, []);

  // After a change the button that was pressed may be gone (a merged type has no merge buttons left): focus goes to the type's row.
  useEffect(() => {
    if (refocus) [...(dialog.current?.querySelectorAll<HTMLElement>('[data-review-row]') ?? [])].find((el) => el.dataset.reviewRow === refocus.key)?.focus();
  }, [refocus]);

  // The schedule is gone (deleted, or no longer split): nothing left to review.
  const gone = !parent;
  useEffect(() => { if (gone) closeRef.current(); }, [gone]);

  const partsOf = (check?.parts ?? []) as readonly PartRef[];
  const actions: TypeActions = {
    merge: (key, part) => place('merge', key, part),
    move: (key, part) => place('move', key, part),
    keep: (key, ids, label, again) => {
      if (!parent) return;
      if (again) resumeIds(parent.id, ids); else keepApartIds(parent.id, ids);
      setNote(t(again ? 'wall.review.done.resume' : 'wall.review.done.keep', { label }));
      setRefocus({ key });
    },
  };
  function place(kind: 'merge' | 'move', key: string, part: PartRef): void {
    if (!parent) return;
    const label = types.find((x) => x.key === key)?.label ?? key;
    const changed = placeTypes(parent.id, [key], part.id);
    setNote(t(changed === 0 ? 'wall.review.done.same' : kind === 'merge' ? 'wall.review.done.merge' : 'wall.review.done.move', { label, part: part.name }));
    setRefocus({ key });
  }

  const onRowKey = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    const heads = [...(dialog.current?.querySelectorAll<HTMLElement>('[data-review-row]') ?? [])];
    const at = heads.indexOf(e.currentTarget);
    const to = e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? heads.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    heads[Math.max(0, Math.min(heads.length - 1, to))]?.focus();
  };

  const title = t('wall.review.title');
  const set = (patch: Partial<ReviewFilter>): void => setFilter((f) => ({ ...f, ...patch }));
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <dialog ref={dialog} open aria-modal="true" aria-label={title} data-owns-keys data-sub-report-review className="static m-0 flex h-full max-h-[48rem] w-full max-w-5xl flex-col rounded-xl border border-sky-300/20 bg-[#0b2348] p-0 text-sky-50 shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-sky-300/20 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-xl font-light text-white">{title}</h2>
            <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.review.of', { schedule: parent?.name ?? '' })}</p>
          </div>
          <button type="button" data-close className="rounded-full border border-sky-300/30 px-3 py-1 text-sm text-sky-100 hover:border-sky-300/70" onClick={onClose}>{t('wall.review.close')}</button>
        </header>
        {check && check.parts.length > 0 && counts ? (
          <>
            <div className="shrink-0 border-b border-sky-300/15 px-5 py-3">
              <p className="m-0 text-sm text-sky-100" aria-live="polite">{t('wall.review.summary', counts)}</p>
              <fieldset className="m-0 mt-2 flex flex-wrap items-end gap-3 border-0 p-0">
                <legend className="sr-only">{t('wall.review.filters')}</legend>
                <label className={WALL_LABEL}>{t('wall.review.filter.kind')}
                  <select className={WALL_FIELD} value={filter.kind ?? ''} onChange={(e) => set({ kind: e.target.value === 'door' || e.target.value === 'window' ? e.target.value : undefined })}>
                    <option value="">{t('wall.review.kind.all')}</option>
                    <option value="door">{t('wall.review.kind.door')}</option>
                    <option value="window">{t('wall.review.kind.window')}</option>
                  </select>
                </label>
                <label className={WALL_LABEL}>{t('wall.review.filter.level')}
                  <select className={WALL_FIELD} value={filter.level ?? ''} onChange={(e) => set({ level: e.target.value || undefined })}>
                    <option value="">{t('wall.review.level.all')}</option>
                    {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label className={WALL_LABEL}>{t('wall.review.filter.status')}
                  <select className={WALL_FIELD} value={filter.status ?? ''} onChange={(e) => set({ status: STATUSES.find((s) => s === e.target.value) })}>
                    <option value="">{t('wall.review.status.all')}</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{t(STATUS_KEY[s])}</option>)}
                  </select>
                </label>
              </fieldset>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {shown.length === 0 ? <p className="m-0 p-5 text-sm text-sky-200">{t('wall.review.none')}</p> : (
                <ul aria-label={t('wall.review.list')} className="m-0 list-none p-0">
                  {shown.map((x) => (
                    <SubReportReviewType
                      key={x.key} type={x} parts={partsOf} kept={kept} open={openKey === x.key}
                      onToggle={() => setOpenKey(openKey === x.key ? null : x.key)} actions={actions} onKeyDown={onRowKey}
                    />
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : <p className="m-0 p-5 text-sm text-sky-200">{t('wall.review.noSplit')}</p>}
        <footer className="shrink-0 border-t border-sky-300/15 px-5 py-2">
          <output className="m-0 block min-h-5 text-sm text-cyan-200">{note}</output>
          <p className="m-0 text-xs text-sky-300">{t('wall.review.hint')}</p>
        </footer>
      </dialog>
    </div>,
    document.body,
  );
}
