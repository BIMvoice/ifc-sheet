/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bringing an office's own title block in (#458): a DXF or an SVG becomes the project's layout, the named fields are
 * placed on it, and it can be kept as a library item (a standards pack with the title block alone, `.bvlib`).
 */

import { useRef, useState } from 'react';
import { importTitleBlockDxf, importTitleBlockSvg, ownTitleBlockPack, PLACEABLE_FIELDS, TitleBlockImportError } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { CATALOGUE_FILE_SUFFIX } from '@/catalogue/catalogue-file';
import { downloadFile, sanitizeFilename } from '@/lib/export/download.js';
import { useProjectStore } from '@/project/project-store';
import { applyImportedTitleBlock, placeTemplateField } from '@/project/title-block-template-actions';
import { serializeStandardPack } from '@/standards/standard-pack-file';
import { WALL_PILL } from './wall-type';

const small = 'rounded border border-sky-300/30 bg-[#061a36] px-1.5 py-1 text-xs text-white';

export function TitleBlockImport() {
  const { t } = useTranslation();
  const template = useProjectStore((s) => s.titleBlockTemplate);
  const name = useProjectStore((s) => s.name);
  const input = useRef<HTMLInputElement>(null);
  const [field, setField] = useState<string>(PLACEABLE_FIELDS[0]);
  const [notes, setNotes] = useState<string[]>([]);
  const [refused, setRefused] = useState<string | null>(null);
  const read = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const imported = /\.svg$/i.test(file.name) ? importTitleBlockSvg(text) : importTitleBlockDxf(text);
      applyImportedTitleBlock(imported.template);
      setNotes(imported.notes);
      setRefused(null);
    } catch (err) {
      if (!(err instanceof TitleBlockImportError)) console.error('[title block import] failed:', err);
      setRefused(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <div className="mt-2">
      <button type="button" className={WALL_PILL} onClick={() => input.current?.click()}>{t('tblayout.import')}</button>
      <input
        ref={input} type="file" accept=".dxf,.svg" className="hidden" aria-label={t('tblayout.import.label')}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void read(file); }}
      />
      <p className="m-0 mt-1 text-xs leading-relaxed text-sky-200/80">{t('tblayout.import.hint')}</p>
      {refused ? <p role="alert" className="m-0 mt-1 text-xs text-amber-300">{t('tblayout.import.refused', { reason: refused })}</p> : null}
      {notes.length > 0 ? <ul className="m-0 mt-1 list-disc pl-4 text-xs text-sky-200">{notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
      {template ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <select aria-label={t('tblayout.field.pick')} className={small} value={field} onChange={(e) => setField(e.target.value)}>
            {PLACEABLE_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button type="button" className={WALL_PILL} onClick={() => placeTemplateField(field)}>{t('tblayout.field.place')}</button>
          <button
            type="button" className={WALL_PILL}
            onClick={() => downloadFile(serializeStandardPack(ownTitleBlockPack(template, name || t('tblayout.pack.name'))), `${sanitizeFilename(name || 'title-block', { fallback: 'title-block' })}${CATALOGUE_FILE_SUFFIX}`, 'application/json')}
          >{t('tblayout.pack.save')}</button>
        </div>
      ) : null}
    </div>
  );
}
