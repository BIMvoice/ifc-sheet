/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The start page: what a visitor sees before any model is open. It says what
 * comes out of an IFC file, shows a sheet the app drew, and puts opening your
 * own IFC first: the whole page takes a dropped file. The demo project comes
 * second and the set templates wait behind one line.
 *
 * The sheet shown is A-101 of the demo project. To draw it again after the
 * drawings change:
 *   ifcsheet build apps/viewer/public/samples/bloc-p4.ifc --out set.pdf --annotate --locale en
 *   pdftoppm -r 60 -f 1 -l 1 -png set.pdf a101 && cwebp -lossless a101-1.png -o apps/viewer/public/start/a-101.webp
 */

import { useState, type DragEvent } from 'react';
import { FileUp, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { EVENT_LOAD_FILE } from '@/lib/tours/events';
import { MODEL_FILE_EXTENSIONS } from '@/services/supported-model-files';
import { useSetTemplates } from '@/set-template/store';
import { openDemoModel } from '../ifcsheet/demo-model';
import { NewFromTemplate } from './SetTemplate';
import { WALL_EYEBROW } from './wall-type';

/** The IFC family, taken from the one list of what the loader reads: this page offers nothing else. */
export const IFC_FILE_EXTENSIONS: readonly string[] = MODEL_FILE_EXTENSIONS.filter((ext) => ext.startsWith('.ifc'));
const IFC_FORMATS = IFC_FILE_EXTENSIONS.join(' ');
const SHEET_PREVIEW = '/start/a-101.webp';

const isIfcFile = (file: File): boolean => IFC_FILE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
const carriesFiles = (e: DragEvent): boolean => [...(e.dataTransfer?.types ?? [])].includes('Files');
const openDemo = (): void => void openDemoModel().catch((err: unknown) => console.warn('[ifcsheet] could not open the demo project', err));

export function WallStart() {
  const { t } = useTranslation();
  const armed = useSetTemplates((s) => s.pending !== null);
  const [over, setOver] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [templates, setTemplates] = useState(false);

  /** Open the file when it is IFC; say why not when it is something else. */
  const open = (file: File | undefined): void => {
    if (!file) return;
    if (!isIfcFile(file)) {
      setRefused(file.name);
      return;
    }
    setRefused(null);
    window.dispatchEvent(new CustomEvent(EVENT_LOAD_FILE, { detail: file }));
  };

  return (
    <div
      data-testid="wall-start"
      className="h-full overflow-y-auto"
      onDragOver={(e) => {
        if (!carriesFiles(e)) return;
        // Without this the browser leaves the app to show the dropped file.
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setOver(false);
      }}
      onDrop={(e) => {
        if (!carriesFiles(e)) return;
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files];
        open(files.find(isIfcFile) ?? files[0]);
      }}
    >
      <div className="mx-auto grid min-h-full max-w-7xl items-center gap-x-14 gap-y-10 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="max-w-xl">
          <p className={WALL_EYEBROW}>{t('wall.start.eyebrow')}</p>
          <h1 className="m-0 mt-4 text-4xl font-light leading-tight text-white sm:text-5xl">
            {t('wall.start.titleStart')}
            <br />
            <span className="text-sky-400">{t('wall.start.titleEnd')}</span>
          </h1>
          <p className="m-0 mt-5 text-base leading-relaxed text-sky-100/80">{t('wall.start.body')}</p>

          <label
            data-testid="wall-start-drop"
            data-over={over || undefined}
            className={`mt-8 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-within:border-sky-300 ${over ? 'border-sky-300 bg-sky-400/15' : 'border-sky-300/40 bg-sky-400/5 hover:border-sky-300/80 hover:bg-sky-400/10'}`}
          >
            <FileUp className="size-7 text-sky-300" aria-hidden="true" />
            <span className="text-lg text-white">{t(over ? 'wall.start.dropNow' : 'wall.start.drop')}</span>
            <span className="rounded-md bg-sky-600 px-5 py-2.5 text-base text-white">{t('wall.start.choose')}</span>
            <span className="text-xs text-sky-200/70">{IFC_FORMATS}</span>
            <input
              type="file"
              accept={IFC_FILE_EXTENSIONS.join(',')}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                open(file);
              }}
            />
          </label>
          {refused ? <p role="alert" className="m-0 mt-3 text-sm text-amber-300">{t('wall.start.notIfc', { name: refused, formats: IFC_FORMATS })}</p> : null}

          <button type="button" className="mt-4 w-full max-w-xl rounded-md border border-sky-300/30 px-4 py-2.5 text-center text-sm text-sky-100 hover:border-sky-300/70 hover:text-white" onClick={openDemo}>
            {t('wall.demo')}
          </button>

          <p className="m-0 mt-5 flex items-center gap-2 text-xs text-sky-200/70">
            <ShieldCheck className="size-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            {t('keyboardShortcuts.privacy.banner')}
          </p>

          <details className="mt-6 border-t border-sky-300/10 pt-4" open={templates || armed} onToggle={(e) => setTemplates(e.currentTarget.open)}>
            <summary className="cursor-pointer text-sm text-sky-200/80 hover:text-white">{t('wall.start.templates')}</summary>
            <div className="mt-4 flex justify-center"><NewFromTemplate /></div>
          </details>
        </div>

        <figure className="m-0">
          <button type="button" aria-label={t('wall.start.previewOpen')} title={t('wall.start.previewOpen')} className="block w-full rounded-sm bg-white p-0 shadow-2xl ring-1 ring-sky-300/20 transition-transform hover:-translate-y-1" onClick={openDemo}>
            <img src={SHEET_PREVIEW} alt={t('wall.start.previewAlt')} width={1404} height={993} className="block h-auto w-full rounded-sm" />
          </button>
          <figcaption className="mt-4 text-xs leading-relaxed text-sky-200/70">{t('wall.start.previewCaption')}</figcaption>
        </figure>
      </div>
    </div>
  );
}
