---
"@ifc-lite/drawing-2d": minor
---

`Drawing2DGenerator.generate` takes an optional `onTick` callback. The generator calls it from inside each stage's loops: per mesh cut, rasterized or outlined, per element whose polygons are built, per line classified and per group of lines merged. A caller that runs the generator off the main thread can use it to say it is still at work during a long stage, where `onProgress` is only called at the start and end of the stage. The functions the stages use (`SectionCutter.cutMeshes`, `PolygonBuilder.buildPolygons` / `buildBasePolygons`, `HiddenLineClassifier.buildDepthBuffer` / `applyVisibility` / `classifyLines`, `buildDepthRaster`, `refineOutlineDepths`, `dropInsideCutFaces`, `mergeDrawingLines`) take the same optional callback as their last argument. `GeneratorOptions` and `GeneratorProgress` are now declared in their own module and still exported from the package as before.

`dropInsideCutFaces` finds the cut faces near each line through a grid over the faces' boxes, built once per drawing, instead of testing every line against every face. The result is the same; on a storey of skolebygg (233,874 lines, 4,016 cut faces) the lines-times-faces test was the largest part of the hidden-line stage.
