/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project a LandXML file names for itself (#204): `<Project name="...">`
 * and the producing `<Application name="...">`. Both sit in the first
 * elements of the file, so the head is enough; a file that names neither
 * reads as nothing and the title block falls back to the file name (#203).
 */

export interface LandXmlProjectInfo {
  name?: string;
  application?: string;
}

/** Bytes of the file's start searched for the two elements. */
const HEAD_BYTES = 65536;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unescapeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, ref: string) => {
    if (ref[0] !== '#') return ENTITIES[ref.toLowerCase()] ?? whole;
    const code = ref[1].toLowerCase() === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** The `name` attribute of the first `<tag ...>` in the text, tidied, or undefined. */
function nameOf(text: string, tag: string): string | undefined {
  const start = new RegExp(`<${tag}(\\s[^>]*)?>`, 'i').exec(text);
  const attribute = start?.[1] ? /\sname\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(` ${start[1]}`) : null;
  const value = unescapeXml(attribute?.[1] ?? attribute?.[2] ?? '').replace(/\s+/g, ' ').trim();
  return value === '' ? undefined : value;
}

/** The project and application names in the head of a LandXML document's text. */
export function readLandXmlProject(head: string): LandXmlProjectInfo | undefined {
  const name = nameOf(head, 'Project');
  const application = nameOf(head, 'Application');
  return name || application ? { ...(name ? { name } : {}), ...(application ? { application } : {}) } : undefined;
}

/** The same, read from the first bytes of the file. */
export async function readLandXmlProjectFromFile(file: Blob): Promise<LandXmlProjectInfo | undefined> {
  return readLandXmlProject(await file.slice(0, HEAD_BYTES).text());
}
