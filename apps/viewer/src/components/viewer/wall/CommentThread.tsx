/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One comment as a conversation: who wrote it, what it says, its replies, a
 * reply box, and the buttons that close and reopen it. The panel keeps its
 * keys (`data-owns-keys`): what is typed here never reaches a drawing tool.
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { removeComment, replyToComment, setCommentStatus } from '@/review/actions';
import { reviewerName } from '@/review/identity';
import type { ReviewComment } from '@/review/types';

const button = 'rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs text-zinc-700 hover:border-zinc-500';

export function CommentThread({ comment, onClose }: { comment: ReviewComment; onClose: () => void }) {
  const { t } = useTranslation();
  const [reply, setReply] = useState('');
  const done = comment.status === 'done';
  const who = (name: string) => name || t('review.anon');
  return (
    <div data-owns-keys className="w-72 rounded-md border border-zinc-300 bg-white p-3 text-left text-sm text-zinc-900 shadow-xl">
      <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
        <strong className="text-zinc-800">{who(comment.author)}</strong>
        <span className={done ? 'text-emerald-700' : 'text-sky-700'}>{done ? t('review.status.done') : t('review.status.open')}</span>
        {comment.elementGuid ? <span title={comment.elementGuid}>{t('review.onElement')}</span> : null}
      </div>
      <p className="m-0 whitespace-pre-wrap break-words">{comment.text}</p>
      {comment.replies.map((r) => (
        <p key={r.id} className="m-0 mt-2 whitespace-pre-wrap break-words border-t border-zinc-200 pt-2">
          <strong className="mr-1 text-xs text-zinc-700">{who(r.author)}</strong>
          {r.text}
        </p>
      ))}
      <input
        type="text"
        value={reply}
        aria-label={t('review.reply')}
        placeholder={t('review.replyPlaceholder')}
        className="mt-2 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
        onChange={(e) => setReply(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !reply.trim()) return;
          replyToComment(comment.id, reviewerName(), reply);
          setReply('');
        }}
      />
      <div className="mt-2 flex gap-2">
        <button type="button" className={button} onClick={() => setCommentStatus(comment.id, done ? 'open' : 'done')}>{done ? t('review.reopen') : t('review.done')}</button>
        <button type="button" className={button} onClick={() => { removeComment(comment.id); onClose(); }}>{t('review.delete')}</button>
        <span className="flex-1" />
        <button type="button" className={button} onClick={onClose}>{t('review.close')}</button>
      </div>
    </div>
  );
}
