/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a sheet on the Wall says about its review: a small mark where each open
 * comment is pinned, and the count in the corner. A comment marked done leaves
 * no mark. It lies over the card, outside the sheet's paper, so it is never
 * part of what is printed.
 */

import { useTranslation } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { paperOf } from '@/project/sheets';
import type { ProjectSheet } from '@/project/types';
import { commentsOfSheet } from '@/review/actions';

const NONE: never[] = [];

export function CardMarks({ sheet, width }: { sheet: ProjectSheet; width: number }) {
  const { t } = useTranslation();
  const comments = useProjectStore((s) => s.comments) ?? NONE;
  const open = commentsOfSheet(comments, sheet.id).filter((c) => c.status === 'open');
  if (open.length === 0) return null;
  const k = width / paperOf(sheet).w;
  return (
    <div className="pointer-events-none absolute left-0 top-0" data-comment-marks>
      {open.map((c) => (
        <span key={c.id} data-comment-mark={c.id} aria-hidden className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-rose-500 shadow" style={{ left: c.x * k, top: c.y * k }} />
      ))}
      <output aria-label={t('review.badge', { name: `${sheet.number} ${sheet.name}`, count: open.length })} className="absolute -left-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white shadow-lg">
        {open.length}
      </output>
    </div>
  );
}
