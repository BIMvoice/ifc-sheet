/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project, in IfcSheet's own terms: a drawer over the left of the Wall
 * listing the sheets (by series), the drawings (plans, sections, elevations),
 * the schedules and the legends. A click goes there: a sheet is stepped into, a drawing
 * is brought forward on the sheet it hangs on (hung first if it is not), a
 * schedule likewise. Double-click renames, the cross deletes. New, open and
 * save the project file are at the top; the title block every sheet prints
 * is filled under the sheets.
 *
 * The drawer is the frame (header, the project file buttons, the recovery offer); everything under them is a
 * section registered from its own file in `./drawer-sections/` (#144).
 */

import { useRef } from 'react';
import { X } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { useTranslation } from '@/i18n';
import type { ModelExtent } from '@/project/drawing-set';
import { projectOpenErrorText } from '@/project/open-error';
import { requestNewProject } from '@/project/new-project';
import { exportProjectFile, importProjectFile, openProjectDocument, PROJECT_FILE_SUFFIX } from '@/project/project-file';
import { projectDocument, useProjectStore } from '@/project/project-store';
import { RecoveryOffer } from './RecoveryOffer';
import { stepInto } from './wall-nav';
import { DrawerSections } from './drawer-sections/DrawerSections';
import { action } from './drawer-sections/parts';

export function ProjectDrawer({ extent, onClose }: { extent: ModelExtent | null; onClose: () => void }) {
  const { t } = useTranslation();
  const name = useProjectStore((s) => s.name);
  const fileInput = useRef<HTMLInputElement>(null);

  const go = (sheetId: string | null, focus: string | null = null): void => {
    if (!sheetId) return;
    stepInto(sheetId, focus);
    onClose();
  };
  const context = { go, onClose, extent };
  return (
    <aside aria-label={t('wall.project.title')} className="absolute inset-y-0 left-0 z-20 flex w-80 flex-col border-r border-sky-300/20 bg-[#08214a]/98 text-sky-50 shadow-2xl">
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-2xs uppercase tracking-widest text-cyan-400">{t('wall.project.title')}</p>
          <p className="m-0 truncate text-base text-white">{name}</p>
        </div>
        <button type="button" aria-label={t('wall.add.close')} onClick={onClose} className="rounded p-1 text-sky-200 hover:bg-sky-400/20"><X className="size-4" /></button>
      </header>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        <button type="button" className={action} onClick={requestNewProject}>{t('wall.project.new')}</button>
        <button type="button" className={action} onClick={() => fileInput.current?.click()}>{t('wall.project.open')}</button>
        <button type="button" className={action} onClick={() => { exportProjectFile(projectDocument()); useProjectStore.setState({ dirty: false }); }}>{t('wall.shell.saveProject')}</button>
        <input ref={fileInput} type="file" accept={`${PROJECT_FILE_SUFFIX},application/json`} className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importProjectFile(file).then((doc) => openProjectDocument(doc, { dirty: false })).catch((err: unknown) => { console.warn('[ifcsheet] could not open the project file', err); toast.error(projectOpenErrorText(err, t)); });
        }} />
      </div>
      <div className="px-4"><RecoveryOffer /></div>
      <DrawerSections slot="top" context={context} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <DrawerSections slot="body" context={context} />
      </div>
    </aside>
  );
}
