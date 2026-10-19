/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The issued PDF: one page per sheet at the sheet's own paper size (the
 * drawing list first, when asked), a bookmark per page ("A-101 Ground floor
 * plan", in set order) and the layers of each sheet as PDF layers. A sheet's
 * SVG goes through svg2pdf one layer run at a time (`pdf-layers.ts`), each run
 * inside its layer's optional-content marks (`pdf-ocg.ts`), so the page looks
 * as the whole SVG drawn at once and a reader can switch the layers.
 */

import type { jsPDF } from 'jspdf';
import { paperOf } from '@/project/sheets';
import type { IssuePlan } from './plan';
import type { ListLabels } from './output';
import { archival } from './pdf-archival';
import { embedFonts, FONT_FAMILY, useEmbeddedFont, type FontLoader } from './pdf-fonts';
import { layerRuns, type LayerGroup, type LayerRef } from './pdf-layers';
import { optionalContent, pdfText, type LayerName, type OptionalContent } from './pdf-ocg';

export interface PdfLabels extends ListLabels {
  /** Headings of the layers panel. */
  groups: Record<LayerGroup, string>;
  /** Names of the sheet's own and the generated drawing's layers, by role tag; a tag without a name is listed as it is. */
  roles: Record<string, string>;
  /** Prefix of a drafting layer's name: "Drafting: Walls". */
  drafting: string;
}

export interface PdfOptions {
  /** Write the archival description (`pdf-archival.ts`; not a validated PDF/A file). */
  archival?: boolean;
  /** The creation date; now when omitted. */
  created?: Date;
  /** How the embedded font files are read (the browser fetches them from `public/fonts/`). */
  loadFont?: FontLoader;
}

const LIST_ROW_MM = 7;

export function layerName(layer: LayerRef, labels: Pick<PdfLabels, 'groups' | 'roles' | 'drafting'>): LayerName {
  const group = labels.groups[layer.group];
  return { group, name: layer.group === 'drafting' ? `${labels.drafting}: ${layer.key}` : (labels.roles[layer.key] ?? layer.key) };
}

function listPage(doc: jsPDF, plan: IssuePlan, projectName: string, labels: PdfLabels): void {
  const head = [labels.sheet, labels.sheetTitle, labels.scale, labels.paper, labels.revision];
  const cols = [20, 60, 25, 35, 30];
  const rows = plan.sheets.map(({ row }) => [row.number, row.title, row.scale, `${row.paper} ${row.orientation}`, row.revision]);
  doc.setFont(FONT_FAMILY, 'bold');
  doc.setFontSize(18);
  doc.text(labels.title, 20, 28);
  doc.setFont(FONT_FAMILY, 'normal');
  doc.setFontSize(11);
  doc.text([projectName, `${labels.issue}: ${plan.name}`, `${labels.date}: ${plan.date}`], 20, 38);
  const draw = (cells: string[], y: number, bold: boolean) => {
    doc.setFont(FONT_FAMILY, bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    let x = 20;
    cells.forEach((c, i) => {
      doc.text(doc.splitTextToSize(c, cols[i] - 2)[0] ?? '', x, y);
      x += cols[i];
    });
    doc.setLineWidth(0.2);
    doc.line(20, y + 2, 190, y + 2);
  };
  let y = 62;
  draw(head, y, true);
  for (const r of rows) {
    y += LIST_ROW_MM;
    if (y > 280) {
      doc.addPage('a4', 'portrait');
      y = 28;
    }
    draw(r, y, false);
  }
}

/** One SVG run drawn onto the current page, attached off-screen while svg2pdf measures it. */
async function drawRun(doc: jsPDF, svg: SVGSVGElement, w: number, h: number): Promise<void> {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:0;height:0;overflow:hidden';
  host.appendChild(document.adoptNode(svg));
  document.body.appendChild(host);
  try {
    await doc.svg(svg, { x: 0, y: 0, width: w, height: h });
  } finally {
    host.remove();
  }
}

async function sheetPage(doc: jsPDF, oc: OptionalContent, svgText: string, w: number, h: number, labels: PdfLabels): Promise<void> {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) throw new Error('The sheet drawing did not parse as SVG.');
  const root = parsed.documentElement as unknown as SVGSVGElement;
  useEmbeddedFont(root);
  for (const run of layerRuns(root)) await oc.inLayer(layerName(run.layer, labels), () => drawRun(doc, run.svg, w, h));
}

/** The issued set as PDF bytes. `svgs` maps a sheet id to its SVG text sized in millimetres. */
export async function buildIssuePdf(plan: IssuePlan, svgs: ReadonlyMap<string, string>, projectName: string, labels: PdfLabels, options: PdfOptions = {}): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  await import('svg2pdf.js');
  const sheets = plan.sheets.filter(({ sheet }) => svgs.has(sheet.id));
  const first = plan.listFirst || sheets.length === 0 ? { w: 210, h: 297 } : paperOf(sheets[0].sheet);
  const created = options.created ?? new Date();
  const doc = new jsPDF({ unit: 'mm', format: [first.w, first.h], orientation: first.w > first.h ? 'landscape' : 'portrait', compress: true });
  await embedFonts(doc, options.loadFont);
  // The outline's titles are PDF text strings: UTF-16 when they are not plain ASCII (jsPDF writes them as Latin-1).
  (doc.outline as unknown as { makeString(v: string): string }).makeString = pdfText;
  // The document information is written by jsPDF as Latin-1 too: accents are folded there (the archival XMP keeps the exact text).
  const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
  doc.setProperties({ title: fold(`${projectName} ${plan.name}`.trim()), subject: fold(`${labels.issue}: ${plan.name} (${plan.date})`), creator: 'IfcSheet' });
  if (options.archival) archival(doc, jsPDF.version, `${projectName} ${plan.name}`.trim(), created);
  else doc.setCreationDate(created);
  doc.setDisplayMode('fullwidth', 'continuous', 'UseOutlines');
  const oc = optionalContent(doc);
  let firstPage = true;
  const nextPage = (w: number, h: number) => {
    if (!firstPage) doc.addPage([w, h], w > h ? 'landscape' : 'portrait');
    firstPage = false;
  };
  if (plan.listFirst) {
    nextPage(210, 297);
    listPage(doc, plan, projectName, labels);
    doc.outline.add(null, labels.title, { pageNumber: doc.getNumberOfPages() });
  }
  for (const { sheet, row } of sheets) {
    const { w, h } = paperOf(sheet);
    nextPage(w, h);
    doc.outline.add(null, `${row.number} ${row.title}`, { pageNumber: doc.getNumberOfPages() });
    await sheetPage(doc, oc, svgs.get(sheet.id) ?? '', w, h, labels);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
