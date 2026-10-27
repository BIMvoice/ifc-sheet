# IfcSheet for AI agents (MCP)

IfcSheet has a server for the Model Context Protocol (MCP). It lets an AI assistant such as Claude Desktop, Claude Code or Cursor make a drawing set from your IFC model. You ask in plain words. The assistant opens the model, lays out the sheets, fills the title block and writes the PDF.

The assistant works through named tools. They are the same engine as the `ifcsheet` command and the app. The tools whose names start with `ifcsheet_` are the drawing-set tools. This page covers those.

## What the assistant can do

- Open an IFC and say what it lacks (`ifcsheet_check_readiness`).
- Lay out a starting set: a plan per level, elevations and sections (`ifcsheet_generate_set`), or by your office's template (`ifcsheet_apply_template`).
- Add views, put them on sheets, renumber sheets, fill the title block, add a room schedule.
- Undo and redo its edits.
- Write the PDF, the DXF files, or the whole issue: PDF, DXF, a drawing register, schedules as CSV and a handover ZIP.
- Save the set as a project file and load it again on a newer version of the model.

It never changes your IFC. It writes only new files, only in folders you allow.

## Run it on your computer

The package is not on npm yet. For now you run it from a copy of the repository. You need Node.js 22.13 or newer (or 24).

```bash
git clone https://github.com/BIMvoice/ifcsheet.git
cd ifcsheet
corepack enable && pnpm install
pnpm build:wasm:fetch
pnpm exec turbo run build --filter=@ifc-lite/mcp
```

The server talks to the assistant over standard input and output (stdio). You do not start it by hand. The assistant starts it. You tell the assistant where it is, and which folders it may use:

```bash
node /full/path/to/ifcsheet/packages/mcp/dist/cli.js --allow /full/path/to/my-project
```

`--allow` is the safety fence. Every file the tools read or write must be inside that folder. Without `--allow`, every file path is refused.

### Claude Desktop

Open the settings file `claude_desktop_config.json` and add the server. Use full paths.

```json
{
  "mcpServers": {
    "ifcsheet": {
      "command": "node",
      "args": [
        "/full/path/to/ifcsheet/packages/mcp/dist/cli.js",
        "--allow", "/full/path/to/my-project"
      ]
    }
  }
}
```

Restart Claude Desktop. The tools appear under the server name.

### Cursor

Add the same block to `.cursor/mcp.json` in your project, or to `~/.cursor/mcp.json` for all projects.

### Claude Code

```bash
claude mcp add ifcsheet -- node /full/path/to/ifcsheet/packages/mcp/dist/cli.js --allow /full/path/to/my-project
```

### Check that it works

```bash
node packages/mcp/dist/cli.js --version
```

```text
ifc-lite-mcp 0.23.0
```

Then ask the assistant: "Open `/full/path/to/my-project/AC20-FZK-Haus.ifc` with IfcSheet and check it." It should call `ifcsheet_open_model` and `ifcsheet_check_readiness`.

!!! note "Log lines"
    Opening a model prints a few lines that start with `[IFC-LITE]` before the answer. Your assistant's log may show them. They are progress notes.

## A drawing set in four steps

You ask: *"Open FZK, make a drawing set, put the project number 42/2026 and phase PAC in the title block, and give me a PDF."*

The assistant calls these tools. The replies are the real replies for AC20-FZK-Haus.

**1. `ifcsheet_open_model`** with `{"file_path": "/full/path/to/my-project/AC20-FZK-Haus.ifc"}`

```text
Opened 'AC20-FZK-Haus.ifc' as sheetmodel-1: project 'Projekt-FZK-Haus', 2 storeys, 317 meshes. Next: ifcsheet_generate_set.
```

The model now has a handle, `sheetmodel-1`.

**2. `ifcsheet_generate_set`** with `{"model_id": "sheetmodel-1"}`

```text
Laid out 4 sheets (A-101, A-201, A-202, A-301) with 9 views as sheetset-1. Next: ifcsheet_export_pdf.
```

The drawing set has a handle too, `sheetset-1`. It is kept in memory only. Nothing is on disk yet.

**3. `ifcsheet_set_title_block`** with `{"document_id": "sheetset-1", "fields": {"phase": "PAC", "projectNumber": "42/2026"}}`

```text
Set phase, projectNumber for the project.
```

**4. `ifcsheet_export_pdf`** with `{"document_id": "sheetset-1", "file_path": "/full/path/to/my-project/fzk-set.pdf"}`

```text
Wrote 4 pages (270,489 bytes) to /full/path/to/my-project/fzk-set.pdf.
```

The assistant tells you where the PDF is. The title block fields are kept in the set. The plain PDF title block prints the project, sheet number and name, scale and date. The other fields are used by the title block layouts of the app.

### Try before you change: dry run

Six editing tools accept `"dry_run": true`: `ifcsheet_add_view`, `ifcsheet_place_view`, `ifcsheet_set_title_block`, `ifcsheet_add_schedule`, `ifcsheet_apply_template` and `ifcsheet_renumber`. A dry run reports what the call would do and changes nothing.

```text
Dry run, nothing changed. Would set phase, projectNumber, client for the project.
```

Ask the assistant to "show me first". It then runs the dry run, tells you, and makes the change after you agree.

### Undo and redo

`ifcsheet_undo` takes back the last edit of a set. `ifcsheet_redo` brings it back.

```text
Undid one edit. The set has 4 sheets (A-101, A-201, A-202, A-301) and 9 views; 0 to undo, 1 to redo.
Redid one edit. The set has 4 sheets (A-101, A-201, A-202, A-301) and 9 views; 1 to undo, 0 to redo.
```

The last 50 edits are kept. A dry run is not an edit. A new edit after an undo clears what could be redone. With nothing to undo, the reply says so. It is not an error.

### Issue the whole set

Ask: "Add a room schedule in Romanian and issue the set with a handover package." The assistant calls `ifcsheet_add_schedule` with `{"document_id": "sheetset-1", "kind": "rooms", "locale": "ro"}` and then `ifcsheet_issue_set` with `{"document_id": "sheetset-1", "directory": "/full/path/to/my-project/issue", "handover": true}`.

```text
Added the room schedule as sheet A-601 (10 rows).
Issued 5 sheets to /full/path/to/my-project/issue: 9 files (with handover.zip).
```

The folder `issue/` holds the PDF, `dxf/` with a DXF per sheet, `register.csv` (the drawing list), `schedules/A-601.csv` and `handover.zip`.

## The drawing-set tools

| Tool | What it does |
| --- | --- |
| `ifcsheet_open_model` | Opens an IFC. Gives a `model_id`, the storeys and the size of the building. |
| `ifcsheet_check_readiness` | What the model lacks that the drawings read. Same report as `ifcsheet check`. |
| `ifcsheet_generate_set` | The starting set. Gives a `document_id`. |
| `ifcsheet_apply_template` | A set made by the rules of a `.bvset` template. |
| `ifcsheet_load_project` | A set from a saved `.ifclite-project.json`. |
| `ifcsheet_list_sheets` | The sheets, their views and scales, the views not yet on a sheet. |
| `ifcsheet_add_view` | Adds a plan, elevation, section or axonometric view. |
| `ifcsheet_place_view` | Puts a view on a sheet at a scale. |
| `ifcsheet_set_title_block` | Sets title block fields for the project or one sheet. |
| `ifcsheet_renumber` | Renumbers sheets (`default` A-101 or `sequential` A01). |
| `ifcsheet_add_schedule` | Adds a schedule sheet: rooms, bill of quantities or a list. |
| `ifcsheet_undo`, `ifcsheet_redo` | Take back or repeat the last edit. |
| `ifcsheet_export_pdf` | The PDF, a page per sheet. |
| `ifcsheet_export_dxf` | A DXF per sheet. |
| `ifcsheet_issue_set` | PDF, DXFs, drawing register, schedules and, on request, a handover ZIP. |
| `ifcsheet_save_project` | Writes the set as a project file. |

Lengths are in metres, paper sizes in millimetres. A scale is its denominator: 100 means 1:100. The server also offers three ready-made prompts, `prepare_permit_set`, `update_set_for_new_model` and `check_readiness_and_fix`. They run a good order of the tools for you.

## When the model changes

Ask the assistant to open the new model, load your saved project, and add plans for new storeys. It uses `ifcsheet_open_model`, `ifcsheet_load_project`, `ifcsheet_list_sheets`, `ifcsheet_add_view`, `ifcsheet_place_view` and `ifcsheet_issue_set`. Your sheets and title block carry over.

## The hosted endpoint

The web app can offer the same drawing-set tools over the internet at `/mcp`, for assistants that cannot run a program on your computer. It is **off by default**. Whoever runs the app turns it on by setting the environment variable `IFCSHEET_HOSTED_MCP=1`. While it is off, `/mcp` answers 404.

How it differs from the local server:

- Only the `ifcsheet_*` tools are there. Other tools answer "Unknown tool".
- POST only, with JSON. There are no sessions. Each request starts from nothing, and nothing is stored.
- To use several tools in a row, send them together in one batch of at most 20 messages. They run in order and share their state. The first model opened in a batch is `sheetmodel-1`.
- You send the model inside the request as `ifc_base64`. A template or project goes in as `template_json` or `project_json`. `ifcsheet_export_pdf` without a path returns the PDF as `pdf_base64` in the reply.
- A model can be at most 25 MB, and a request has 50 seconds. If the hosting platform has a smaller body limit, that applies first (4.5 MB on Vercel).

A real batch of five calls (open, generate, title block, export, then a file path) gave:

```text
1  Opened 'model.ifc' as sheetmodel-1: project 'Projekt-FZK-Haus', 2 storeys, 317 meshes. ...
2  Laid out 4 sheets (A-101, A-201, A-202, A-301) with 9 views as sheetset-1. ...
3  Set phase for the project.
4  Exported 4 pages (270,223 bytes) as base64.
5  [ERROR] The hosted endpoint has no access to a file system: file paths are refused. ...
```

## Safety

- **Local server.** It reads and writes only inside the `--allow` folders. A path outside is refused: `Path '/etc/x.pdf' is outside allowed roots`.
- **Your IFC is never overwritten.** The tools write new files. The only copy of an IFC they can write is the optional annotated copy of `ifcsheet_issue_set`, as a new file.
- **Hosted endpoint.** It has no file system. Every file path (`file_path`, `directory`, any `*_path`) is refused. Results come back in the reply. Nothing is saved on the server.
- **Check what you send.** On the hosted endpoint your model travels over the internet to the server that runs the app. Use the local server for models that must stay on your computer.
- **Read the sheets.** The assistant lays out the set, but you are responsible for it. Open the PDF before it goes to anyone.

For the same engine from a terminal, see [Drawing sets from the command line](ifcsheet-cli.md).
