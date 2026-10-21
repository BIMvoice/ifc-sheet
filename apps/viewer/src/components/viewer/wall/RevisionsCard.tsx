/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's revisions on the Wall: each record's code, date, description
 * and author, and whether this sheet lists it. Also the choice of the revision a
 * new cloud belongs to (`RevisionPick`). The logic is `project/revision-actions.ts`.
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { addRevision, removeRevision, revisionCloudCount, updateRevision } from '@/project/revision-actions';
import { chooseCloudRevision, cloudRevisionNow, useRevisionTool } from '@/project/revision-tool';
import { sheetRevisions } from '@/project/revisions';
import { addSheetRevision, removeSheetRevision } from '@/project/sheets';
import type { ProjectRevision, ProjectSheet } from '@/project/types';
import { WALL_CARD, WALL_FIELD, WALL_PILL } from './wall-type';

const field = WALL_FIELD;
const quiet = WALL_PILL;

function Text({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  return (
    <label className="block text-xs text-sky-200">
      {label}
      <input key={value} aria-label={label} className={field} defaultValue={value} onBlur={(e) => onCommit(e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

function Record({ record, sheet, byCloud }: { record: ProjectRevision; sheet: ProjectSheet; byCloud: boolean }) {
  const { t } = useTranslation();
  const listed = byCloud || (sheet.revisionIds ?? []).includes(record.id);
  // Removing takes every cloud of the revision with it, on every sheet: asked first, and one Undo brings it all back.
  const [asking, setAsking] = useState(false);
  return (
    <li className="mt-3 rounded-xl border border-sky-300/20 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Text label={t('revision.code')} value={record.code} onCommit={(code) => updateRevision(record.id, { code })} />
        <Text label={t('revision.date')} value={record.date} onCommit={(date) => updateRevision(record.id, { date })} />
      </div>
      <div className="mt-2"><Text label={t('revision.description')} value={record.description} onCommit={(description) => updateRevision(record.id, { description })} /></div>
      <div className="mt-2"><Text label={t('revision.by')} value={record.by} onCommit={(by) => updateRevision(record.id, { by })} /></div>
      <label className="mt-2 flex items-center gap-2 text-sm text-sky-100">
        <input type="checkbox" checked={listed} disabled={byCloud} onChange={(e) => (e.target.checked ? addSheetRevision(sheet.id, record.id) : removeSheetRevision(sheet.id, record.id))} />
        {t('revision.onSheet')}
      </label>
      {byCloud ? <p className="m-0 mt-1 text-xs text-sky-300/80">{t('revision.byCloud')}</p> : null}
      {asking ? (
        <fieldset aria-label={t('revision.remove')} className="m-0 mt-2 border-0 p-0">
          <p className="m-0 text-xs text-amber-300">{t('revision.remove.ask', { code: record.code, count: revisionCloudCount(record.id) })}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={quiet} onClick={() => { setAsking(false); removeRevision(record.id); }}>{t('revision.remove.yes')}</button>
            <button type="button" className={quiet} onClick={() => setAsking(false)}>{t('revision.remove.no')}</button>
          </div>
        </fieldset>
      ) : (
        <button type="button" className={`${quiet} mt-2`} onClick={() => setAsking(true)}>{t('revision.remove')}</button>
      )}
    </li>
  );
}

/** This sheet's revisions card: the records, and the choice of which this sheet lists. */
export function RevisionsCard({ sheet, onClose }: { sheet: ProjectSheet; onClose: () => void }) {
  const { t } = useTranslation();
  const revisions = useProjectStore((s) => s.revisions) ?? [];
  const drafts = useProjectStore((s) => s.drafts);
  const named = new Set(sheetRevisions({ ...sheet, revisionIds: [] }, { revisions, drafts }).map((r) => r.id));
  return (
    <aside aria-label={t('revision.title')} className={`max-h-[calc(100vh-12rem)] overflow-y-auto ${WALL_CARD}`}>
      <p className="m-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('revision.title')}</p>
      <p className="mb-2 mt-2 text-sm leading-relaxed text-sky-200">{t('revision.card.hint')}</p>
      {revisions.length === 0 ? <p className="m-0 text-sm">{t('revision.empty')}</p> : null}
      <ul className="m-0 list-none p-0">{revisions.map((r) => <Record key={r.id} record={r} sheet={sheet} byCloud={named.has(r.id)} />)}</ul>
      <div className="mt-4 flex gap-2">
        <button type="button" className={quiet} onClick={() => { const id = addRevision(); addSheetRevision(sheet.id, id); }}>{t('revision.add')}</button>
        <button type="button" className={quiet} onClick={onClose}>{t('revision.done')}</button>
      </div>
    </aside>
  );
}

/** The revision a new cloud belongs to: one of the records, the latest unless chosen. */
export function RevisionPick() {
  const { t } = useTranslation();
  const revisions = useProjectStore((s) => s.revisions) ?? [];
  useRevisionTool((s) => s.revisionId);
  if (revisions.length === 0) return <p className="m-0 mt-3 text-sm text-amber-300">{t('revision.msg.none')}</p>;
  return (
    <label className="mt-3 block text-xs text-sky-200">
      {t('revision.cloudFor')}
      <select className={field} value={cloudRevisionNow() ?? ''} onChange={(e) => chooseCloudRevision(e.target.value)}>
        {revisions.map((r) => <option key={r.id} value={r.id}>{r.code}{r.description ? ` · ${r.description}` : ''}</option>)}
      </select>
    </label>
  );
}
