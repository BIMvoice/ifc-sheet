/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The comment tool's layer over a stepped-into sheet. It lies OUTSIDE the
 * sheet's paper SVG, on the screen only: the exports read the paper
 * (`svg[data-sheet-id]`) and never see a pin. With the tool armed a click
 * pins a comment (the drawing, the point and the element under it are kept),
 * the box takes the text, Enter saves it; pins show where comments are and
 * a click on one opens its conversation.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';
import type { Pt } from '@/drafting/types';
import { useViewDrawings } from '@/project/view-drawings';
import { useProjectStore } from '@/project/project-store';
import { renderIdGlobalId } from '@/project/element-guid';
import type { ProjectSheet } from '@/project/types';
import { addComment, commentsOfSheet } from '@/review/actions';
import { rememberAuthor, rememberedAuthor } from '@/review/author';
import { targetAtPaper } from '@/review/element-at';
import { reviewerName } from '@/review/identity';
import { setHighlight, setPlacing, useReviewUi } from '@/review/ui-store';
import type { PaperTarget } from '@/review/element-at';
import { CommentThread } from './CommentThread';

interface Pan { x: number; y: number; k: number }
const NO_COMMENTS: never[] = [];

function Composer({ sheet, at, target, pan }: { sheet: ProjectSheet; at: Pt; target: PaperTarget | null; pan: Pan }) {
  const { t } = useTranslation();
  const [name, setName] = useState(reviewerName());
  const [text, setText] = useState('');
  const askName = !rememberedAuthor();
  const save = (): void => {
    if (!text.trim()) return;
    if (askName && name.trim()) rememberAuthor(name.trim());
    const id = addComment({ sheetId: sheet.id, x: at.x, y: at.y, ...target, author: name.trim(), text: text.trim() });
    setPlacing(false);
    setHighlight(id);
  };
  return (
    <div data-owns-keys className="absolute z-30 flex w-64 flex-col gap-1.5 rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 shadow-xl" style={{ left: at.x * pan.k + pan.x + 14, top: at.y * pan.k + pan.y - 10 }} onPointerDown={(e) => e.stopPropagation()}>
      {askName ? <input type="text" value={name} aria-label={t('review.name')} placeholder={t('review.name')} className="rounded border border-zinc-300 px-2 py-1" onChange={(e) => setName(e.target.value)} /> : null}
      <input
        // The reviewer asked for this box by clicking: it takes the keys at once.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        type="text"
        value={text}
        aria-label={t('review.text')}
        placeholder={t('review.placeholder')}
        className="rounded border border-zinc-300 px-2 py-1"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
        }}
      />
    </div>
  );
}

export function CommentLayer({ sheet, pan, toPaper }: { sheet: ProjectSheet; pan: Pan; toPaper: (clientX: number, clientY: number) => Pt }) {
  const { t } = useTranslation();
  const comments = useProjectStore((s) => s.comments) ?? NO_COMMENTS;
  const { placing, highlight } = useReviewUi();
  const [draft, setDraft] = useState<{ at: Pt; target: PaperTarget | null } | null>(null);
  // A pin placed or abandoned: the next time the tool is armed starts clean.
  useEffect(() => {
    if (!placing) setDraft(null);
  }, [placing]);
  const mine = commentsOfSheet(comments, sheet.id);
  const lit = mine.find((c) => c.id === highlight) ?? null;
  const pointOf = (c: { x: number; y: number }) => ({ left: c.x * pan.k + pan.x, top: c.y * pan.k + pan.y });

  return (
    <>
      {placing ? (
        <div
          data-comment-capture
          className="absolute inset-0 z-20 cursor-crosshair"
          onPointerDown={(e) => {
            e.stopPropagation();
            const at = toPaper(e.clientX, e.clientY);
            const byView = useViewDrawings.getState().byView;
            setDraft({ at, target: targetAtPaper(sheet, at, (id) => byView[id]?.drawing ?? null, renderIdGlobalId) });
          }}
        />
      ) : null}
      {mine.map((c, i) => (
        <button
          key={c.id}
          type="button"
          data-comment-pin={c.id}
          data-status={c.status}
          aria-label={t('review.pin', { n: i + 1, author: c.author || t('review.anon') })}
          className={`absolute z-20 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs font-semibold shadow ${c.status === 'done' ? 'border-zinc-400 bg-zinc-200 text-zinc-500' : 'border-white bg-rose-500 text-white'} ${c.id === highlight ? 'ring-4 ring-sky-400' : ''}`}
          style={pointOf(c)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setHighlight(c.id === highlight ? null : c.id)}
        >
          {i + 1}
        </button>
      ))}
      {lit ? (
        <div className="absolute z-30" style={{ left: pointOf(lit).left + 18, top: pointOf(lit).top - 12 }} onPointerDown={(e) => e.stopPropagation()}>
          <CommentThread comment={lit} onClose={() => setHighlight(null)} />
        </div>
      ) : null}
      {placing && draft ? <Composer sheet={sheet} at={draft.at} target={draft.target} pan={pan} /> : null}
    </>
  );
}
