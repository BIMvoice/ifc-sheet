# ByggesaksBIM IDS (unofficial)

`byggesaksbim.ids` is the IDS the ByggesaksBIM readiness check runs (#372): 7 specifications, one per Obligatorisk item of DiBK's P13 eByggesak report. IDS 1.0, ifcVersion IFC4. `byggesaksbim-ids.ts` holds the same text for the app and the command line (`byggesaksbim.test.ts` fails when they differ); `byggesaksbim.ts` turns a validation report into readiness findings.

Source: the DiBK P13 eByggesak report (ARK, Forprosjekt, IFC4 ADD2 TC1 links), cross-checked with the mvdXML DiBK publishes with it (`status="sample"`). DiBK publishes no IDS; this is our reading of the report, not an official DiBK artefact. Read 2026-10-26.

The 24 of the 27 Advarsel (warning) items that IDS can express are not shipped: IDS has no severity level, so they would read as failures.

## Hard requirements (`byggesaksbim.ids`)

Required facets use `cardinality="required"`. Specification minOccurs: 1 for IfcSite/IfcBuilding/IfcBuildingStorey (at least one must exist), 0 for IfcZone and IfcTransportElement (they may legitimately be absent).

| ID | Checks | Source quote (p13.txt) |
|---|---|---|
| NO-H1 | `IfcSite` attribute `LandTitleNumber` matches `[0-9]{4}-(0\|[1-9][0-9]*)/(0\|[1-9][0-9]*)/(0\|[1-9][0-9]*)/(0\|[1-9][0-9]*)` (xs:pattern, anchored by IDS) | "kommunenr har alltid fire sifre med eventuelle ledende nuller"; "gårdsnr, bruksnr, festenr og seksjonsnr må ikke ha ledende nuller"; "alle felt må være inkludert"; "felt som ikke er i aktiv bruk, skal defineres med en null (0)"; example `0904-200/2430/0/14` |
| NO-H2 | `IfcBuilding` has `Pset_BuildingCommon.GrossPlannedArea` (BYA) | "Bebygd Areal (BYA) (Obligatorisk) Pset_BuildingCommon.GrossPlannedArea" |
| NO-H3 | `IfcBuilding` has `Pset_BuildingCommon.OccupancyType` (Geonorge bygningstype code) | "Bygningstype (Obligatorisk) Pset_BuildingCommon.OccupancyType"; "Kodeverdi ... f.eks. \"111\"" |
| NO-H4 | `IfcBuildingStorey` has `Pset_BuildingStoreyCommon.GrossPlannedArea` (BTA) | "Bruttoareal (BTA) (Obligatorisk) Pset_BuildingStoreyCommon.GrossPlannedArea" |
| NO-H5 | `IfcBuildingStorey` has `Pset_BuildingStoreyCommon.NetPlannedArea` (BRA) | "Bruksareal (BRA) (Obligatorisk) Pset_BuildingStoreyCommon.NetPlannedArea" |
| NO-H6 | `IfcZone` whose `Pset_ZoneCommon.Reference` (a property, not an attribute) = `Bruksenhet` has `Pset_ZoneCommon.NetPlannedArea` (BRA); every other IfcZone (fire, HVAC) is out of scope | "Bruksareal (BRA) (Obligatorisk) Pset_ZoneCommon.NetPlannedArea"; "IfcZone skal brukes til å spesifisere bruksenheten"; "Soner som skal brukes til bruksenhet verdiene i pset_ZoneCommon.Reference må være lik \"Bruksenhet\"" (the Reference item marks a zone as a bruksenhet; it is not a requirement on every zone; mvd.xml: `O_value[Value]='Bruksenhet'`) |
| NO-H7 | `IfcTransportElement` has attribute `PredefinedType` | "heis-type (Obligatorisk) IfcTransportElement.predefineType" |

The report uses property sets (Pset_) for all seven, never Qto_ quantity sets, so no quantity facets are used for the hard requirements.

## Not encoded, and why (the 27 Advarsel items included)

- `IfcGeometricRepresentationContext.TrueNorth` and `IfcProjectedCRS.CRSName` (EPSG): the data lives on entities reached through IfcProject.RepresentationContexts / coordinate operations; IDS cannot traverse those relations. Note: the report text spells it `IfcProjectedCRS.CRSName`, the section N1 table in the research file says `IfcProjectedCRS.Name`.
- `IfcPostalAddress.siteAddress` (format "gatenavn mellomrom husnummer pluss bokstaver"): reached through IfcSite.SiteAddress, an entity reference; IDS cannot restrict its inner fields.
- Geonorge code lists (bygningstype, etasjeplan, EPSG): the register contents are not in the saved files, so no enumeration. OccupancyType is only required to exist.
- Value semantics (BYA/BTA/BRA measurement rules, NS 3940, "cantilevers under 5.00 m", bruksenhet numbering vs address rules): not machine-checkable here.
- IfcSpace: only in the 2017 table `p13ark.txt`, absent from the live report; left out.
- The mvdXML `status="sample"`, test host; whether it is the version in force is unverified.

## Ambiguities in the source

1. Data types: p13.txt and mvd.xml give a type only for LandTitleNumber (`IfcLabel`, mvd.xml). The property data types in the IDS (IfcAreaMeasure, IfcLabel, IfcIdentifier, IfcBoolean, IfcPositiveLengthMeasure, IfcLengthMeasure) are the IFC4 standard definitions of those Psets, not from DiBK's files. The Check engine accepted them as valid for the standard properties.
2. IfcTransportElement: the report names only `PredefinedType`, no value list; NOTDEFINED therefore passes.
3. "Alle verdier i IfcZone vil bli verifisert dersom de har de riktige verdiene i Pset_ZoneCommon.Reference" and "Soner som skal brukes til bruksenhet ... må være lik Bruksenhet" are read as: a zone is a bruksenhet when its Reference is Bruksenhet, and the zone requirements (NO-H6) apply to those zones only. An earlier version also required every IfcZone to carry Reference = Bruksenhet (NO-H6), which flagged fire and HVAC zones; removed 2026-10-26 after review. A model with no bruksenhet zone passes (minOccurs 0), though a building normally needs bruksenheter.
4. Pset_ZoneCommon.Reference data type is IfcIdentifier in IFC4; the report does not say.
5. The report spells attribute names in lower case (`landTitleNumber`, `predefineType`); the IFC names are used.

## Validation

1. The Check engine of the idsbench project accepted the file: `valid: true`, IDS 1.0, no findings. Data types must be upper case (`IFCAREAMEASURE`) and `<version>` must precede `<description>` in `<info>`.
2. IfcTester (ifcopenshell 0.9.0.post1) on FZK (IFC4): FAIL H1 (matrikkel), H4, H5 (storey areas); PASS H2, H3 (the model has the building Pset); PASS H6, H7 for want of elements (no zones, no transport elements).
3. IfcTester on a synthetic compliant IFC4 model (one site, building, storey, zone and lift): all 7 PASS.
4. Both runs are pinned as tests: `byggesaksbim.test.ts` (FZK fails exactly H1, H4, H5; `synthetic-model.ts` is the compliant model, written from code, and each of its pieces taken away fails exactly its requirement) and, in the app, `apps/viewer/src/check/byggesaksbim.test.tsx`.

5. IDS 1.0 XSD: `<author>` must be an email address (`[^@]+@[^\.]+\..+`); the file now has `petru@bimvoice.com`, the "unofficial reading" wording lives in `<description>`. In the repo `byggesaksbim.test.ts` validates the shipped file against the vendored `ids.xsd` with xmllint-wasm.
6. 2026-10-26 zone change (ifctester, `python -I`, FZK-v2: H1, H4, H5 fail, rest pass, unchanged; synthetic compliant: all 7 PASS; a model with a fire zone (Reference `Brannklasse`, no area) and a bruksenhet zone with BRA: all PASS; the same with the bruksenhet BRA removed: only NO-H6 FAILs; a zone with no Reference is not applicable). Matches the ifc-lite run on the same models.
