/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Set templates as the Wall shows them (#21): the words of a note, saving the
 * open project as a template (the project drawer), choosing one for a new
 * project (the empty Wall) and what applying one said (the page the set arrives
 * on). The rules, the file and the start are in `set-template/`.
 */

import { useState } from 'react';
import { SET_TEMPLATE_FILE_SUFFIX, pacRuralSetTemplate, pacSetTemplate, parseSetTemplate, serializeSetTemplate, type SetTemplate } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { downloadFile, sanitizeFilename } from '@/lib/export/download';
import { EVENT_LOAD_FILE } from '@/lib/tours/events';
import { useProjectStore } from '@/project/project-store';
import { captureProjectTemplate } from '@/set-template/capture';
import { armTemplate, forgetTemplate, keepTemplate, useSetTemplates } from '@/set-template/store';
import { libraryAction } from './library-style';

const FIELD = 'rounded border border-sky-300/40 bg-[#061a36] px-1.5 py-1 text-xs text-white';

/** A note in words: the engine's key and parameters, the series and direction in the installed language. */
function useSayNote(): (key: string, params: Record<string, string | number>) => string {
  const { t } = useTranslation();
  return (key, params) => {
    const say = { ...params };
    if (typeof say.series === 'string') say.series = t(`draftSet.kind.${say.series}` as TranslationKey);
    if (typeof say.direction === 'string') say.direction = t(`setTemplate.dir.${say.direction}` as TranslationKey);
    return t(key as TranslationKey, say);
  };
}

const templateFileName = (name: string): string => `${sanitizeFilename(name, { fallback: 'set-template' })}${SET_TEMPLATE_FILE_SUFFIX}`;

/** Save the open project as a set template: a name, what the rules are, a file to download and a copy to keep in this browser. */
export function SetTemplateSave() {
  const { t } = useTranslation();
  const projectName = useProjectStore((s) => s.name);
  const [name, setName] = useState(projectName);
  const [done, setDone] = useState<string | null>(null);
  // Read when the panel is open: the rules follow the project as it is now.
  const template: SetTemplate = captureProjectTemplate(name.trim() || projectName);
  const slots = template.sheets.reduce((n, s) => n + s.slots.length, 0);
  const commands = [...new Set(Object.values(template.annotations).flat())].map((c) => c.toUpperCase());
  const file = templateFileName(template.name);
  return (
    <section aria-label={t('wall.setTemplate.save')} className="mt-2 max-h-[50vh] overflow-y-auto rounded-lg border border-sky-300/20 bg-[#061a36]/60 p-3">
      <p className="m-0 text-xs text-sky-200">{t('wall.setTemplate.saveHint')}</p>
      <label className="mt-2 flex items-center gap-2 text-xs text-sky-200">
        <span>{t('wall.setTemplate.name')}</span>
        <input className={`${FIELD} min-w-0 flex-1`} value={name} onChange={(e) => { setName(e.target.value); setDone(null); }} />
      </label>
      {slots === 0 ? (
        <p className="m-0 mt-2 text-xs text-amber-300">{t('wall.setTemplate.nothing')}</p>
      ) : (
        <>
          <p className="m-0 mt-2 text-xs text-white" data-testid="set-template-summary">{t('wall.setTemplate.summary', { sheets: template.sheets.length + template.schedules.length, slots, schedules: template.schedules.length })}</p>
          {commands.length > 0 ? <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.setTemplate.annotations', { commands: commands.join(', ') })}</p> : null}
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" disabled={slots === 0} className={`${libraryAction} border-cyan-400/60 text-cyan-300 disabled:opacity-40`} onClick={() => { downloadFile(serializeSetTemplate(template), file, 'application/json'); setDone(t('wall.setTemplate.saved', { file })); }}>
          {t('wall.setTemplate.download', { file })}
        </button>
        <button type="button" disabled={slots === 0} className={`${libraryAction} disabled:opacity-40`} onClick={() => { keepTemplate(template); setDone(t('wall.setTemplate.kept', { name: template.name })); }}>
          {t('wall.setTemplate.keep')}
        </button>
      </div>
      {done ? <output className="mt-2 block text-xs text-sky-200">{done}</output> : null}
    </section>
  );
}

/** On the empty Wall: choose a template (a file, or one kept in this browser), then the model; the model's set is made by the template. */
export function NewFromTemplate() {
  const { t } = useTranslation();
  const { pending, kept } = useSetTemplates();
  const [refused, setRefused] = useState<string | null>(null);
  const readFile = (file: File): void => {
    void file.text().then(
      (text) => { setRefused(null); armTemplate(parseSetTemplate(text)); },
      (err: unknown) => setRefused(err instanceof Error ? err.message : String(err)),
    ).catch((err: unknown) => setRefused(err instanceof Error ? err.message : String(err)));
  };
  return (
    <section aria-label={t('wall.setTemplate.new')} className="flex max-w-md flex-col items-center gap-2 text-center" data-owns-keys>
      <h2 className="m-0 text-xs font-medium uppercase tracking-widest text-cyan-400">{t('wall.setTemplate.new')}</h2>
      {pending ? (
        <>
          <p className="m-0 text-sm text-sky-100">{t('wall.setTemplate.armed', { name: pending.name })}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <label className="cursor-pointer rounded-md bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500">
              {t('wall.setTemplate.chooseModel')}
              <input type="file" accept=".ifc" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) window.dispatchEvent(new CustomEvent(EVENT_LOAD_FILE, { detail: file }));
              }} />
            </label>
            <button type="button" className={libraryAction} onClick={() => armTemplate(null)}>{t('wall.setTemplate.disarm')}</button>
          </div>
        </>
      ) : (
        <>
          <label className={`${libraryAction} cursor-pointer`}>
            {t('wall.setTemplate.pickFile')}
            <input type="file" accept={`${SET_TEMPLATE_FILE_SUFFIX},application/json`} aria-label={t('wall.setTemplate.pickFile')} className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) readFile(file);
            }} />
          </label>
          <button type="button" className={libraryAction} onClick={() => armTemplate(pacSetTemplate({ name: t('pac.set.name'), plans: t('pac.set.plans'), facades: t('pac.set.facades'), sections: t('pac.set.sections') }))}>{t('pac.useSet')}</button>
          <button type="button" className={libraryAction} onClick={() => armTemplate(pacRuralSetTemplate({ name: t('pac.rural.set.name'), plans: t('pac.set.plans'), facades: t('pac.set.facades'), sections: t('pac.set.sections') }))}>{t('pac.useRuralSet')}</button>
          {kept.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t('wall.setTemplate.keptTitle')}>
              {kept.map(({ template }) => (
                <li key={template.name} className="flex items-center justify-center gap-1.5">
                  <button type="button" className={libraryAction} onClick={() => armTemplate(template)}>{t('wall.setTemplate.use', { name: template.name })}</button>
                  <button type="button" className="rounded px-1.5 py-1 text-2xs text-sky-300 hover:text-white" onClick={() => forgetTemplate(template.name)}>{t('wall.setTemplate.forget', { name: template.name })}</button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {refused ? <p role="alert" className="m-0 text-xs text-amber-300">{t('wall.setTemplate.refused', { detail: refused })}</p> : null}
    </section>
  );
}

/** What applying the template said, on the page the set arrives on: every rule met, or each one that was skipped, defaulted or rescaled. */
export function TemplateReport() {
  const { t } = useTranslation();
  const say = useSayNote();
  const report = useSetTemplates((s) => s.report);
  if (!report) return null;
  return (
    <section aria-label={t('wall.setTemplate.report.title', { name: report.template })} className="mt-6 max-w-lg" data-testid="set-template-report">
      <h2 className="m-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('wall.setTemplate.report.title', { name: report.template })}</h2>
      <ul className="m-0 mt-2 list-none space-y-1 p-0 text-xs leading-relaxed text-sky-100/80">
        {report.notes.length === 0 ? <li>{t('wall.setTemplate.report.allMet')}</li> : report.notes.map((n, i) => <li key={`${n.key}:${i}`}>{say(n.key, n.params)}</li>)}
        {report.annotated === 'running' ? <li>{t('wall.setTemplate.report.annotating')}</li> : report.annotated ? <li data-testid="set-template-annotated">{t('wall.setTemplate.report.annotated', { added: report.annotated.added, views: report.annotated.views.length, skipped: report.annotated.views.filter((v) => v.skipped).length })}</li> : null}
      </ul>
    </section>
  );
}
