/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Feedback form on the Wall (#148). It sends nothing: Open GitHub opens a
 * pre-filled "new issue" page in a new tab, which the user submits with their
 * own account. The app holds no token and calls no GitHub API. The preview
 * shows the context that goes along, ticked part by ticked part.
 */

import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation, type TranslationKey } from '@/i18n';
import { collectFeedbackFacts } from '@/feedback/feedback-facts';
import { buildFeedbackUrl, feedbackContext, type FeedbackKind, type FeedbackParts } from '@/feedback/feedback-url';

const KINDS: { kind: FeedbackKind; labelKey: TranslationKey }[] = [
  { kind: 'bug', labelKey: 'feedback.kind.bug' },
  { kind: 'suggestion', labelKey: 'feedback.kind.suggestion' },
  { kind: 'question', labelKey: 'feedback.kind.question' },
];

const field = 'w-full rounded-md border border-sky-300/30 bg-[#061a36] px-2 py-1.5 text-sm text-white placeholder:text-sky-200/50';

function FeedbackForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Only the first part is on until the user ticks the rest.
  const [parts, setParts] = useState<FeedbackParts>({ environment: true, place: false });
  // Read when the form opens, so the preview and the link agree.
  const [facts] = useState(collectFeedbackFacts);
  const built = buildFeedbackUrl({ kind, title: title.trim(), description, parts }, facts);
  const ready = title.trim().length > 0;

  const send = (): void => {
    if (!ready) return;
    window.open(built.url, '_blank', 'noopener,noreferrer');
    onClose();
  };
  const preview: ReactNode = feedbackContext(parts, facts) || '—';

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <p className="m-0 text-xs leading-relaxed text-sky-200">{t('feedback.opens')}</p>
      <fieldset className="m-0 flex gap-4 border-0 p-0">
        <legend className="mb-1 text-xs text-sky-200">{t('feedback.kind')}</legend>
        {KINDS.map(({ kind: k, labelKey }) => (
          <label key={k} className="flex items-center gap-1.5 text-sm">
            <input type="radio" name="feedback-kind" checked={kind === k} onChange={() => setKind(k)} />
            {t(labelKey)}
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span className="text-sky-200">{t('feedback.field.title')}</span>
        {/* The title is what the form is for: it takes the keys at once. */}
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input autoFocus required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-sky-200">{t('feedback.field.description')}</span>
        <textarea rows={5} value={description} placeholder={t('feedback.descriptionPlaceholder')} onChange={(e) => setDescription(e.target.value)} className={field} />
      </label>
      <fieldset className="m-0 space-y-1.5 border-0 p-0 text-sm">
        <legend className="mb-1 text-xs text-sky-200">{t('feedback.attach')}</legend>
        <Checkbox label={t('feedback.attach.environment')} checked={parts.environment} onCheckedChange={(environment) => setParts({ ...parts, environment })} />
        <Checkbox label={t('feedback.attach.place')} checked={parts.place} onCheckedChange={(place) => setParts({ ...parts, place })} />
        <p className="m-0 text-xs text-sky-200/80">{t('feedback.never')}</p>
      </fieldset>
      <div>
        <p className="m-0 mb-1 text-xs text-sky-200">{t('feedback.preview')}</p>
        <pre data-feedback-preview className="m-0 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-[#061a36] p-2 text-xs text-sky-100">{preview}</pre>
      </div>
      {built.truncated ? <output className="block text-xs text-amber-300">{t('feedback.truncated')}</output> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full border border-sky-300/30 px-3 py-1 text-sm text-sky-100 hover:border-sky-300/70">{t('feedback.cancel')}</button>
        <button type="submit" disabled={!ready} className="rounded-full border border-sky-300/60 bg-sky-400/20 px-3 py-1 text-sm text-white hover:bg-sky-400/30 disabled:cursor-not-allowed disabled:opacity-50">{t('feedback.send')}</button>
      </div>
    </form>
  );
}

/** The Feedback button for the Wall header, and the form it opens. */
export function FeedbackButton({ className }: { className: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>{t('feedback.button')}</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg border-sky-300/20 bg-[#08214a] text-sky-50">
          <DialogHeader>
            <DialogTitle>{t('feedback.title')}</DialogTitle>
            <DialogDescription className="sr-only">{t('feedback.opens')}</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so each opening starts a fresh report with fresh facts. */}
          <FeedbackForm onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
