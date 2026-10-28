/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Exporting a sheet exactly as drawn: the paper SVG, re-dimensioned in real
 * millimetres. SVG downloads directly; PDF goes through the browser's print
 * dialog ("Save as PDF") with the page size set to the paper, so it prints
 * at true scale.
 */

import { downloadFile, sanitizeFilename } from '@/lib/export/download';
import type { ProjectSheet } from '@/project/types';
import { paperOf } from '@/project/sheets';

/** A window of the paper, millimetres from its top-left corner. */
export interface PaperCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The sheet SVG as a standalone document sized in millimetres (selection marks removed); with `crop`, only that window of the paper. */
export function sheetSvgText(svg: SVGSVGElement, sheet: ProjectSheet, crop?: PaperCrop): string {
  const { w, h } = crop ?? paperOf(sheet);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', `${w}mm`);
  clone.setAttribute('height', `${h}mm`);
  if (crop) clone.setAttribute('viewBox', `${crop.x} ${crop.y} ${crop.w} ${crop.h}`);
  clone.removeAttribute('class');
  for (const el of Array.from(clone.querySelectorAll('[data-export-ignore="true"], [data-print-ignore="true"]'))) el.remove();
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function stem(sheet: ProjectSheet): string {
  return sanitizeFilename(`${sheet.number} ${sheet.name}`, { fallback: 'sheet' });
}

export function exportSheetSvg(svg: SVGSVGElement, sheet: ProjectSheet): void {
  downloadFile(sheetSvgText(svg, sheet), `${stem(sheet)}.svg`, 'image/svg+xml');
}

/** Print the sheet at its paper size (the browser offers "Save as PDF"). */
/** Print a finished document through a hidden frame: the one print path, for a single sheet and for an issued set. */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 1000), { once: true });
  setTimeout(() => {
    win.focus();
    win.print();
  }, 200);
}

/** The print document of one sheet: its paper size as the page, the sheet drawn on it. */
export function sheetPrintHtml(svg: SVGSVGElement, sheet: ProjectSheet): string {
  const { w, h } = paperOf(sheet);
  return `<!doctype html><html><head><title>${stem(sheet)}</title><style>@page{size:${w}mm ${h}mm;margin:0}html,body{margin:0;padding:0}svg{display:block}</style></head><body>${sheetSvgText(svg, sheet).replace(/^<\?xml[^>]*>\s*/, '')}</body></html>`;
}

export function printSheet(svg: SVGSVGElement, sheet: ProjectSheet): void {
  printHtml(sheetPrintHtml(svg, sheet));
}
