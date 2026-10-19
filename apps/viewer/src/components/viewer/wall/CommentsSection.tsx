/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawer's review section: the open comments of the set, grouped by sheet
 * with a count each, closed and reopened here; a click steps into the sheet
 * and lights the pin. The comments that lie on a model element go out as a
 * BCF file, and a BCF file's topics about elements on the sheets come in as
 * comments (`review/bcf.ts`).
 */

import { useRef, useState } from 'react';
import { readBCF, writeBCF } from '@ifc-lite/bcf';
import { bcfWorldOffset } from '@/hooks/bcf/viewpoint-world-frame';
import { useTranslation } from '@/i18n';
import { downloadBlob, sanitizeFilename } from '@/lib/export/download';
import { renderIdGlobalId } from '@/project/element-guid';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import { useViewDrawings } from '@/project/view-drawings';
import { bcfToComments, commentsToBcf, exportableComments } from '@/review/bcf';
import { openCount, setCommentStatus } from '@/review/actions';
import { setHighlight } from '@/review/ui-store';
import { useViewerStore } from '@/store';

const action = 'rounded-full border border-sky-300/30 px-3 py-1 text-xs text-sky-100 hover:border-sky-300/70';
const NONE: never[] = [];

export function CommentsSection({ onGo }: { onGo: (sheetId: string) => void }) {
  const { t } = useTranslation();
  const comments = useProjectStore((s) => s.comments) ?? NONE;
  const sheets = useProjectStore((s) => s.sheets);
  const [showDone, setShowDone] = useState(false);
  const [note, setNote] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const shown = comments.filter((c) => showDone || c.status === 'open');

  const drawingOf = (viewId: string) => useViewDrawings.getState().byView[viewId]?.drawing ?? null;
  const exportBcf = async (): Promise<void> => {
    const state = useProjectStore.getState();
    const onElement = exportableComments(comments);
    if (onElement.length === 0) {
      setNote(t('review.bcf.none'));
      return;
    }
    const viewer = useViewerStore.getState();
    const project = commentsToBcf(comments, { sheets: state.sheets, drawingOf, worldOffset: bcfWorldOffset(viewer.models, viewer.geometryResult), projectName: state.name });
    downloadBlob(await writeBCF(project), `${sanitizeFilename(state.name, { fallback: 'project' })}-comments.bcfzip`);
    setNote(t('review.bcf.exported', { count: onElement.length, total: comments.length }));
  };
  const importBcf = async (file: File): Promise<void> => {
    try {
      const state = useProjectStore.getState();
      const result = bcfToComments(await readBCF(file), state.comments ?? [], { sheets: state.sheets, drawingOf, guidOf: renderIdGlobalId, newId: () => freshProjectId('comment') });
      if (result.comments.length) useProjectStore.setState({ comments: [...(state.comments ?? []), ...result.comments], dirty: true });
      setNote(t('review.bcf.imported', { count: result.comments.length, unplaced: result.unplaced }));
    } catch (err) {
      console.warn('[ifcsheet] could not read the BCF file', err);
      setNote(t('review.bcf.failed'));
    }
  };

  return (
    <section className="border-t border-sky-300/10 px-4 py-3" data-owns-keys>
      <h3 className="m-0 mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.25em] text-cyan-400">
        {t('review.title')}
        <span className="rounded-full bg-rose-500 px-1.5 text-xs normal-case tracking-normal text-white" data-open-total>{openCount(comments)}</span>
      </h3>
      {shown.length === 0 ? <p className="m-0 text-xs text-sky-200/70">{t('review.empty')}</p> : null}
      {sheets.map((sheet) => {
        const mine = shown.filter((c) => c.sheetId === sheet.id);
        if (mine.length === 0) return null;
        return (
          <div key={sheet.id} className="mb-2" data-review-sheet={sheet.id}>
            <p className="m-0 text-xs font-semibold text-white">{sheet.number} <span className="font-normal text-sky-200/80">{t('review.openCount', { count: openCount(comments, sheet.id) })}</span></p>
            <ul className="m-0 list-none p-0">
              {mine.map((c) => (
                <li key={c.id} className="flex items-center gap-1 rounded-md hover:bg-sky-400/10">
                  <button type="button" onClick={() => { onGo(sheet.id); setHighlight(c.id); }} className={`min-w-0 flex-1 truncate px-2 py-1 text-left text-sm ${c.status === 'done' ? 'text-sky-200/50 line-through' : 'text-sky-50'}`}>
                    {c.text}
                  </button>
                  <button type="button" className={action} onClick={() => setCommentStatus(c.id, c.status === 'done' ? 'open' : 'done')}>{c.status === 'done' ? t('review.reopen') : t('review.done')}</button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className={action} aria-pressed={showDone} onClick={() => setShowDone((x) => !x)}>{t('review.showDone')}</button>
        <button type="button" className={action} onClick={() => void exportBcf()}>{t('review.bcf.export')}</button>
        <button type="button" className={action} onClick={() => fileInput.current?.click()}>{t('review.bcf.import')}</button>
        <input ref={fileInput} type="file" accept=".bcf,.bcfzip" aria-label={t('review.bcf.import')} className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importBcf(file);
        }} />
      </div>
      {note ? <output className="m-0 mt-2 block text-xs text-sky-200/80">{note}</output> : null}
    </section>
  );
}
