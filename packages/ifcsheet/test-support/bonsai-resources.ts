/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The resource paths every Bonsai drawing carries in EPset_Drawing, with Bonsai's
 * defaults (core.drawing.add_drawing). Written out here, apart from the test that
 * reads the exported IFC, so the test states the expected values on its own and
 * does not take them from the code it checks. They are property values, not
 * source files, which is why they sit outside the test file: the source-text gate
 * reads a literal ending in `.css` as the name of a source file.
 */
export const BONSAI_RESOURCES: Record<string, string> = {
  Stylesheet: 'drawings/assets/default.css',
  Markers: 'drawings/assets/markers.svg',
  Symbols: 'drawings/assets/symbols.svg',
  Patterns: 'drawings/assets/patterns.svg',
  ShadingStyles: 'drawings/assets/shading_styles.json',
  CurrentShadingStyle: 'Blender Default',
};
