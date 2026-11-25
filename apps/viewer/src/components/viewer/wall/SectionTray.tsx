/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The tray under a sheet of sections: the sections the model suggests, named
 * after what they pass through. Picking one shows it in the chosen slot; the
 * section and its symbol on the plan are made the first time it is picked.
 *
 * A model with a handful of sections gets them as a row of buttons. A large
 * one suggests a section through every room (89 on a school), which as buttons
 * stood taller than the window and pushed the sheet off it: past
 * {@link TRAY_BUTTONS_AT_MOST} the tray is one button that opens a list with
 * its own scroll and a search, over the sheet, closed by Esc or a click
 * outside it.
 */

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { sectionForProposal, swapViewportView } from '@/project/drawing-set-actions';
import { useProjectStore } from '@/project/project-store';
import type { SectionProposal } from '@/project/section-proposals';
import type { ProjectSheet } from '@/project/types';

/** The most sections laid out as buttons; more go in a list (two rows of buttons at the widths a laptop has). */
export const TRAY_BUTTONS_AT_MOST = 10;

/** How tall the list of sections may grow before it scrolls: never more than half the window. */
const LIST_MAX_HEIGHT = 'min(24rem, 50vh)';

interface TrayProps { sheet: ProjectSheet; slotId: string | null; proposals: readonly SectionProposal[] }

export function SectionTray({ sheet, slotId, proposals }: TrayProps) {
  const { t } = useTranslation();
  const views = useProjectStore((s) => s.views);
  const placed = new Set((sheet.viewports ?? []).map((vp) => vp.viewId));
  const onSheet = (p: SectionProposal) => views.some((v) => v.kind === 'section' && v.through === p.label && placed.has(v.id));
  if (proposals.length === 0) return null;
  const show = (p: SectionProposal): void => {
    const viewId = slotId ? sectionForProposal(p) : null;
    if (slotId && viewId) swapViewportView(sheet.id, slotId, viewId);
  };
  return (
    <div className="flex items-center gap-4 rounded-xl border border-sky-300/20 bg-sky-950/60 px-5 py-3">
      <span className="max-w-[9rem] text-2xs font-medium uppercase leading-relaxed tracking-widest text-sky-200/70">{t('wall.tray')}</span>
      {proposals.length > TRAY_BUTTONS_AT_MOST ? (
        <SectionList proposals={proposals} slotId={slotId} onSheet={onSheet} onShow={show} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {proposals.map((p) => {
            const shown = onSheet(p);
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={shown}
                disabled={!slotId || shown}
                title={slotId ? undefined : t('wall.pickSlot')}
                onClick={() => show(p)}
                className={cn(
                  'relative rounded-lg border px-4 py-3 text-sm transition-colors',
                  shown ? 'border-sky-400 bg-sky-500/20 text-white' : 'border-sky-300/30 text-sky-100 hover:border-sky-300/80 disabled:opacity-50',
                )}
              >
                {p.label}
                {shown ? <span className="absolute -top-2 right-2 rounded-full bg-sky-500 px-2 text-2xs text-white">{t('wall.inSheet')}</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ListProps {
  proposals: readonly SectionProposal[];
  slotId: string | null;
  onSheet: (p: SectionProposal) => boolean;
  onShow: (p: SectionProposal) => void;
}

/** One button for many sections, and the list it opens above itself. */
function SectionList({ proposals, slotId, onSheet, onShow }: ListProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const close = (refocus: boolean): void => {
    setOpen(false);
    setQuery('');
    if (refocus) toggle.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    // A press anywhere outside the tray closes the list; the sheet under it takes the press as usual.
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && host.current?.contains(e.target)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  const needle = query.trim().toLocaleLowerCase();
  const found = needle ? proposals.filter((p) => p.label.toLocaleLowerCase().includes(needle)) : proposals;
  // Esc in the list, or on its button while the list is open, closes the list.
  const onEscape = (e: KeyboardEvent<HTMLElement>): void => {
    if (!open || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close(true);
  };
  return (
    // While the list is open the tray keeps its keys (`data-owns-keys`): Esc closes the list and nothing else.
    <div ref={host} className="relative" data-owns-keys={open ? '' : undefined}>
      <button
        ref={toggle}
        type="button"
        data-section-tray-more
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onEscape}
        className={cn('rounded-lg border px-4 py-3 text-sm transition-colors', open ? 'border-sky-400 bg-sky-500/20 text-white' : 'border-sky-300/30 text-sky-100 hover:border-sky-300/80')}
      >
        {t('sectionTray.open', { count: proposals.length })}
      </button>
      {open ? (
        // A dialog that is not modal: open in place above its button, the sheet still there around it.
        <dialog
          open
          id={listId}
          aria-label={t('wall.tray')}
          data-section-tray-list
          onKeyDown={onEscape}
          className="absolute bottom-full left-1/2 right-auto z-30 m-0 mb-2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-sky-300/30 bg-sky-950 p-3 text-sky-100 shadow-2xl"
        >
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sectionTray.find')}
            aria-label={t('sectionTray.find')}
            className="w-full rounded-md border border-sky-300/30 bg-sky-900/60 px-3 py-2 text-sm text-white placeholder:text-sky-200/50"
          />
          {slotId ? null : <p className="mt-2 text-xs text-sky-200/80">{t('wall.pickSlot')}</p>}
          <ul className="mt-2 flex flex-col gap-1 pr-1" style={{ maxHeight: LIST_MAX_HEIGHT, overflowY: 'auto' }}>
            {found.map((p) => {
              const shown = onSheet(p);
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    aria-pressed={shown}
                    disabled={!slotId || shown}
                    onClick={() => {
                      onShow(p);
                      close(true);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm',
                      shown ? 'bg-sky-500/20 text-white' : 'text-sky-100 hover:bg-sky-800/60 disabled:opacity-50',
                    )}
                  >
                    <span className="min-w-0 truncate">{p.label}</span>
                    {shown ? <span className="shrink-0 rounded-full bg-sky-500 px-2 text-2xs text-white">{t('wall.inSheet')}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {found.length === 0 ? <p className="mt-2 text-sm text-sky-200/80">{t('sectionTray.none')}</p> : null}
        </dialog>
      ) : null}
    </div>
  );
}
