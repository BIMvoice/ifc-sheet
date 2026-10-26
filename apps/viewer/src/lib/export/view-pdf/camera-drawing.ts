/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The vector hidden-line drawing of a model seen along a camera direction. It
 * lives in the engine (`@bimvoice/ifcsheet/axonometric`, `camera-drawing.ts`
 * there, with the frame it uses), so the to-scale 3D-view PDF, the
 * axonometrics on sheets and the headless set draw a camera the same way.
 */

export { generateCameraDrawing, type CameraDrawing, type CameraDrawingInput } from '@bimvoice/ifcsheet/axonometric';
