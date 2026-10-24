<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at https://mozilla.org/MPL/2.0/. -->

# Recorded evidence replayed by tests

These files are the subset of upstream ifc-lite's `docs/architecture/evidence/`
that viewer tests and `ifc-lite-processing` tests read (#145). Nothing else from
upstream's documentation is shipped here.

Provenance: copied byte-for-byte from
[LTplus-AG/ifc-lite](https://github.com/LTplus-AG/ifc-lite) at commit
`1bd932d45803c47da3434f0cc599d53e4ac91b07`, same paths. Each file's git blob
hash matched upstream's at that commit when it was copied; the files changed
since are listed below. They are covered by the Mozilla Public
License 2.0, like the rest of this repository.

| Folder | Files | Read by |
| --- | --- | --- |
| `pdf-fidelity-report/` | `control-text-accepted.ifc`, `control-text-accepted.pdf` | `apps/viewer/src/lib/collab/room-step-source.test.ts`, `apps/viewer/src/lib/llm/document-text.test.ts` |
| `pdf-fill-annotations/` | `page-1-request.json`, `page-2-request.json` | `apps/viewer/src/lib/appearance/authored-product-command.test.ts`, `apps/viewer/src/lib/appearance/pdf/fill-plan-wasm.test.ts` |
| `scan-alignment-workbench/` | `good.json`, `wrong-heldout.json` | `apps/viewer/src/lib/appearance/scan/transfer.test.ts`, `apps/viewer/src/components/viewer/appearance/useScanTransfer.test.tsx`, `apps/viewer/src/components/viewer/appearance/ScanTransferFields.test.tsx` |
| `scan-registration-cras/` | `craslabbim-ifc4-tessellated.ifc`, `craslabbim-ifc4-tessellated-transferred-wall-1117.ifc`, `transfer-summary-wall-1117.json`, `textures/b12ae7a6….png` | `apps/viewer/src/lib/appearance/scan/cras-transferred-output.test.ts` |
| `pdf-curved-fill-annotations/` | `page-1-request.json` to `page-3-request.json` | `rust/processing/src/appearance/pdf_fill_tests.rs` |
| `pdf-composition-lattice/` | `registered-request.json` | `rust/processing/src/appearance/pdf_fill_tests.rs` |
| `pdf-straight-stroke-annotations/` | `page-1-request.json` to `page-7-request.json` | `rust/processing/src/appearance/pdf_stroke_tests.rs` |

Decoder re-qualification on PDF.js 6.4.299 (#210) changed two things. In the
13 PDF vector requests (`pdf-fill-annotations/`, `pdf-curved-fill-annotations/`,
`pdf-composition-lattice/`, `pdf-straight-stroke-annotations/`) only
`decoderVersion` changed. Each source PDF was rebuilt byte-for-byte (same
`pdfSha256`) and decoded again with 6.4.299 through `decodePdfVectorPage`. Every
recorded field matched exactly. `pdf-fidelity-report/control-text-accepted.ifc`
was regenerated with `tools/texture-authoring/pdf-fidelity-evidence.mjs
control:text 1`, because its `RequestSha256` and `FidelitySha256` cover the
decoder version, so changing only the label would have left them describing a
request that never existed. That export also picks up the planner's current
output: the `SourcePdfFormatVersion` and `ConversionClipPdf` properties, and
coordinates that differ in the last binary digit. `control-text-accepted.pdf` is
unchanged.

The Rust tests read their files with `include_str!`, so removing one breaks the
compile of the whole `ifc-lite-processing` test target. Do not edit these files
by hand: the tests assert on their recorded values.
