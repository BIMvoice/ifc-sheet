# Drawing sets from the command line

The `ifcsheet` command makes a drawing set from an IFC file without opening the app. It writes a PDF, a DXF per sheet and a handover ZIP. It also prints the checks and schedules you would read in the app: readiness, rooms, materials, bill of quantities, lists and classification.

Use it when you want the same set every time, on a server, or for many models in a row. The model is never changed. The command reads it and writes new files.

## Install and run

The package is not on npm yet. For now you run it from a copy of the repository. You need Node.js 22.13 or newer (or 24).

```bash
git clone https://github.com/BIMvoice/ifcsheet.git
cd ifcsheet
corepack enable && pnpm install
pnpm build:wasm:fetch
pnpm exec turbo run build --filter=@bimvoice/ifcsheet
```

After the build, the command is a Node script:

```bash
node packages/ifcsheet/dist/bin.js --version
```

```text
0.1.0
```

The examples below say `ifcsheet`. Make that a shortcut, run from the repository folder:

```bash
alias ifcsheet="node $PWD/packages/ifcsheet/dist/bin.js"
```

The examples use `AC20-FZK-Haus.ifc`, the small house in the repository (`apps/viewer/src/test/__fixtures__/`). Use your own file instead.

!!! note "Progress lines"
    When the engine opens a model it may print lines that start with `[IFC-LITE]`. They are progress notes, not results. The output shown on this page leaves them out.

## Build a drawing set

```bash
ifcsheet build AC20-FZK-Haus.ifc --out set.pdf --dxf dxf --handover pack.zip
```

```text
set.pdf: 4 sheets (Projekt-FZK-Haus)
pack.zip: 6 files
  Projekt-FZK-Haus.pdf
  A-101 Floor plans.dxf
  A-201 Elevations south and north.dxf
  A-202 Elevations east and west.dxf
  A-301 Sections.dxf
  AC20-FZK-Haus.ifc
```

The set has a plan per level, the four elevations and two sections, on numbered sheets. `set.pdf` has one page per sheet, true to scale. `dxf/` holds `A-101.dxf`, `A-201.dxf` and so on. `pack.zip` holds the PDF, the DXFs and your IFC as given.

You need `--out`, `--handover`, or both. The options:

| Option | What it does |
| --- | --- |
| `--out set.pdf` | Where to write the PDF. |
| `--dxf dir` | Also write one DXF per sheet into `dir`. The folder is created. |
| `--handover pack.zip` | Also write the handover ZIP. The app's package adds the schedules as XLSX. |
| `--pattern "{number} {sheet}"` | How the files in the ZIP are named. Fields: `{project}` `{number}` `{sheet}` `{revision}` `{date}` `{issue}`. |
| `--name "Casa FZK"` | The project name in the title blocks. Default: the name in the model. |
| `--project file` | A saved project, `.ifclite-project.json`. Uses its pens and title block layout. |
| `--standard ro` | The Romanian pack: its pens and its title block with Romanian captions. |
| `--template office.bvset` | Make the sheets by the rules of your office's set template. |
| `--include-far-elements` | Frame the views on everything, including small objects far from the building. |

### With a project and the Romanian standard

```bash
ifcsheet build AC20-FZK-Haus.ifc --out ro.pdf --project fzk.ifclite-project.json --standard ro --name "Casa FZK"
```

```text
ro.pdf: 4 sheets (Casa FZK)

Pereti pe tip
Type                       Count  NetSideArea (m²)
Leichtbeton 102890359 300      8            136,28
Leichtbeton 102890359 240      5             54,19
Total                         13            190,47
```

`--standard` wins over the project's own pens and title block. An unknown id stops with the list of known ones (today only `ro`). When you give `--project`, the schedules saved in it are printed after the build. The PDF has no schedule sheets. The app draws those.

### Permit project (PAC)

```bash
ifcsheet build AC20-FZK-Haus.ifc --out pac.pdf --pac --locale ro
```

```text
pac.pdf: 3 sheets (Projekt-FZK-Haus)
```

`--pac` builds the sheets of the permit project under Legea 169/2026, Anexa 2: plans, facades and sections. The PDF opens with the opis page. It lists each item Anexa 2 asks for and says whether your file holds it. Related options:

- `--locale ro` or `--locale en`: the language of the opis page and the sheets. The default is Romanian.
- `--intervention new|existing|interior`: the kind of works. The default is `new`.
- `--pac-mode full|rural`: `rural` builds the simplified Anexa 3 sheets for a rural house, without the opis.

`--pac` does not go with `--template`. A fix so that the Romanian title block, notice and dates are drawn on `--pac` sheets is in review and not part of the command yet.

## Check readiness

```bash
ifcsheet check AC20-FZK-Haus.ifc
```

```text
AC20-FZK-Haus.ifc: 1 thing the model lacks

- 4 of 82 elements have no material.
  The material takeoff leaves them out, and a label's Material field stays empty.
```

`check` says what the IFC lacks and which drawings get weaker for it: storeys, rooms, materials, quantities, unique GlobalIds. Run it before you build.

- `--json` prints the same as data: `{ file, ready, findings }`.
- `--project file` also checks the schedules saved in the project. It names an element listed in two parts, or in none.

## Rooms

```bash
ifcsheet rooms AC20-FZK-Haus.ifc
```

```text
No.  Room                 Level         Useful area m²  Perimeter m
1    Flur                 Erdgeschoss            11.19        17.70
2    Buero                Erdgeschoss            12.60        14.42
...
     Total Erdgeschoss                           98.83
7    Galerie              Dachgeschoss           74.51        41.60
     Total Dachgeschoss                          74.51
     Total building (Au)                        173.34

7 rooms; areas from 7 model quantity, 0 geometry. Left out: 0 external, 0 area-scheme (GFA), 0 split into rooms of their own.
```

One line per room, a total per level and the building total (Au). The last line says where the areas came from: the model's own area quantity first, else the footprint of the room's geometry. Add `--csv` or `--json` for a file you can open in a spreadsheet.

## Materials

```bash
ifcsheet materials AC20-FZK-Haus.ifc
```

```text
Holz                             hatch none; fill ifc; guessed from the name
Leichtbeton 102890359            hatch CONCRETE x1, hairline pen; fill ifc; guessed from the name
Stahlbeton 65690                 hatch CONCRETE x1, hairline pen; fill ifc; guessed from the name
...
```

For each material: how it draws where a view cuts it. "Guessed from the name" means your project has no row for it, so the hatch follows the material name. Add `--project file` to use the table from your project. `--json` is available.

## Bill of quantities

`boq` adds up the articles of your project (`antemasuratoare`). Articles are entered in the app. IfcSheet ships no norm and no article codes. A project is required.

```bash
ifcsheet boq AC20-FZK-Haus.ifc --project fzk.ifclite-project.json --locale ro --detail
```

```text
Antemăsurătoare: AC20-FZK-Haus.ifc

1. ZID-01  Pereti 24 cm  13,13 m³
     Leichtbeton 102890359 240: 13,13
2. ZID-02  Pereti 30 cm  43,42 m³
     Leichtbeton 102890359 300: 43,42
```

Each article gets its total in its own unit. Article 2 has 5 percent waste, so its total is 5 percent above the plain wall volume. `--detail` adds a line per type. `--csv` and `--json` are available.

An element that does not declare the quantity is named and left out of the sum. It is never counted as zero. A unit that does not fit the quantity (cubic metres for a length) stops the command with an explanation and exit code 1.

## Lists

`list` runs a schedule defined in the project's Lists, with the same rows and totals as the app.

```bash
ifcsheet list AC20-FZK-Haus.ifc --project fzk.ifclite-project.json
```

```text
Pereti pe tip
Type                       Count  NetSideArea (m²)
Leichtbeton 102890359 300      8            136,28
Leichtbeton 102890359 240      5             54,19
Total                         13            190,47
```

When the project has more than one schedule, name one with `--schedule <id or name>`. `--csv` gives the file the app exports.

## Classification

```bash
ifcsheet classify AC20-FZK-Haus.ifc --project fzk.ifclite-project.json
```

```text
AC20-FZK-Haus.ifc: Cod birou

-                  BeamType: Radial Gradient Fill 1515460218 200 x 240  x1
20.10              DoorType: Eingangstür  x1
10.20              WallType: Leichtbeton 102890359 240  x5
10.20              WallType: Leichtbeton 102890359 300  x8
...
64 elements have no code.
```

Every type in the model, with its code. The model's own classification reference comes first. If it has none, the project's table of your office codes is used. A dash means no code. The last line counts the elements with no code. With several systems in the project, pick one with `--system <name>`. `--csv` and `--json` are available.

## Numbers: decimal comma

Numbers follow the project's "Units and numbers" setting. A Romanian project writes `12,50`. Without a project, you get a point (`12.50`).

- `--project file` applies the project's setting to `rooms`, `boq` and `list`.
- `--locale ro` on `rooms`, `boq` and `list` writes the decimal comma and Romanian headings. `--locale en` is the default.
- `--csv` always writes plain numbers with a point, so a script can read them.

Here is the small project file used on this page. Save it as `fzk.ifclite-project.json`. It sets the decimal comma, two articles, one list and one code table.

```json
{
  "format": "ifclite-project",
  "version": 1,
  "name": "Casa FZK",
  "unitsAndNumbers": { "separator": "comma", "decimals": { "area": 2, "volume": 2 } },
  "boqArticles": [
    { "id": "a1", "code": "ZID-01", "description": "Pereti 24 cm", "unit": "m3", "typeName": "Leichtbeton 102890359 240", "quantity": "NetVolume", "factor": 1 },
    { "id": "a2", "code": "ZID-02", "description": "Pereti 30 cm", "unit": "m3", "typeName": "Leichtbeton 102890359 300", "quantity": "NetVolume", "factor": 1, "waste": 5 }
  ],
  "classificationMappings": [
    { "id": "c1", "system": { "name": "Cod birou" }, "rules": [
      { "by": "class", "match": "IfcWallStandardCase", "code": "10.20", "title": "Pereti" },
      { "by": "class", "match": "IfcDoor", "code": "20.10", "title": "Usi" }
    ] }
  ],
  "schedules": [
    { "id": "walls", "name": "Pereti pe tip", "kind": "list", "createdAt": 1,
      "list": { "filter": { "classes": ["IfcWallStandardCase"] },
        "columns": [ { "id": "type", "source": "attribute", "propertyName": "Type" },
                     { "id": "area", "source": "quantity", "psetName": "BaseQuantities", "propertyName": "NetSideArea" } ],
        "groupBy": ["type"], "sum": ["area"] } }
  ]
}
```

In daily work you save the project from the app instead of writing it by hand.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | It worked. For `check`: nothing would weaken the drawings. |
| 1 | The work failed: the file cannot be read, the model has no geometry, a unit does not fit. For `check`: something would weaken the drawings. |
| 2 | The command line is wrong: an unknown command, an unknown standard, `build` without `--out`. |

Check the code in a script with `ifcsheet check model.ifc || echo "not ready"`.

## What the command does not do

- It reads the IFC as saved. Edits made in the app and not yet exported are not seen.
- The PDF has pens and the title block, but no dimensions, tags or annotations. Those are drawn in the app.
- The DXF holds lines and no text.
- The XLSX export is the app's. The command prints text, CSV or JSON.

For AI assistants that drive the same engine, see [IfcSheet for AI agents (MCP)](ifcsheet-mcp.md).
