/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The archival metadata of an issued PDF: what PDF/A-2b asks of the file's
 * description that jsPDF can write. This is NOT a conforming PDF/A writer and
 * nothing here has been run through a validator, so nothing here may be
 * described as "PDF/A compliant":
 *
 *   written: PDF 1.7 header, an XMP packet (`pdfaid` part 2, conformance B,
 *            title, producer, creation date that agrees with the document
 *            information), a file identifier, an sRGB output intent with its
 *            ICC profile embedded.
 *            The text font (Inter) is embedded in full (`pdf-fonts.ts`), so no
 *            font is left unembedded; whether jsPDF's font dictionaries meet
 *            every PDF/A font rule has not been checked.
 *   not written (jsPDF cannot, or this has not been done): /ModDate in the
 *            document information, accented text in the Info dictionary
 *            (folded to ASCII there; the XMP keeps it exact), a validated
 *            ICC profile (the profile below is generated from the sRGB
 *            primaries and transfer curve, not taken from the ICC's file).
 */

import type { jsPDF } from 'jspdf';

type Writer = jsPDF['internal'] & { newObject(): number; write(...parts: string[]): void };
type Private = { __private__: { setPdfVersion(v: string): void; getCreationDate(): string; setFileId(v: string): string } };

const fixed = (v: number) => Math.round(v * 65536) >>> 0;
const asciiXml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).replace(/[^\x20-\x7e]/g, (c) => `&#x${c.codePointAt(0)?.toString(16)};`);

/** A minimal ICC v2 matrix/TRC display profile with the sRGB primaries (D50 adapted) and transfer curve. */
export function srgbProfile(): Uint8Array {
  const curve = Array.from({ length: 1024 }, (_, i) => {
    const v = i / 1023;
    return Math.round((v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * 65535);
  });
  const xyz = (x: number, y: number, z: number) => ({ sig: 'XYZ ', body: [fixed(x), fixed(y), fixed(z)] });
  const text = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
  const desc = 'sRGB IEC61966-2.1 (generated)';
  const tags: { name: string; data: number[]; share?: string }[] = [];
  const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const u16 = (v: number) => [(v >>> 8) & 255, v & 255];
  const xyzData = (x: number, y: number, z: number) => [...text('XYZ '), ...u32(0), ...xyz(x, y, z).body.flatMap(u32)];
  tags.push({ name: 'desc', data: [...text('desc'), ...u32(0), ...u32(desc.length + 1), ...text(desc), 0, ...u32(0), ...u32(0), ...u16(0), 0, ...new Array(67).fill(0)] });
  tags.push({ name: 'cprt', data: [...text('text'), ...u32(0), ...text('No copyright, use freely'), 0] });
  tags.push({ name: 'wtpt', data: xyzData(0.9642, 1, 0.82491) });
  tags.push({ name: 'rXYZ', data: xyzData(0.43607, 0.22249, 0.01392) });
  tags.push({ name: 'gXYZ', data: xyzData(0.38515, 0.71687, 0.09708) });
  tags.push({ name: 'bXYZ', data: xyzData(0.14307, 0.06061, 0.7141) });
  tags.push({ name: 'rTRC', data: [...text('curv'), ...u32(0), ...u32(curve.length), ...curve.flatMap(u16)] });
  tags.push({ name: 'gTRC', data: [], share: 'rTRC' });
  tags.push({ name: 'bTRC', data: [], share: 'rTRC' });
  const table = 128 + 4 + tags.length * 12;
  const offsets = new Map<string, number>();
  const body: number[] = [];
  const entries: number[] = [];
  for (const t of tags) {
    if (t.share) {
      const at = offsets.get(t.share) ?? 0;
      const size = tags.find((x) => x.name === t.share)?.data.length ?? 0;
      entries.push(...text(t.name), ...u32(at), ...u32(size));
      continue;
    }
    while (body.length % 4 !== 0) body.push(0);
    offsets.set(t.name, table + body.length);
    entries.push(...text(t.name), ...u32(table + body.length), ...u32(t.data.length));
    body.push(...t.data);
  }
  while (body.length % 4 !== 0) body.push(0);
  const total = table + body.length;
  const header = new Array<number>(128).fill(0);
  const put = (at: number, bytes: number[]) => bytes.forEach((b, i) => { header[at + i] = b; });
  put(0, u32(total));
  put(8, [2, 0x10, 0, 0]);
  put(12, text('mntr'));
  put(16, text('RGB '));
  put(20, text('XYZ '));
  put(24, [...u16(2024), ...u16(1), ...u16(1), ...u16(0), ...u16(0), ...u16(0)]);
  put(36, text('acsp'));
  put(68, [...u32(fixed(0.9642)), ...u32(fixed(1)), ...u32(fixed(0.82491))]);
  return Uint8Array.from([...header, ...u32(tags.length), ...entries, ...body]);
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

/** The XMP packet: PDF/A identification, title, producer and the creation date the document information carries. */
export function xmpPacket(title: string, producer: string, created: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const offset = -created.getTimezoneOffset();
  const zone = offset === 0 ? 'Z' : `${offset < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
  const date = `${created.getFullYear()}-${pad(created.getMonth() + 1)}-${pad(created.getDate())}T${pad(created.getHours())}:${pad(created.getMinutes())}:${pad(created.getSeconds())}${zone}`;
  return '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>'
    + `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${asciiXml(title)}</rdf:li></rdf:Alt></dc:title></rdf:Description>`
    + `<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>${asciiXml(producer)}</pdf:Producer></rdf:Description>`
    + `<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreateDate>${date}</xmp:CreateDate></rdf:Description>`
    + '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
}

/** Make `doc` carry the archival description. Call once, before the first page is drawn. */
export function archival(doc: jsPDF, jsPdfVersion: string, title: string, created: Date): void {
  const priv = (doc as unknown as Private).__private__;
  priv.setPdfVersion('1.7');
  doc.setCreationDate(created);
  doc.addMetadata(xmpPacket(title, `jsPDF ${jsPdfVersion}`, created), true);
  const internal = doc.internal as Writer;
  let profile = 0;
  internal.events.subscribe('postPutResources', () => {
    const data = `${hex(srgbProfile())}>`;
    profile = internal.newObject();
    internal.write(`<< /N 3 /Filter /ASCIIHexDecode /Length ${data.length} >>`, 'stream');
    internal.write(data);
    internal.write('endstream', 'endobj');
  });
  internal.events.subscribe('putCatalog', () => {
    internal.write(`/OutputIntents [<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB IEC61966-2.1) /DestOutputProfile ${profile} 0 R >>]`);
  });
}
