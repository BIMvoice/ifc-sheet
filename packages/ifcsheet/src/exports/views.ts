/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/** The document and what draws a view: classification, view templates, per-element graphics, the styler and the pens. Add new exports of this area here, not in `../index.ts`. */

// The document
export type {
  AxonometricPreset, CameraViewpoint, CategoryGraphics, CategoryLineWeight, CustomPaper, DisciplineId, DraftingProjectView,
  ElevationDirection, ElevationProjectView, ElongatedPaper, GridEnds, GroupPattern, InteriorElevation, NumberGroup, NumberingScheme,
  Paper, PaperSize, PhaseId, PhaseStyle, PlanProjectView, ProjectDocument, ProjectionMode, ProjectLevel, ProjectModelRef, ProjectSheet,
  ProjectView, ProjectViewBase, ProjectViewKind, SectionCustomPlane, SectionPlaneAxis, SectionProjectPlane, SectionProjectView,
  SheetFrame, SheetTemplate, SheetViewport, TemplateSeries, ThreeDProjection, ThreeDProjectView, TitleBlockPosition, ViewDetail,
  ViewGraphics, ViewGridGraphics, ViewPhases, ViewRaster, ProjectViewTemplate, TemplateGraphics, ViewTemplateKind,
  ElementGraphics, ElementLineStyle, GlobalId, ResolvedViewGraphics, StyleRule, StyleRuleStyle,
} from '../document.js';
// Detail level per view (#444): coarse / medium / fine, the scale's default, and the one function that simplifies a drawing by it
export { COARSE_FROM_SCALE, DETAIL_LEVELS, FINE_UP_TO_SCALE, atDetailLevel, defaultDetailLevel, resolveDetailLevel, type DetailLevel } from '../detail-level.js';
// A view template's class and material mapping (#31)
export {
  CLASSIFICATION_BY, classificationOf, classifiedTypes, mappingsFor, matchKey, parseClassificationRows, readClassificationMapping, readClassificationMappings, readClassificationRule, classificationRuleOf, systemLabel, withRule,
  type ClassificationBy, type ClassificationImport, type ClassificationMapping, type ClassificationModel, type ClassificationProblem, type ClassificationProblemKind, type ClassificationResult, type ClassificationRule, type ClassificationSystem,
  type ClassifiedElement, type ClassifiedType, type ModelClassificationRef,
} from '../classification.js';
export { classKey, itemRules, materialKey, ruleStyleFor, type ItemRules } from '../style-rules.js';
// View templates (#44): named graphics many views follow, and the one function that layers them
export {
  VIEW_CATEGORY_CLASSES, VIEW_TEMPLATE_KINDS, assignDefaultTemplates, defaultViewTemplates, hiddenClassesOf, resolveViewGraphics, resolveViewport,
  ownGraphicsOf, templateGraphicsOf, templateKindOf, templateOf, untemplatedGraphics, viewportHiddenLayers,
} from '../view-templates.js';
// Single elements in a view (#32, #33): hidden, drawn differently, one line hidden; all by GlobalId
export {
  categoryIdOf, elementShown, hasElementGraphics, hiddenElementIds, hiddenLineElement, hiddenLineEntry, lineHidden, lineKey, orphanElements, resolveElementGraphics, withoutElements,
  type ElementStyle, type OrphanElement,
} from '../element-graphics.js';
// The style of every face and line of a view (#34): one styler and one pen table for the drafting view, the sheets and every export
export {
  DASH_MM, DEFAULT_FACE_FILL, DEFAULT_INK, DEFAULT_VIEW_PRESET, HIDDEN_DASH_MM, PEN_TABLE, elementProperties, presetRules, rulesReadProperties, viewOverrideRules, viewStyler,
  type ItemStyle, type PenKind, type PenTable, type StyleItem, type ViewStyleInputs, type ViewStyler, type WeightPair,
} from '../view-style.js';
export { penGroups, penOrder, type PenGroup, type PenLayer } from '../drawing-pens.js';
