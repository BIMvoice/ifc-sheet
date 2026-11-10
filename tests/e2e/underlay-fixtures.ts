/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Files the underlay e2e (#457) lays under a plan, built in the test so nothing binary is committed: a two-page
 * A4 landscape PDF (page 1 empty, page 2 one black 100 x 50 mm block) and a PNG with a black left half.
 */

import { deflateSync } from 'node:zlib';

/** A valid two-page PDF; page 2 holds the block at x 50..150 mm, y 50..100 mm from the top-left of the page. */
export function twoPagePdf(): Buffer {
  const mm = 72 / 25.4;
  const w = +(297 * mm).toFixed(2);
  const h = +(210 * mm).toFixed(2);
  const block = `0 0 0 rg ${+(50 * mm).toFixed(2)} ${+(h - 100 * mm).toFixed(2)} ${+(100 * mm).toFixed(2)} ${+(50 * mm).toFixed(2)} re f`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 5 0 R >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 6 0 R >>`,
    '<< /Length 0 >>\nstream\n\nendstream',
    `<< /Length ${block.length} >>\nstream\n${block}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** An 8-bit grey PNG, `width` x `height`, its left half black and its right half white. */
export function halfBlackPng(width = 400, height = 200): Buffer {
  const row = Buffer.alloc(1 + width, 255);
  row[0] = 0;
  row.fill(0, 1, 1 + width / 2);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
