# `@ifc-lite/mcp`

Model Context Protocol (MCP) server for **ifc-lite** — agent-native BIM via JSON-RPC.

> Make ifc-lite the first BIM platform that any LLM agent (Claude Desktop,
> Cursor, ChatGPT, Goose, Windsurf, Zed, custom) can drive directly against
> real models.

## Quick start

```bash
# Run against a local IFC file over stdio (the default for Claude Desktop / Cursor)
npx @ifc-lite/mcp ./model.ifc

# Federate multiple files
npx @ifc-lite/mcp ./arch.ifc ./struct.ifc ./mep.ifc --federate

# Read-only (no mutation tools advertised)
npx @ifc-lite/mcp ./model.ifc --read-only

# HTTP / Streamable HTTP for remote agents
npx @ifc-lite/mcp ./model.ifc --transport http --port 8765 --token $API_TOKEN

# Auto-open the WebGL viewer at startup. Add --open to also pop the URL in
# the system browser.
npx @ifc-lite/mcp ./model.ifc --viewer
npx @ifc-lite/mcp ./model.ifc --open
```

## Embedded loaded-model authoring

`loadIfcModel` returns a model whose `bim.store` supports the existing
`addElementType`, `assignType`, `addMaterial`, `addMaterialLayerSet`,
`addMaterialLayerSetUsage` and `assignMaterial` SDK methods. They delegate to
shared schema-aware builders, convert metre dimensions to native units, and
record each call as one complete public `mutation_undo` operation. Late schema
refusals leave no partial helpers. These embedded methods are distinct from
the JSON-RPC tool names; see the [programmatic embedding guide](https://github.com/LTplus-AG/ifc-lite/blob/main/docs/guide/mcp.md#programmatic-embedding).

`addStair`, `addRailing` and `removeStair` use the same canonical SDK factory.
`removeStair` removes a uniquely owned parent/flight pair atomically, retaining
shared shape/style leaves and refusing ambiguous ownership or foreign product
references. Public `run_flow` routes `element.stair` / `element.railing` through
`model.addElement`; each successful graph creation has one `mutation_undo`.
Tracking is fresh per RPC call, so cross-call update/remove needs a persistent
caller-owned tracking store. No separate creation or Redo RPC is added.

## 3D viewer integration

The server bundles the same WebGL viewer used by `ifc-lite view`. Once it is
open, every viewer-touching tool (`viewer_colorize`, `viewer_isolate`,
`viewer_fly_to`, …) drives the live scene, and any element the user clicks
in the browser flows back to MCP.

### From a chat (the typical flow)

The agent should follow this etiquette by default:

1. Call `viewer_ask` with a `reason`. The tool returns suggested wording so
   the agent can ask the user for permission.
2. After the user agrees, call `viewer_open`. The result includes the URL
   to share with the user.
3. Drive the visualization (`viewer_colorize`, `viewer_color_by_property`,
   `viewer_isolate`, `viewer_fly_to`, `viewer_set_section`).
4. Subscribe to `ifc-lite://viewer/selection` (via `resources/subscribe`)
   to be notified whenever the user picks an element. `viewer_get_selection`
   reads the latest pick directly; `viewer_wait_for_selection` blocks until
   the next click.
5. `viewer_close` when done.

### Pre-baked prompts

- `visual_audit` — opens the viewer, runs `model_audit`, paints issues by
  severity, frames the worst offender.
- `interactive_property_inspect` — opens the viewer, waits for a click,
  then explains everything we know about the picked entity.
- `visualize_query` — runs a query, color-codes matches by property value,
  flies the camera to the result.

You can also reach it via the unified CLI:

```bash
ifc-lite mcp ./model.ifc
ifc-lite mcp ./model.ifc --read-only
```

### Claude Desktop

Drop this into `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ifc-lite": {
      "command": "npx",
      "args": ["-y", "@ifc-lite/mcp", "/abs/path/to/model.ifc"]
    }
  }
}
```

### Cursor / Windsurf / Goose

The same `npx` command works as a stdio server in any MCP-aware client.

## What the server exposes

| Category | Examples |
| --- | --- |
| Discovery | `model_info`, `model_list`, `model_load`, `model_unload`, `schema_describe` |
| Query | `query_entities`, `count_entities`, `get_entity`, `get_entities_bulk`, `spatial_hierarchy`, `containment_chain`, `relationships`, `properties_unique`, `materials_list`, `classifications_list`, `georeferencing`, `units`, `cost_data`, `cost_evaluate` |
| Geometry | `geometry_bbox`, `geometry_volume`, `geometry_area`, `geometry_get`, `raycast`, `clash_check`, `clash_matrix` |
| Validation | `ids_validate`, `ids_explain`, `model_audit`, `gherkin_check` |
| Mutation | `entity_set_property`, `entity_delete_property`, `entity_set_attribute`, `entity_create`, `entity_delete`, `mutation_batch`, `mutation_undo`, `mutation_diff`, `model_save` |
| Hosted modelling | `place_opening`, `place_door`, `place_window` |
| Design modelling | `place_curtain_wall`, `place_grid`, `place_grid_column` |
| Physical edits | `edit_hosted_element`, `edit_element_geometry`, `copy_elements`, `duplicate_element`, `array_elements` |
| Native Room | `query_rooms`, `room_command` |
| Wall joins | `join_walls` |
| BCF | `bcf_topic_list`, `bcf_topic_create`, `bcf_topic_update`, `bcf_topic_close`, `bcf_viewpoint_create`, `bcf_export` |
| bSDD | `bsdd_search`, `bsdd_class`, `bsdd_property_sets`, `bsdd_match` |
| Diff | `model_diff` (`by_content` for content-keyed matching), `quantity_diff` |
| Export | `export_ifc`, `export_csv`, `export_json`, `export_glb`, `export_obj`, `export_ifcx`, `export_pdf_report` |
| Drawing sets | `ifcsheet_open_model`, `ifcsheet_generate_set`, `ifcsheet_apply_template`, `ifcsheet_list_sheets`, `ifcsheet_add_view`, `ifcsheet_place_view`, `ifcsheet_set_title_block`, `ifcsheet_renumber`, `ifcsheet_add_schedule`, `ifcsheet_export_pdf`, `ifcsheet_export_dxf`, `ifcsheet_issue_set`, `ifcsheet_save_project`, `ifcsheet_load_project`, `ifcsheet_check_readiness` |
| Viewer | `viewer_ask`, `viewer_open`, `viewer_close`, `viewer_status`, `viewer_colorize`, `viewer_isolate`, `viewer_hide`, `viewer_show`, `viewer_reset`, `viewer_fly_to`, `viewer_set_section`, `viewer_clear_section`, `viewer_color_by_storey`, `viewer_color_by_property`, `viewer_get_selection`, `viewer_wait_for_selection`, `viewer_describe_selection` |

`join_walls` joins two straight walls in the same placement frame through the
viewer/SDK core. It writes `IfcRelConnectsPathElements` and rewrites bodies and
axes atomically. Hosted openings must fit both joined end faces; unreadable cuts
refuse the operation. One `mutation_undo` restores the complete earlier graph,
including replaced profiles, axes and relationships.

`place_opening`, `place_door` and `place_window` use the viewer/SDK's shared
hosted creation core. Pass `host_express_id`, optional `model_id` (required
with several loaded models), and PascalCase `params`: `Offset`, `Width`,
`Height`, optional `Sill` (required for a window). Lengths are metres in the
wall's frame. Cuts must fit and avoid existing source/overlay openings;
unreadable geometry is refused. The void/fill graph is written atomically,
and one `mutation_undo` removes it. These writes reach IFC export; geometry
tools continue to read the parsed model.

`entity_create` accepts an optional `global_id` for the new entity's GlobalId
(IfcRoot subtypes only; written to attribute 0). It must be a valid 22-character
IFC GUID not already carried by an entity in the model; an invalid or duplicate
value is refused with `INVALID_INPUT` and nothing is queued.

`model_diff` compares by GlobalId, which reads a from-scratch re-export as the
whole model deleted and re-added. Pass `by_content: true` to run the
`@ifc-lite/diff` engine's content-keyed matching instead; it is data-scope only
(the server has no geometry pipeline) and reports unresolved `duplicated` /
`deduplicated` / `ambiguous` matches as groups rather than guessing a pairing —
capped by `max_matches` and `max_group_members`, both of which report the whole
totals they cut. A `model_id` names a session rather than a file, so all three
passes fold in mutations queued by `entity_create` / `entity_delete` /
`entity_set_*` and report the count in `contentDiff.pendingMutations`.

The rest of the read surface folds the same overlay: `get_entity`,
`get_entities_bulk`, `query_entities` (property filters and `in_storey` alike),
`count_entities`, `model_info`, `model_list`, `properties_unique`,
`materials_list`, `classifications_list`, `spatial_hierarchy`,
`containment_chain` and `model_audit`, plus the model manifest, entity and
spatial-tree resources. Containment folds too: a wall you create and place with
a queued `IfcRelContainedInSpatialStructure` is found by `in_storey`, and
deleting a relationship record stops it relating anything. Those payloads carry
`pendingMutations` whenever edits are queued and omit the field entirely when
none are, which is the line between "in this session" and "on disk" — nothing is
written until `export_ifc` or `model_save`.

`relationships` (voids/fills/groups/connections), `units`, `georeferencing` and
the geometry, clash and viewer tools answer from the parsed model and say so by
never carrying `pendingMutations`.

One GlobalId resolves to one entity everywhere: an entity the session created
wins over a same-GlobalId entity in the file, and a deleted one never resolves.
`get_entities_bulk` keys its map by that same rule and lists any key that named
more than one live entity in `ambiguousGlobalIds`.

Resources expose live model state under the `ifc-lite://` URI scheme:

```
ifc-lite://server/manifest
ifc-lite://model/{model_id}/manifest
ifc-lite://model/{model_id}/entity/{global_id}
ifc-lite://model/{model_id}/spatial-tree
ifc-lite://model/{model_id}/materials
ifc-lite://model/{model_id}/property-sets
ifc-lite://viewer/status         (open/closed, port, client count)
ifc-lite://viewer/selection      (live; supports `resources/subscribe` for push updates)
```

Pre-baked prompts ship the BIM expertise:

`audit_model`, `find_fire_rated_doors`, `generate_bcf_from_ids`,
`compare_versions`, `space_program_check`, `clash_review`,
`prop_quality_pass`, `migrate_to_ifcx`, `visual_audit`,
`interactive_property_inspect`, `visualize_query`.
The drawing-set prompts are `prepare_permit_set`, `update_set_for_new_model`
and `check_readiness_and_fix` (see Drawing sets below).

## Drawing sets (IfcSheet)

These tools lay out, edit and print the drawing set of a model, on the
`@bimvoice/ifcsheet` engine (issue #165). They keep their own handles and do
not need `model_load`. A set is held by the session as the engine's project
document: `ifcsheet_generate_set`, `ifcsheet_apply_template` and
`ifcsheet_load_project` each make one (a `document_id`), and the editing tools
replace it, so the PDF, DXF and issue always draw the latest edit. Lengths are
metres in the viewer frame (X east, Y up, Z south), paper sizes millimetres, a
scale is its denominator (100 is 1:100). The tools write only to paths the
caller gives, inside `--allow`, and never to the model that was opened or to an
`.ifc` file, except the annotated copy that `ifcsheet_issue_set` writes as a new
file when `annotated_ifc` is true.

| Tool | Input | Returns |
| --- | --- | --- |
| `ifcsheet_open_model` | `file_path` or `ifc_base64` (exactly one), optional `name` | `model_id`, project name, storeys with elevations, element and mesh counts, the building's `extent` |
| `ifcsheet_generate_set` | `model_id`, optional `name` | `document_id`, the sheets (number, name, paper, viewports), the views (kind, level) and the full project document as JSON |
| `ifcsheet_export_pdf` | `document_id`, optional `file_path` | page count, sheet numbers, byte size and the written `file_path`; without `file_path` the PDF as `pdf_base64` |
| `ifcsheet_apply_template` | `model_id`, `template_path` or `template_json` (a `.bvset`), optional `name`, `dry_run` | a new `document_id`, the sheets and the notes of what the rules met; as `ifcsheet build --template` |
| `ifcsheet_list_sheets` | `document_id` | per sheet: id, number, name, paper, the views on it (slot, kind, scale); the views not placed; the title block fields |
| `ifcsheet_add_view` | `document_id`, `kind` (`plan` with `level`, `elevation` with `direction`, `section` by `axis` and `offset_m` or by a line `from`/`to`, `axonometric` with `preset`, optionally cut away by `cut_level` and `cut_height_m` or a box), optional `dry_run` | the new view; it is not on a sheet yet |
| `ifcsheet_place_view` | `document_id`, `view`, optional `sheet`, `scale`, `slot`, `dry_run` | the sheet it is on; without `sheet` the engine's rule picks or makes one; errors when the views do not fit at the scale |
| `ifcsheet_set_title_block` | `document_id`, `fields` (client, drawnBy, project, date, phase, projectNumber...), optional `sheet`, `dry_run` | the fields in force and the ones that changed; project-wide, or one sheet's own |
| `ifcsheet_renumber` | `document_id`, optional `preset` (`default`, `sequential`), `discipline`, `overrides`, `dry_run` | the old to new numbers |
| `ifcsheet_add_schedule` | `document_id`, `kind` (`rooms`; `boq` with `project_path`/`project_json`; or `list` with `list`, a Lists-engine definition: filter, columns, groupBy, sum, totals), optional `paper`, `locale`, `dry_run` | a schedule sheet (A-601...); the rows come from the model each time the set is drawn; for rooms `total_row`, the building total (Au); a `list` gives the rows and totals the app's Lists panel gives for that definition |
| `ifcsheet_export_dxf` | `document_id`, `directory`, optional `sheet` | a DXF per sheet, named like `ifcsheet build --dxf` |
| `ifcsheet_issue_set` | `document_id`, `directory`, optional `handover`, `pattern`, `annotated_ifc` | the PDF, a DXF per sheet, `register.csv`, the schedules as CSV and, with `handover`, `handover.zip` (with the IFC as opened); with `annotated_ifc` also `<model>.annotated.ifc`, which carries no annotations in this build (see below) |
| `ifcsheet_save_project` | `document_id`, `file_path` (`.json`) | writes `.ifclite-project.json`; what a loaded file held besides the set is written back unchanged |
| `ifcsheet_undo` | `document_id` | the set as it was before its last edit (add_view, place_view, set_title_block, add_schedule, renumber); `changed`, `undo_steps`, `redo_steps` |
| `ifcsheet_redo` | `document_id` | re-applies the edit just undone; `changed: false` when there is none |
| `ifcsheet_load_project` | `model_id`, `project_path` or `project_json` | a new `document_id` from a saved project |
| `ifcsheet_check_readiness` | `model_id`; optional `project_path` or `project_json`, `ids` (`byggesaksbim`) | `ready` and the findings (kind, what is missing, what is weaker, counts): what the model lacks that the drawings read; the report of `ifcsheet check`; with `ids: "byggesaksbim"` or a project that opted in, also the ByggesaksBIM (Norway) findings. The opt-in of an earlier `ifcsheet_load_project` is not remembered: pass `project_path`/`project_json` or `ids` on this call. A model that is not IFC4 gets one `byggesaksbimSchema` finding; a check that cannot run is a tool error |

`dry_run: true` on `ifcsheet_add_view`, `ifcsheet_place_view`,
`ifcsheet_set_title_block`, `ifcsheet_add_schedule`, `ifcsheet_apply_template`
and `ifcsheet_renumber` runs the same code as the real call and reports the
same result, but nothing in the session changes (a dry run of
`ifcsheet_apply_template` makes no `document_id`). Ids a dry run reports are
not kept. `ifcsheet_undo` takes back the last edit of a set (`{ "document_id": "sheetset-1" }`), also after several, and `ifcsheet_redo` re-applies it; a dry run is not an edit, a new edit after an undo clears redo, and the last 50 edits are kept. With nothing to undo the result says so (`changed: false`) and is not an error.

Limits, as the tools state them: the engine's DXF holds lines and no text; the
plain title block of the PDF prints the project, sheet number and name, scale
and date, and the other title block fields (phase, project number, roles,
address) are kept in the project for the app's title block layouts; a schedule
sheet draws as many rows as fit its paper (`rows_left_off`), and the issue's CSV
has all of them. `annotated_ifc` runs the engine's annotated-IFC export over the
IFC as opened. The annotations of a set are drafts (dimensions, tags, notes),
which belong to the app and which these tools do not hold, so the copy has no
annotations written into it and the result says so (`annotated_ifc.note`,
`drafts_not_written`).

### Resources and prompts

| Resource | Content |
| --- | --- |
| `ifcsheet://project/schema` | The JSON Schema (draft 2020-12) of the project document. Its enumerations and bounds are read from the engine when it is served, and a test holds its properties to the engine's TypeScript types. It cannot say that a viewport's `viewId` names a view of the file; `ifcsheet_load_project` checks that. |
| `ifcsheet://session/project` | The project document of the set the session made or loaded last, as `ifcsheet_save_project` would write it. Read-only; listed once the session holds a set. |
| `ifcsheet://session/sheets` | The sheets of that set, as `ifcsheet_list_sheets` returns them. Read-only. |

| Prompt | Arguments | Steps |
| --- | --- | --- |
| `prepare_permit_set` | `model_path`, `output_dir`; optional `template_path`, `phase` (default DTAC), `project_number`, `address`, `project_manager`, `designer`, `drawn_by`, `checked_by`, `client`, `date`, `au_reference` | open, readiness, lay out (template or default), title block (dry run first), room schedule and the Au total, sheets, readiness again, save, issue with handover |
| `update_set_for_new_model` | `model_path`, `project_path`, `output_dir`; optional `handover` | open the new model, load the saved project, find storeys without a plan and add them, readiness, save, issue |
| `check_readiness_and_fix` | optional `model_path` or `model_id`, `project_path` | readiness, each finding explained, what only the model's author can fix |

The prompts say only what the tools return and make no claim about what a permit
authority requires.

Add the server to Claude Desktop (`claude_desktop_config.json`) or Cursor with
`--allow` for the folders it may read and write, and to Claude Code with one
command:

```json
{ "mcpServers": { "ifc-lite": { "command": "npx", "args": ["@ifc-lite/mcp", "--allow", "/path/to/project"] } } }
```

```bash
claude mcp add ifc-lite -- npx @ifc-lite/mcp --allow /path/to/project
```

An example conversation:

> **You:** Open `/path/to/project/AC20-FZK-Haus.ifc` and make me a drawing set as PDF.
>
> **Claude** calls `ifcsheet_open_model` with `{"file_path": "/path/to/project/AC20-FZK-Haus.ifc"}`
> and gets `model_id: "sheetmodel-1"`, two storeys (Erdgeschoss, Dachgeschoss).
>
> **Claude** calls `ifcsheet_generate_set` with `{"model_id": "sheetmodel-1"}` and gets
> `document_id: "sheetset-1"` with four sheets: A-101 Floor plans, A-201 Elevations
> south and north, A-202 Elevations east and west, A-301 Sections.
>
> **Claude** calls `ifcsheet_export_pdf` with
> `{"document_id": "sheetset-1", "file_path": "/path/to/project/fzk-set.pdf"}` and gets
> `pages: 4`.
>
> **Claude:** Done: a four-page set is at `/path/to/project/fzk-set.pdf`.

### Examples

A permit set (the `prepare_permit_set` prompt runs this order for you; the
figures are those of AC20-FZK-Haus):

```text
ifcsheet_open_model      {"file_path": "/work/AC20-FZK-Haus.ifc"}
                         -> model_id "sheetmodel-1", storeys Erdgeschoss (0) and Dachgeschoss (2.7)
ifcsheet_check_readiness {"model_id": "sheetmodel-1"}
                         -> ready false; noMaterials: 4 of 82 elements have no material
ifcsheet_check_readiness {"model_id": "sheetmodel-1", "ids": "byggesaksbim"}
                         -> also byggesaksbimH1, H4 and H5 (Norway; a project that opted in needs no ids)
ifcsheet_generate_set    {"model_id": "sheetmodel-1"}
                         -> document_id "sheetset-1": A-101, A-201, A-202, A-301; 9 views
ifcsheet_set_title_block {"document_id": "sheetset-1", "fields": {"phase": "DTAC", "projectNumber": "42/2026"}, "dry_run": true}
                         -> "Dry run, nothing changed. Would set phase, projectNumber for the project."
ifcsheet_set_title_block {"document_id": "sheetset-1", "fields": {"phase": "DTAC", "projectNumber": "42/2026"}}
ifcsheet_add_schedule    {"document_id": "sheetset-1", "kind": "rooms", "locale": "ro"}
                         -> sheet A-601; total_row is the building total (Au)
ifcsheet_save_project    {"document_id": "sheetset-1", "file_path": "/work/issue/fzk.ifclite-project.json"}
ifcsheet_issue_set       {"document_id": "sheetset-1", "directory": "/work/issue", "handover": true}
                         -> PDF, dxf/A-101.dxf ... A-601.dxf, register.csv, schedules/A-601.csv, handover.zip
```

A new version of the model: `ifcsheet_open_model` on the new file, then
`ifcsheet_load_project` `{"model_id": ..., "project_path": "/work/issue/fzk.ifclite-project.json"}`,
`ifcsheet_list_sheets` to see which storeys have no plan, `ifcsheet_add_view`
and `ifcsheet_place_view` for those, and `ifcsheet_issue_set`.

An agent can also read `ifcsheet://project/schema` before it writes a project
file by hand, and `ifcsheet://session/project` to see the set the tools hold.
`llms.txt` in this package is the short version of this section for agents.

## Hosted endpoint (opt-in)

The web app can serve the drawing-set tools over Streamable HTTP at `/mcp`. It is OFF unless the deployment sets the environment variable `IFCSHEET_HOSTED_MCP=1`; without it the endpoint answers 404 and nothing else changes.

- POST only, JSON in and JSON out (a single message or a batch). No sessions, no resources, no prompts, no server-initiated stream: every request starts from nothing, and a batch (at most 20 messages) shares one state and runs its messages one after the other, in order, so `ifcsheet_open_model` then a tool taking its `model_id` works inside one batch: the ids are sequential within a request (`sheetmodel-1`, `sheetmodel-2`, ...), so the first model a batch opens is `sheetmodel-1`. Across requests nothing carries over. A body that is not a JSON-RPC 2.0 message is answered with -32600 (Invalid Request), invalid JSON with -32700.
- Only the `ifcsheet_*` tools. The server has no file system for you: every file path (`file_path`, `*_path`, `directory`) is refused with PERMISSION_DENIED. Send the model as `ifc_base64`, a template or project as `template_json` or `project_json`, and read results from the response (`ifcsheet_export_pdf` without `file_path` returns `pdf_base64`). `ifcsheet_generate_set` takes `ifc_base64` directly, so one call turns a model into a set.
- Nothing is saved: edits are returned in the response, never stored.
- Limits: a model of at most 25 MB (larger is refused with an error result), a request body to match, and 50 seconds per request (stopped with HTTP 504 and a JSON-RPC error). The 50 s limit is checked between messages and answered when it passes, but it cannot interrupt a synchronous parse or layout already running: such a call runs to its end (the platform's own function limit is then the stop). The hosting platform may set a smaller body limit than 25 MB (Vercel: 4.5 MB), which then applies first.

## Programmatic embedding

```ts
import {
  createMCPServer,
  StdioTransport,
  loadIfcModel,
  InMemoryModelRegistry,
} from '@ifc-lite/mcp';

const registry = new InMemoryModelRegistry();
registry.add(await loadIfcModel('./model.ifc'));

const server = createMCPServer({ version: '0.1.0', registry });
const transport = new StdioTransport();
await transport.connect(server);
```

For Tauri/Electron hosts, use `InProcessTransport`:

```ts
import { InProcessTransport } from '@ifc-lite/mcp';

const transport = new InProcessTransport();
await transport.connect(server);
const initResp = await transport.send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-11-05', capabilities: {}, clientInfo: { name: 'host', version: '1' } },
});
```

## Errors

Domain errors come back inside the tool result with `isError: true` and a
stable `structuredContent.code`:

```jsonc
{
  "isError": true,
  "content": [{ "type": "text", "text": "Entity not found in model 'arch'" }],
  "structuredContent": {
    "code": "ENTITY_NOT_FOUND",
    "details": { "model_id": "arch", "express_id": 42 },
    "hint": "Use query_entities to discover valid IDs."
  }
}
```

That keeps the LLM in the loop instead of aborting the chain on a JSON-RPC
error.

## Roadmap

Shipped: stdio + Streamable HTTP transports; query, geometry (bbox, volume,
area), clash, IDS validation, mutation, BCF, bSDD, diff, export (IFC, CSV, JSON,
GLB, OBJ, IFCX), and live viewer control.

Planned: mesh geometry (`geometry_get`) and `raycast` (both need the WASM
geometry pipeline), Gherkin validation (`gherkin_check`), and PDF report export
(`export_pdf_report`) — these tools are registered but currently return
`UNSUPPORTED_OPERATION`. Also planned: OAuth 2.1 with PKCE and hosted
multi-tenant deployment, sampling for natural-language descriptions, and public
registry listing.

## Docs

See the [ifc-lite docs](https://ifclite.dev/docs/) for the full
platform documentation.

Licensed under MPL-2.0.

Loaded-model physical edits use the same command cores as the viewer and typed
SDK. `edit_element_geometry` handles Move/Rotate, Size, Wall Endpoints, Split and
Trim/Extend. `copy_elements`, `duplicate_element` and `array_elements` carry
hosted graph records and share the viewer placement and naming policies.
References are model-local EXPRESS IDs; offsets use IFC storey-local metres
and planar rotations use radians. Every write is one `mutation_undo` batch;
unsupported sources and unsafe shared geometry refuse before committing.
See the [MCP guide](https://github.com/LTplus-AG/ifc-lite/blob/main/docs/guide/mcp.md)
for parameter contracts.

`room_command` derives Room candidates from the current native geometry and
runs Auto/Pick/Footprint/Update or layout Drag/Split/Remove/Prune through the
shared Room core. It requires the WASM runtime. Query does not write; writes
record one complete Undo batch. Model removal and session termination free
retained native layout handles. Unsupported schema/storey planes return
`INVALID_INPUT`; unavailable native initialization returns
`UNSUPPORTED_OPERATION`. Unexpected export, parse, processing or runtime
import failures return `INTERNAL_ERROR`; cancellation and state conflicts
retain their distinct retryable codes.
