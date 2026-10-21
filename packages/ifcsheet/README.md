# @bimvoice/ifcsheet

The IfcSheet drawing-set engine: the project document, the starting set of views and sheets a model opens with, and PDF and DXF export, without a browser. The IfcSheet web app (`apps/viewer`) is a client of it.

Not published yet (`private`). The design and what is still to move are in [`docs/architecture/ifcsheet-engine.md`](../../docs/architecture/ifcsheet-engine.md).

## From an IFC to a drawing set, in Node

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { generateDefaultSet } from '@bimvoice/ifcsheet';
import { exportDxf, exportPdf, openModel, sheetGraphics } from '@bimvoice/ifcsheet/headless';

const model = await openModel(new Uint8Array(readFileSync('house.ifc')));
const set = generateDefaultSet(model);
if (!set) throw new Error('The model has no geometry to lay a set out on.');

const sheets = await sheetGraphics(set, model);
writeFileSync('house.pdf', await exportPdf(sheets));
for (const sheet of sheets) writeFileSync(`${sheet.number}.dxf`, exportDxf(sheet));
writeFileSync('house.drawing-set.json', JSON.stringify(set.document, null, 2));
```

`openModel` parses the file and meshes it with the wasm geometry engine (`@ifc-lite/wasm`, built with `pnpm build:wasm` or fetched with `pnpm build:wasm:fetch`). `generateDefaultSet` lays out the same views and sheets the Wall makes when the model opens: a plan per level, the four elevations, the two proposed sections, on sheets numbered A-101, A-201… `set.notes` says what the person should know (no storeys, drawings larger than their paper).

## What the output is today

- **PDF**: one page per sheet at its paper size, vector lines and text, true to scale. Unstyled: no pens, hatches, symbols or annotation yet.
- **DXF**: one R12 file per sheet in paper millimetres, with the frame, the title block's lines and each drawing's linework on their own layers. No text yet.

## Names

Names the engine gives (sheet names, view names) are English. Install another language with `setNameResolver`.

## Tests

`pnpm --filter @bimvoice/ifcsheet test`. The FZK-Haus test needs `pnpm fixtures` and the wasm build, and skips with a message without them.
