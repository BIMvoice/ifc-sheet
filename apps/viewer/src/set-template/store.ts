/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The set templates the app holds (#21): the one armed for the next model
 * ("New project from template"), what applying it said, and the templates kept
 * in this browser. A kept template is the text of its `.bvset` file, so the
 * file reader judges it again whenever it is read. Browser storage is a
 * convenience of this browser only: the file is what travels.
 */

import { create } from 'zustand';
import { parseSetTemplate, serializeSetTemplate, type SetTemplate } from '@bimvoice/ifcsheet';
import type { SetSummary } from '@/annotate-set/annotate-set';
import type { Reason } from '@/project/drawing-set';

const KEPT_KEY = 'ifcsheet.setTemplates';

export interface KeptTemplate {
  template: SetTemplate;
  /** The `.bvset` text, as saved. */
  text: string;
}

/** What applying a template to a model said, kept for the page that shows the set arriving. */
export interface TemplateReport {
  template: string;
  notes: Reason[];
  /** What the annotation commands the template records did on the new set (`running` while they do), or null when it records none. */
  annotated: SetSummary | 'running' | null;
}

interface SetTemplateState {
  /** The template the next model's set is made by; consumed by it. */
  pending: SetTemplate | null;
  report: TemplateReport | null;
  kept: KeptTemplate[];
}

/** The kept templates out of storage; one that no longer reads is dropped, and said. */
export function readKept(storage: Pick<Storage, 'getItem'> | undefined): KeptTemplate[] {
  try {
    const raw = storage?.getItem(KEPT_KEY);
    if (!raw) return [];
    const texts: unknown = JSON.parse(raw);
    if (!Array.isArray(texts)) return [];
    return texts.flatMap((text): KeptTemplate[] => {
      if (typeof text !== 'string') return [];
      try {
        return [{ template: parseSetTemplate(text), text }];
      } catch (error) {
        console.warn('[ifcsheet] a kept set template could not be read and was dropped', error);
        return [];
      }
    });
  } catch (error) {
    console.warn('[ifcsheet] kept set templates could not be read', error);
    return [];
  }
}

function writeKept(kept: readonly KeptTemplate[]): void {
  try {
    globalThis.localStorage?.setItem(KEPT_KEY, JSON.stringify(kept.map((k) => k.text)));
  } catch (error) {
    console.warn('[ifcsheet] set templates could not be kept in this browser', error);
  }
}

const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const useSetTemplates = create<SetTemplateState>(() => ({ pending: null, report: null, kept: readKept(storage()) }));

/** Keep `template` in this browser under its name; one of the same name is replaced. */
export function keepTemplate(template: SetTemplate): void {
  const text = serializeSetTemplate(template);
  const kept = [...useSetTemplates.getState().kept.filter((k) => k.template.name !== template.name), { template, text }];
  useSetTemplates.setState({ kept });
  writeKept(kept);
}

export function forgetTemplate(name: string): void {
  const kept = useSetTemplates.getState().kept.filter((k) => k.template.name !== name);
  useSetTemplates.setState({ kept });
  writeKept(kept);
}

/** Make the next model's set by `template` (null: the automatic set again). */
export const armTemplate = (template: SetTemplate | null): void => useSetTemplates.setState({ pending: template, report: null });

/** The armed template, taken: a second model does not get it. */
export function takeArmedTemplate(): SetTemplate | null {
  const { pending } = useSetTemplates.getState();
  if (pending) useSetTemplates.setState({ pending: null });
  return pending;
}
