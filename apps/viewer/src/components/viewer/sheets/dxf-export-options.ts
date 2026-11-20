/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the sheet's DXF button writes (#831): layers by pen or by element, units of the paper or of the model. The default is the print file
 * (`DEFAULT_DXF_EXPORT`). The sheet draws its pens by the same choice, so what the export reads from the page carries the element classes.
 */

import { create } from 'zustand';
import { DEFAULT_DXF_EXPORT, type DxfExportOptions } from '@bimvoice/ifcsheet/dxf';

export const useDxfExportOptions = create<DxfExportOptions>(() => ({ ...DEFAULT_DXF_EXPORT }));
