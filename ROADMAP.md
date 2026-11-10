# Roadmap: what is planned but not being built

The issue list holds only what is being built now and what users report. Ideas, directions and umbrellas that nobody is building yet live here, with a link to the closed issue that holds their full text. When a user asks for one of them, open a new issue that links back here, and build it.

## Directions

- **A modern interaction model, not an AutoCAD clone** (#168). Done: AutoCAD mode is opt-in (#224, #762, #772), and many tools are direct (#750, #755, #760 to #765, #770, #776, #778, #781, #803). Left: a short UX principles page in `docs/`; an audit of the remaining AutoCAD habits on the Wall; arranging views on a sheet by direct manipulation, with a live preview and the palette (#750 drags a view onto the paper).
- **Milestone 1: IFC in, drawings out** (#557). The order of work is done except joined cut faces (#349) and plans above and below the cut (#490). Left: the acceptance set has 4 models of the planned ten (`docs/guide/acceptance-set.md`), and the milestone's outcome (correct PDF and DXF across the set) has not been checked as a whole. Open product decisions:
  - A window whose IFC states no size: a measured size marked `≈` (#524), or `—` once its type is configured (#481)?
  - A schedule cell typed before sizes were measured: applies to every measured row of its kind (built), or reported as orphaned (#524)?
  - REVOLVING_VERTICAL is drawn as a four-leaf revolving door (#522); the IFC4.3 text probably means a single pivoting leaf.
  - Printed captions and number formats: the project's language (engine today) or the interface language (app today) (#534)?
  - Door handedness in Bonsai models.
- **Every written rule enforced by a check, or rewritten** (#563). Done: the ruleset, the house-rules ratchet, the wired gates, one PR per area, the licence header, unique ids, fixture skips. Left: see the last comment on #563.

## Parked until a user asks

- **Country drawing practice and permit packs** (#799). On main: Romania (PAC, STAS / ISO 128), Norway (byggesak), Germany (Bauantrag per Land, DIN / ISO 128). Parked: United Kingdom (#549), Germany DIN 1356-1 (#550), Switzerland (#551), Netherlands (#552). Every pack stays optional.
- **Drawings from more than IFC** (#172). On main: DXF underlays, the surveyor's DXF and LandXML contours on the site plan, IFCX read as IFC, a title block for formats without IFC data. Parked: point clouds to survey drawings (#181, #207), glTF with user levels and a 3D view (#183, #208), the remaining IFCX unit and anchor warnings, an Autodesk connector.
- **DWG export and plot styles** (#52). Deferred on 26 October: the ODA libraries are commercial and need the maintainer's go; DXF covers the exchange today.
- **A community link in the help menu** (#455). Waits until a community place exists.
- **Checks an office defines itself** in the list of what is missing, such as a north arrow on every plan (#24). Out of scope for now.

## Waiting on someone else

- **The vite / rolldown pin** (#201). Lift it when a newer rolldown keeps `__tla` on forwarding chunks; the Viewer production build job is the test. Dependabot's ignores go with it.
- **Publishing the CLI and MCP server to npm** (#422). Prepared, not published: publishing needs the maintainer's go.
