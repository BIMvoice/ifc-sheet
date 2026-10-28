/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The library file on the Wall: two buttons in the project drawer, "Import
 * library" and "Export library", and the panel each opens under them. The
 * file is read and merged by `catalogue/` (the same code the classic Library
 * tab calls); this holds only what the person sees and chooses. Nothing here
 * touches the drafting session, so a running tool is not fed anything; the
 * panel also keeps its keys (`data-owns-keys`), so Enter on one of its buttons
 * presses the button instead of finishing the running tool.
 */

import { useRef, useState } from 'react';
import { CATALOGUE_FILE_SUFFIX } from '@/catalogue/catalogue-file';
import { useTranslation } from '@/i18n';
import { LibraryExport } from './LibraryExport';
import { LibraryImport, readLibraryText, type ImportState } from './LibraryImport';
import { libraryAction } from './library-style';
import { SetTemplateSave } from './SetTemplate';

type Mode = 'import' | 'export' | 'setTemplate' | null;

export function LibraryPanel() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(null);
  const [state, setState] = useState<ImportState>({ step: 'empty' });
  const input = useRef<HTMLInputElement>(null);

  const choose = (): void => input.current?.click();
  const toggle = (next: Exclude<Mode, null>): void => {
    if (mode === next) {
      setMode(null);
      return;
    }
    setMode(next);
    if (next === 'import') {
      setState({ step: 'empty' });
      choose();
    }
  };

  return (
    <div className="px-4 pb-3" data-owns-keys>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={libraryAction} aria-pressed={mode === 'import'} onClick={() => toggle('import')}>{t('wall.lib.import')}</button>
        <button type="button" className={libraryAction} aria-pressed={mode === 'export'} onClick={() => toggle('export')}>{t('wall.lib.export')}</button>
        <button type="button" className={libraryAction} aria-pressed={mode === 'setTemplate'} onClick={() => toggle('setTemplate')}>{t('wall.setTemplate.save')}</button>
        <input
          ref={input}
          type="file"
          accept={`${CATALOGUE_FILE_SUFFIX},application/json`}
          aria-label={t('wall.lib.choose')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void file.text().then(
              (text) => setState(readLibraryText(text)),
              (err: unknown) => setState({ step: 'refused', detail: err instanceof Error ? err.message : String(err) }),
            );
          }}
        />
      </div>
      {mode === 'export' ? <LibraryExport /> : null}
      {mode === 'setTemplate' ? <SetTemplateSave /> : null}
      {mode === 'import' ? <LibraryImport state={state} onState={setState} onChoose={choose} /> : null}
    </div>
  );
}
