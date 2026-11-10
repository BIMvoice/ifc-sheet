/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A Bonsai-style model for the plan symbol tests (#489), written as text: an IfcFurnitureType whose RepresentationMaps hold a
 * 3D body (a 0.8 x 0.5 x 0.9 m box) and a `FootPrint` representation in a `Plan` context / PLAN_VIEW subcontext (that
 * rectangle and a half circle of radius 0.2 on its +y side, trimmed in degrees), mapped onto two chairs:
 *
 *   - CHAIR_1 at (2, 3) carries the symbol itself (an IfcMappedItem in its own FootPrint representation);
 *   - CHAIR_2 at (6, 3), turned a quarter turn, has only a body: its symbol comes through its type;
 *   - BOX at (10, 3) is an IfcBuildingElementProxy 1 x 1 x 3 m with no symbol, cut by a plan at 1.2 m.
 */

export const CHAIR_1 = 60;
export const CHAIR_2 = 80;
export const BOX = 90;

const guid = (n: number) => `2${String(n).padStart(21, '0')}`;

export function planSymbolIfc(): string {
  const rows = [
    `#1=IFCPROJECT('${guid(1)}',$,'Plan symbols',$,$,$,$,(#20,#21),#3);`,
    '#3=IFCUNITASSIGNMENT((#4,#5));',
    '#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);',
    "#5=IFCCONVERSIONBASEDUNIT(#6,.PLANEANGLEUNIT.,'DEGREE',#7);",
    '#6=IFCDIMENSIONALEXPONENTS(0,0,0,0,0,0,0);',
    '#7=IFCMEASUREWITHUNIT(IFCPLANEANGLEMEASURE(0.0174532925199433),#8);',
    '#8=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);',
    '#10=IFCCARTESIANPOINT((0.,0.,0.));',
    '#11=IFCAXIS2PLACEMENT3D(#10,$,$);',
    '#12=IFCDIRECTION((0.,0.,1.));',
    '#13=IFCDIRECTION((0.,1.,0.));',
    '#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,\'Model\',3,1.E-05,#11,$);',
    '#21=IFCGEOMETRICREPRESENTATIONCONTEXT($,\'Plan\',2,1.E-05,#11,$);',
    "#22=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#20,$,.MODEL_VIEW.,$);",
    "#23=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('FootPrint','Plan',*,*,*,*,#21,$,.PLAN_VIEW.,$);",
    `#30=IFCSITE('${guid(30)}',$,'Site',$,$,#31,$,$,.ELEMENT.,$,$,$,$,$);`,
    '#31=IFCLOCALPLACEMENT($,#11);',
    `#32=IFCBUILDING('${guid(32)}',$,'Building',$,$,#33,$,$,.ELEMENT.,$,$,$);`,
    '#33=IFCLOCALPLACEMENT(#31,#11);',
    `#34=IFCBUILDINGSTOREY('${guid(34)}',$,'Level 0',$,$,#35,$,$,.ELEMENT.,0.);`,
    '#35=IFCLOCALPLACEMENT(#33,#11);',
    `#36=IFCRELAGGREGATES('${guid(36)}',$,$,$,#1,(#30));`,
    `#37=IFCRELAGGREGATES('${guid(37)}',$,$,$,#30,(#32));`,
    `#38=IFCRELAGGREGATES('${guid(38)}',$,$,$,#32,(#34));`,
    `#39=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(39)}',$,$,$,(#${CHAIR_1},#${CHAIR_2},#${BOX}),#34);`,
    // The type: a body and a footprint, each a representation map.
    `#40=IFCFURNITURETYPE('${guid(40)}',$,'Armchair',$,$,$,(#41,#42),$,$,.NOTDEFINED.);`,
    '#41=IFCREPRESENTATIONMAP(#11,#43);',
    '#42=IFCREPRESENTATIONMAP(#11,#44);',
    '#43=IFCSHAPEREPRESENTATION(#22,\'Body\',\'SweptSolid\',(#45));',
    '#45=IFCEXTRUDEDAREASOLID(#46,#11,#12,0.9);',
    '#46=IFCRECTANGLEPROFILEDEF(.AREA.,$,#48,0.8,0.5);',
    '#48=IFCAXIS2PLACEMENT2D(#49,$);',
    '#49=IFCCARTESIANPOINT((0.4,0.25));',
    "#44=IFCSHAPEREPRESENTATION(#23,'FootPrint','GeometricCurveSet',(#50));",
    '#50=IFCGEOMETRICCURVESET((#51,#52));',
    '#51=IFCPOLYLINE((#53,#54,#55,#56,#53));',
    '#53=IFCCARTESIANPOINT((0.,0.));',
    '#54=IFCCARTESIANPOINT((0.8,0.));',
    '#55=IFCCARTESIANPOINT((0.8,0.5));',
    '#56=IFCCARTESIANPOINT((0.,0.5));',
    '#52=IFCTRIMMEDCURVE(#57,(IFCPARAMETERVALUE(0.)),(IFCPARAMETERVALUE(180.)),.T.,.PARAMETER.);',
    '#57=IFCCIRCLE(#58,0.2);',
    '#58=IFCAXIS2PLACEMENT2D(#59,$);',
    '#59=IFCCARTESIANPOINT((0.4,0.5));',
    '#68=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#10,1.,$);',
    // CHAIR_1: body and footprint, both mapped.
    `#${CHAIR_1}=IFCFURNITURE('${guid(CHAIR_1)}',$,'Chair 1',$,$,#61,#62,$,$);`,
    '#61=IFCLOCALPLACEMENT(#35,#63);',
    '#63=IFCAXIS2PLACEMENT3D(#64,$,$);',
    '#64=IFCCARTESIANPOINT((2.,3.,0.));',
    '#62=IFCPRODUCTDEFINITIONSHAPE($,$,(#65,#66));',
    "#65=IFCSHAPEREPRESENTATION(#22,'Body','MappedRepresentation',(#67));",
    '#67=IFCMAPPEDITEM(#41,#68);',
    "#66=IFCSHAPEREPRESENTATION(#23,'FootPrint','MappedRepresentation',(#69));",
    '#69=IFCMAPPEDITEM(#42,#68);',
    // CHAIR_2: body only, turned so that its +x is the world's +y.
    `#${CHAIR_2}=IFCFURNITURE('${guid(CHAIR_2)}',$,'Chair 2',$,$,#81,#82,$,$);`,
    '#81=IFCLOCALPLACEMENT(#35,#83);',
    '#83=IFCAXIS2PLACEMENT3D(#84,$,#13);',
    '#84=IFCCARTESIANPOINT((6.,3.,0.));',
    '#82=IFCPRODUCTDEFINITIONSHAPE($,$,(#85));',
    "#85=IFCSHAPEREPRESENTATION(#22,'Body','MappedRepresentation',(#86));",
    '#86=IFCMAPPEDITEM(#41,#68);',
    `#87=IFCRELDEFINESBYTYPE('${guid(87)}',$,$,$,(#${CHAIR_1},#${CHAIR_2}),#40);`,
    // BOX: a body, no symbol.
    `#${BOX}=IFCBUILDINGELEMENTPROXY('${guid(BOX)}',$,'Box',$,$,#91,#92,$,.NOTDEFINED.);`,
    '#91=IFCLOCALPLACEMENT(#35,#93);',
    '#93=IFCAXIS2PLACEMENT3D(#94,$,$);',
    '#94=IFCCARTESIANPOINT((10.,3.,0.));',
    '#92=IFCPRODUCTDEFINITIONSHAPE($,$,(#95));',
    "#95=IFCSHAPEREPRESENTATION(#22,'Body','SweptSolid',(#96));",
    '#96=IFCEXTRUDEDAREASOLID(#97,#11,#12,3.);',
    '#97=IFCRECTANGLEPROFILEDEF(.AREA.,$,#98,1.,1.);',
    '#98=IFCAXIS2PLACEMENT2D(#99,$);',
    '#99=IFCCARTESIANPOINT((0.5,0.5));',
  ];
  return [
    'ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    "FILE_NAME('plan-symbols.ifc','2026-10-27T00:00:00',(''),(''),'','','');", "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;', ...rows, 'ENDSEC;', 'END-ISO-10303-21;', '',
  ].join('\n');
}
