/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One call from the bytes of an IFC file to its drawing set, for a program that wants the drawings and not the steps:
 *
 *     const set = await drawingSetFromIfc(bytes, { annotate: true });
 *     await writeFile('set.pdf', await set.pdf());
 *     for (const file of set.dxf()) await writeFile(file.fileName, file.data);
 *
 * It is the chain `ifcsheet build <model.ifc>` runs with no project file: open the model, lay out the starting set (a plan
 * per level, the elevations, the proposed sections), apply a drawing standard when one is named, draft the dimensions, tags
 * and level marks when asked, and lay each sheet out as shapes. A test builds AC20-FZK-Haus both ways and compares the DXFs,
 * so the two do not drift. A saved project's own sheets, a set template and the permit set are not options here: use the
 * functions of this entry one by one for those, as `cli-commands/build.ts` does.
 */

import { readAnnotateSpec } from './annotate/spec.js';
import { annotateSetHeadless, annotationsOf } from './annotate/headless.js';
import { buildStandard, withTitleBlock } from './cli-standard.js';
import { generateDefaultSet, type SetNote } from './default-set.js';
import type { ProjectDocument, ProjectView } from './document.js';
import { DEFAULT_DXF_EXPORT, type DxfLayerScheme, type DxfUnits } from './dxf-export-options.js';
import { exportPdf, type PdfOptions } from './export.js';
import { DEFAULT_JOINERY_MAPPING } from './joinery-mapping.js';
import { openModel } from './model.js';
import { nameLanguageOf, NAME_LANGUAGES, type NameLanguage } from './names.js';
import { sheetGraphics } from './set-sheets.js';
import { sheetGraphicToDxf } from './sheet-dxf.js';
import { dxfName } from './sheet-file-name.js';
import type { SheetGraphic } from './sheet-graphic.js';
import { COMMAND_LINE_STANDARD_IDS } from './standard-pack.js';
import { exportSvg } from './svg-export.js';
import { withTypedProjectName } from './title-block-fields.js';
import { sheetFormat } from './units-and-numbers.js';

export interface DrawingSetFromIfcOptions {
  /** The project's name, on the set and in every title block; default: the name the model gives its IfcProject. */
  name?: string;
  /** The language of the sheet and view names, the labels and the figures; default English. */
  language?: NameLanguage;
  /** A drawing standard by id (`ro`, `de`): its pens, title block and sheet numbering; default: the engine's own. */
  standard?: string;
  /**
   * Draft annotation on the views before the sheets are made: `true` for all of it (dimension strings and tags on the
   * plans, level marks on the elevations and sections), or a list of `dimension`, `tag`, `level`. Default: none.
   */
  annotate?: boolean | string;
  /** Frame the set on everything, far-away small elements included; default: they are left out of the extent. */
  includeFarElements?: boolean;
  /** What the DXFs are written for: layers by pen (default) or by element class, in paper millimetres (default) or model metres. */
  dxf?: { layers?: DxfLayerScheme; units?: DxfUnits };
}

/** A file of the set, ready to be written under `fileName`. */
export interface DrawingSetFile<Data> {
  /** The sheet's number, `A-101`. */
  sheet: string;
  fileName: string;
  data: Data;
}

/** What one view got when the set was annotated. */
export interface AnnotatedView {
  view: string;
  /** The view has no drawing, so nothing was drafted on it. */
  skipped: boolean;
  /** How many entities each command added (`dimall`, `tagall`, `levelall`). */
  added: Record<string, number>;
}

export interface DrawingSetFromIfc {
  /** The project's name. */
  name: string;
  /** The project document: the views and the sheets they are on. It serialises as JSON. */
  document: ProjectDocument;
  /** The sheets as shapes in paper millimetres, in order: what the PDF, the DXFs and the SVGs are written from. */
  sheets: readonly SheetGraphic[];
  /** What the person should know about the set (no storeys, a drawing larger than its paper), as catalogue keys. */
  notes: readonly SetNote[];
  /** The plans that hold nothing at all; their sheets carry the frame and title only. */
  emptyViews: readonly string[];
  /** What annotating drafted, view by view; empty without `annotate`. */
  annotated: readonly AnnotatedView[];
  /** The set as one PDF, a page per sheet. In a browser, pass the font bytes (`PdfOptions.font`). */
  pdf(options?: PdfOptions): Promise<Uint8Array>;
  /** One DXF (R2000) per sheet. */
  dxf(): DrawingSetFile<Uint8Array>[];
  /** One SVG per sheet. */
  svg(): DrawingSetFile<string>[];
}

/** Why a set could not be made, in words for the person: an unknown standard or language, a bad `annotate`, a model with no geometry. */
export class DrawingSetRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawingSetRefusal';
  }
}

/** The drawing set of an IFC file (IFC2X3, IFC4, IFC4X3 as STEP, or IFC5 as IFCX JSON) from its bytes. Needs the wasm geometry engine (`@ifc-lite/wasm`). */
export async function drawingSetFromIfc(ifc: Uint8Array | ArrayBuffer, options: DrawingSetFromIfcOptions = {}): Promise<DrawingSetFromIfc> {
  const bytes = ifc instanceof Uint8Array ? ifc : new Uint8Array(ifc);
  const language = options.language === undefined ? 'en' : nameLanguageOf(options.language);
  if (!language) throw new DrawingSetRefusal(`The language "${options.language}" is not one of ${NAME_LANGUAGES.join(', ')}.`);
  const standard = buildStandard(options.standard, undefined);
  if (!standard) throw new DrawingSetRefusal(`The standard "${options.standard}" is not one of ${COMMAND_LINE_STANDARD_IDS.join(', ')}.`);
  const spec = options.annotate === undefined || options.annotate === false ? null : readAnnotateSpec(options.annotate === true ? 'all' : options.annotate);
  if (spec && 'error' in spec) throw new DrawingSetRefusal(`annotate: ${spec.error}`);

  const model = await openModel(bytes, { includeFarElements: options.includeFarElements === true });
  const generated = generateDefaultSet(model, { ...(standard.sheetNumbering ? { scheme: standard.sheetNumbering } : {}), ...(options.name ? { name: options.name } : {}), language });
  if (!generated) throw new DrawingSetRefusal('The model has no geometry to lay a drawing set out on.');
  const set = withTitleBlock(generated, standard);
  const typedTitleBlock = withTypedProjectName(set.document.titleBlock, options.name);
  const document = typedTitleBlock ? { ...set.document, titleBlock: typedTitleBlock } : set.document;

  const format = sheetFormat(language, standard.unitsAndNumbers);
  const annotated: AnnotatedView[] = [];
  let annotations: ReturnType<typeof annotationsOf> | undefined;
  if (spec) {
    const done = await annotateSetHeadless({ model, set: { document, levels: set.levels }, choices: spec.choices, ...(spec.tagParts ? { tagParts: spec.tagParts } : {}), existing: [], locale: format });
    annotations = annotationsOf(done.all, format);
    for (const view of done.summary.views) {
      annotated.push({ view: view.name, skipped: Boolean(view.skipped), added: Object.fromEntries(view.results.map((r) => [r.command, r.outcome === 'added' ? r.added : 0])) });
    }
  }

  const dxfWanted = { ...DEFAULT_DXF_EXPORT, ...options.dxf };
  const emptyViews: string[] = [];
  const sheets = await sheetGraphics({ ...set, document }, model, {
    ...(standard.pens ? { pens: standard.pens } : {}),
    locale: language,
    language,
    ...(standard.openingLines ? { joinery: { joineryTypes: [], joineryMapping: DEFAULT_JOINERY_MAPPING, openingLines: standard.openingLines } } : {}),
    ...(annotations ? { annotations } : {}),
    dxf: { byElement: dxfWanted.layers === 'element', modelFrames: dxfWanted.units === 'model' },
    onEmptyView: (view: ProjectView) => void emptyViews.push(view.name),
  });

  const named = <Data>(extension: string, write: (sheet: SheetGraphic) => Data): DrawingSetFile<Data>[] => {
    const used = new Set<string>();
    return sheets.map((sheet) => ({ sheet: sheet.number, fileName: dxfName(sheet.number, used).replace(/\.dxf$/, `.${extension}`), data: write(sheet) }));
  };
  return {
    name: document.name,
    document,
    sheets,
    notes: set.notes,
    emptyViews,
    annotated,
    pdf: (pdfOptions = {}) => exportPdf(sheets, { title: document.name, ...pdfOptions }),
    dxf: () => named('dxf', (sheet) => sheetGraphicToDxf(sheet, { lineTypes: [], ...options.dxf })),
    svg: () => named('svg', (sheet) => exportSvg(sheet)),
  };
}
