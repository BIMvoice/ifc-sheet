/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One type in the review by element (#186): the row that says which parts list it, and, opened, its elements and what to do about it
 * (merge into one of the parts that list it, move to another part, keep apart on purpose, check again). The status of every element is
 * the engine's (`SubReportCheck.elements`); this only shows it and calls the actions.
 */

import { keepId, type PartRef, type ReviewStatus, type ReviewType } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { WALL_PILL } from './wall-type';

export const STATUS_KEY: Record<ReviewStatus, TranslationKey> = {
  duplicate: 'wall.review.status.duplicate', gap: 'wall.review.status.gap', kept: 'wall.review.status.kept', ok: 'wall.review.status.ok',
};
/** The word is always written; the colour only helps. */
const BADGE: Record<ReviewStatus, string> = {
  duplicate: 'border-amber-300/60 bg-amber-400/15 text-amber-200',
  gap: 'border-rose-300/60 bg-rose-400/15 text-rose-200',
  kept: 'border-sky-300/50 bg-sky-400/15 text-sky-100',
  ok: 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200',
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const { t } = useTranslation();
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-2xs ${BADGE[status]}`}>{t(STATUS_KEY[status])}</span>;
}

export interface TypeActions {
  merge: (key: string, part: PartRef) => void;
  move: (key: string, part: PartRef) => void;
  keep: (key: string, ids: string[], label: string, again: boolean) => void;
}

interface Props {
  type: ReviewType;
  parts: readonly PartRef[];
  /** The ids the schedule keeps apart. */
  kept: readonly string[];
  open: boolean;
  onToggle: () => void;
  actions: TypeActions;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

const partNames = (parts: readonly PartRef[], none: string): string => (parts.length > 0 ? parts.map((p) => p.name).join(', ') : none);

export function SubReportReviewType({ type, parts, kept, open, onToggle, actions, onKeyDown }: Props) {
  const { t } = useTranslation();
  const panel = `review-${type.key}`;
  const row = t('wall.review.row', { label: type.label, status: t(STATUS_KEY[type.status]), count: type.elements.filter((e) => e.element).length, parts: partNames(type.parts, t('wall.review.noParts')) });
  const keptByType = kept.includes(keepId(type.key));
  const holders = new Set(type.parts.map((p) => p.id));
  const mergeInto = type.parts.length > 1 ? type.parts : [];
  const moveTo = parts.filter((p) => !holders.has(p.id));
  const hasDuplicate = type.elements.some((e) => e.status === 'duplicate');
  return (
    <li className="border-b border-sky-300/15 last:border-b-0">
      <button
        type="button" data-review-row={type.key} aria-expanded={open} aria-controls={panel} aria-label={row} onClick={onToggle} onKeyDown={onKeyDown}
        className="grid w-full grid-cols-[1.25rem_minmax(0,1.4fr)_auto_minmax(0,1.6fr)] items-center gap-3 px-3 py-2 text-left text-sm text-sky-100 hover:bg-sky-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="truncate font-medium text-white">{type.label}</span>
        <StatusBadge status={type.status} />
        <span className="truncate text-sky-200">{partNames(type.parts, t('wall.review.noParts'))}</span>
      </button>
      {open ? (
        <div id={panel} className="px-3 pb-3 pl-9">
          {type.elements.some((e) => e.element) ? (
            <table className="w-full border-collapse text-xs text-sky-100">
              <caption className="sr-only">{t('wall.review.elements', { label: type.label })}</caption>
              <thead>
                <tr className="text-left text-sky-300">
                  <th scope="col" className="py-1 pr-3 font-normal">{t('wall.review.col.mark')}</th>
                  <th scope="col" className="py-1 pr-3 font-normal">{t('wall.review.col.level')}</th>
                  <th scope="col" className="py-1 pr-3 font-normal">{t('wall.review.col.parts')}</th>
                  <th scope="col" className="py-1 pr-3 font-normal">{t('wall.review.col.status')}</th>
                  <th scope="col" className="py-1 text-right font-normal">{t('wall.review.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {type.elements.map((e) => (
                  <tr key={e.id} className="border-t border-sky-300/10">
                    <th scope="row" className="py-1 pr-3 text-left font-medium text-white">{e.element?.mark}</th>
                    <td className="py-1 pr-3">{e.element?.level}</td>
                    <td className="py-1 pr-3">{partNames(e.parts, t('wall.review.noParts'))}</td>
                    <td className="py-1 pr-3"><StatusBadge status={e.status} /></td>
                    <td className="py-1 text-right">
                      {e.status === 'kept' && keptByType ? <span className="text-sky-300">{t('wall.review.keptWithType')}</span> : null}
                      {e.status === 'duplicate' || (e.status === 'kept' && !keptByType) ? (
                        <button type="button" className={WALL_PILL} onClick={() => actions.keep(type.key, [e.id], `${type.label} ${e.element?.mark ?? ''}`.trim(), e.status === 'kept')}>
                          {t(e.status === 'kept' ? 'wall.review.resumeElement' : 'wall.review.keepElement')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="m-0 text-xs text-sky-200">{t('wall.review.noElement')}</p>}
          <div className="mt-3 flex flex-col gap-2">
            {mergeInto.length > 0 ? (
              <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
                <legend className="float-left mr-2 p-0 text-xs text-sky-200">{t('wall.review.merge')}</legend>
                {mergeInto.map((p) => <button key={p.id} type="button" className={WALL_PILL} onClick={() => actions.merge(type.key, p)}>{t('wall.review.mergeInto', { part: p.name })}</button>)}
              </fieldset>
            ) : null}
            {moveTo.length > 0 ? (
              <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
                <legend className="float-left mr-2 p-0 text-xs text-sky-200">{t('wall.review.move')}</legend>
                {moveTo.map((p) => <button key={p.id} type="button" className={WALL_PILL} onClick={() => actions.move(type.key, p)}>{t('wall.review.moveTo', { part: p.name })}</button>)}
              </fieldset>
            ) : null}
            {keptByType || hasDuplicate ? (
              <div>
                <button type="button" className={WALL_PILL} onClick={() => actions.keep(type.key, [keepId(type.key)], type.label, keptByType)}>
                  {t(keptByType ? 'wall.review.resumeType' : 'wall.review.keepType')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
