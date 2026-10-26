/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readNumberingScheme, readUnitsAndNumbers, type NumberingScheme, type UnitsAndNumbers } from '@bimvoice/ifcsheet';
import { readTitleBlockTemplate } from '../title-block-file';
import type { TitleBlockTemplate } from '../title-block-template';
import { optionalField, type FieldReader } from './define';

/**
 * What the project held, before a standards pack changed it, for each part the pack set (#365). A key that is absent
 * was not touched by the pack; `null` means the project had nothing there (the part followed the app's default), and
 * resetting puts that back. Text and dimension styles are not kept: the graphic standard's id is enough to take back
 * the styles it brought (`stylesUnder`).
 */
export interface StandardPreviousValues {
  graphicStandard?: string | null;
  titleBlockTemplate?: TitleBlockTemplate | null;
  unitsAndNumbers?: UnitsAndNumbers | null;
  sheetNumbering?: NumberingScheme | null;
}

/** The standards pack installed in the project: which one, its version, and the values it replaced. */
export interface InstalledStandard {
  id: string;
  version: number;
  previous: StandardPreviousValues;
}

declare module '../types' {
  interface ProjectFieldTypes {
    /** The standards pack last installed (`standards/standard-pack-install.ts`); absent: none was. */
    installedStandard?: InstalledStandard;
  }
}

/** Each part kept only when the file's value is readable; one that is not is dropped, so a reset leaves that part alone. */
function readPrevious(raw: unknown): StandardPreviousValues {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: StandardPreviousValues = {};
  const take = <K extends keyof StandardPreviousValues>(key: K, read: (v: unknown) => StandardPreviousValues[K] | undefined): void => {
    if (r[key] === null) out[key] = null as StandardPreviousValues[K];
    else if (r[key] !== undefined) { const v = read(r[key]); if (v !== undefined) out[key] = v; }
  };
  take('graphicStandard', (v) => (typeof v === 'string' ? v : undefined));
  take('titleBlockTemplate', readTitleBlockTemplate);
  take('unitsAndNumbers', readUnitsAndNumbers);
  take('sheetNumbering', readNumberingScheme);
  return out;
}

export function readInstalledStandard(raw: unknown): InstalledStandard | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '' || typeof r.version !== 'number' || !Number.isInteger(r.version)) return undefined;
  return { id: r.id, version: r.version, previous: readPrevious(r.previous) };
}

const read: FieldReader<'installedStandard'> = (raw) => {
  const value = readInstalledStandard(raw.installedStandard);
  return value ? { installedStandard: value } : {};
};

export const installedStandardField = optionalField('installedStandard', read);
