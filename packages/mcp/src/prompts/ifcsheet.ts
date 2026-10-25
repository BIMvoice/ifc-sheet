/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Prompts of the drawing-set tools (#165): guided sequences over the `ifcsheet_*` tools. Each names the tools in order and the inputs
 * it needs, and tells the agent to say only what a tool returned. They make no claim about what a permit authority requires: what a
 * set has to hold for a given authority is the office's to know, and the tools only report what the model and the set contain.
 */

import type { Prompt } from './types.js';

const user = (text: string) => ({ role: 'user' as const, content: { type: 'text' as const, text } });

/** `value` or a placeholder the agent must ask for. */
const given = (value: string | undefined, placeholder: string): string => (value?.trim() ? value.trim() : `<${placeholder}: ask the user>`);

const GROUND_RULES = [
  'Ground rules:',
  '- Say only what a tool returned. Quote its numbers, sheet numbers and notes; do not infer, estimate or fill a gap yourself.',
  '- Make no claim that the set meets a legal or authority requirement. You can say what the tools found and what they did not.',
  '- A tool that returns isError stops the step: read its message, fix the input or ask the user, and do not go on as if it had worked.',
  '- The tools never write an .ifc file or the model that was opened, and write only inside the folders the server allows.',
  '- The DXF files hold lines and no text. The plain title block of the PDF prints project, sheet number and name, scale and date; the other title block fields are kept in the project for the app\'s title block layouts.',
].join('\n');

export const preparePermitSet: Prompt = {
  name: 'prepare_permit_set',
  description: 'Prepare a permit set (Romanian DTAC): open the model, lay out the set, fill the title block, add the room schedule and check Au, check readiness, then issue the PDF, DXFs, register and handover package.',
  arguments: [
    { name: 'model_path', description: 'Path of the IFC file on the server (inside the allowed folders).', required: true },
    { name: 'output_dir', description: 'Folder to issue into (inside the allowed folders).', required: true },
    { name: 'template_path', description: 'A .bvset set template to lay the set out by. Without it the default set is generated.', required: false },
    { name: 'phase', description: 'Project phase for the title block, default DTAC.', required: false },
    { name: 'project_number', description: 'Project number for the title block.', required: false },
    { name: 'address', description: 'Site address for the title block.', required: false },
    { name: 'project_manager', description: 'Sef proiect, for the title block.', required: false },
    { name: 'designer', description: 'Proiectat, for the title block.', required: false },
    { name: 'drawn_by', description: 'Desenat, for the title block.', required: false },
    { name: 'checked_by', description: 'Verificat, for the title block.', required: false },
    { name: 'client', description: 'Client, for the title block.', required: false },
    { name: 'date', description: 'Issue date, ISO YYYY-MM-DD.', required: false },
    { name: 'au_reference', description: 'The useful area (Au) in square metres from the project\'s own documents, to compare with the schedule\'s total.', required: false },
  ],
  render(args) {
    const fields = [
      `phase: ${JSON.stringify(args.phase?.trim() || 'DTAC')}`,
      ...([['projectNumber', args.project_number], ['address', args.address], ['projectManager', args.project_manager], ['designer', args.designer], ['drawnBy', args.drawn_by], ['checkedBy', args.checked_by], ['client', args.client], ['date', args.date]] as const)
        .filter(([, v]) => v?.trim()).map(([k, v]) => `${k}: ${JSON.stringify(v!.trim())}`),
    ];
    const layout = args.template_path?.trim()
      ? `3. ifcsheet_apply_template with {model_id, template_path: ${JSON.stringify(args.template_path.trim())}}. Read the notes: they say which rules found no view in this model and what the template did not foresee. Keep the document_id it returns.`
      : '3. ifcsheet_generate_set with {model_id}. Keep the document_id it returns; it lists the sheets, views and notes.';
    return {
      description: 'Prepare a permit set (Romanian DTAC) from an IFC model',
      messages: [
        user([
          'Prepare the drawing set of a permit application (Romanian DTAC) with the ifcsheet_* tools. Work in this order and report after each step.',
          '',
          GROUND_RULES,
          '',
          `1. ifcsheet_open_model with {file_path: ${JSON.stringify(given(args.model_path, 'model_path'))}}. Keep the model_id. Report the project name, the storeys with their elevations and the building's extent.`,
          '2. ifcsheet_check_readiness with {model_id}. Report ready and each finding (what is missing, what is weaker). If it is not ready, tell the user and ask whether to go on; do not hide the findings.',
          layout,
          `4. ifcsheet_set_title_block with {document_id, fields: {${fields.join(', ')}}}, calling it first with dry_run true and reading the "changed" it returns. Set only the fields given here; ask the user for the others (projectNumber, address, projectManager, designer, drawnBy, checkedBy) rather than invent them. Field names are those of ifcsheet_set_title_block; use ifcsheet_list_sheets to read what the title block holds afterwards.`,
          '5. ifcsheet_add_schedule with {document_id, kind: "rooms", locale: "ro"}. It adds the room and area schedule as a sheet in the A-601 series. Its result has total_row: the last row of the table, the building total (Au) by the engine\'s area rule (the model\'s NetFloorArea, else GrossFloorArea, else the footprint of the room\'s geometry). Report total_row, rows_left_off and the notes. Which rooms\' areas come from the geometry and not from the model is in the CSV that ifcsheet_issue_set writes (schedules/), in its source column.',
          args.au_reference?.trim()
            ? `   Compare that total with ${args.au_reference.trim()} m2 (the figure the user gave). Report both and the difference; do not change either.`
            : '   Ask the user for the Au figure of their documents to compare, or report the schedule\'s total alone.',
          '6. ifcsheet_list_sheets with {document_id}. Report the sheets (number, name, paper, scale) and any view that is not placed on a sheet.',
          '7. ifcsheet_check_readiness again with {model_id}, and say what changed since step 2.',
          `8. ifcsheet_save_project with {document_id, file_path: ${JSON.stringify(`${given(args.output_dir, 'output_dir')}/project.ifclite-project.json`)}}, so the set can be reloaded.`,
          `9. ifcsheet_issue_set with {document_id, directory: ${JSON.stringify(given(args.output_dir, 'output_dir'))}, handover: true}. Report every file written with its size, the page count and the sheet numbers.`,
          '',
          'Finish with a short summary: what was issued and where, what the readiness check found, the Au total, and what you could not do or did not check.',
        ].join('\n')),
      ],
    };
  },
};

export const updateSetForNewModel: Prompt = {
  name: 'update_set_for_new_model',
  description: 'Update a saved drawing set for a new version of the model: open the new IFC, load the saved project on it, look for storeys without a plan, check readiness and issue again.',
  arguments: [
    { name: 'model_path', description: 'Path of the new IFC file on the server.', required: true },
    { name: 'project_path', description: 'Path of the saved project (.ifclite-project.json) the set was last saved as.', required: true },
    { name: 'output_dir', description: 'Folder to issue into.', required: true },
    { name: 'handover', description: '"true" to write handover.zip as well.', required: false },
  ],
  render(args) {
    const handover = args.handover?.trim().toLowerCase() === 'true';
    const out = given(args.output_dir, 'output_dir');
    return {
      description: 'Update a saved drawing set for a new model version',
      messages: [
        user([
          'Update a saved drawing set for a new version of the model with the ifcsheet_* tools. Work in this order and report after each step.',
          '',
          GROUND_RULES,
          '',
          `1. ifcsheet_open_model with {file_path: ${JSON.stringify(given(args.model_path, 'model_path'))}}. Keep the model_id; note the storeys and their elevations.`,
          `2. ifcsheet_load_project with {model_id, project_path: ${JSON.stringify(given(args.project_path, 'project_path'))}}. The views, sheets, title block and numbering come back as saved and the plans are cut on the new model's storeys. Keep the document_id. A refusal says why the file cannot be used.`,
          '3. ifcsheet_list_sheets with {document_id}. Compare the plan views (kind "plan", by their level) with the storeys from step 1. Name every storey that has no plan view and every plan whose level the new model does not have. The tools do not compare the two versions of the model beyond this; say so rather than guess at other changes.',
          '4. For each storey without a plan: ifcsheet_add_view with {document_id, kind: "plan", level: <storey name>, dry_run: true} to see it, then without dry_run, then ifcsheet_place_view with {document_id, view} (dry_run true first). Ask the user before removing or changing anything that is already in the set; the tools add and move views, they do not delete them.',
          '5. ifcsheet_check_readiness with {model_id}. Report what the new model lacks.',
          '   Schedule sheets in the set (rooms, bill of quantities) are read from the model each time the set is drawn, so the issue below carries the new model\'s figures; ifcsheet_add_schedule is only needed for a schedule the set does not have.',
          `6. ifcsheet_save_project with {document_id, file_path}: give a new file name beside the old one unless the user asked to replace it; an existing file at that path is replaced.`,
          `7. ifcsheet_issue_set with {document_id, directory: ${JSON.stringify(out)}${handover ? ', handover: true' : ''}}. Report the files, the page count and the sheet numbers.`,
          '',
          'Finish with a short summary: what was carried over, what was added, what the readiness check found, and what you did not check.',
        ].join('\n')),
      ],
    };
  },
};

export const checkReadinessAndFix: Prompt = {
  name: 'check_readiness_and_fix',
  description: 'Check what the model lacks that the drawings read, explain each finding, and say what can be done in the set and what only the model\'s author can fix.',
  arguments: [
    { name: 'model_path', description: 'Path of the IFC file on the server. Not needed when model_id is given.', required: false },
    { name: 'model_id', description: 'A model_id from ifcsheet_open_model, when the model is already open.', required: false },
    { name: 'project_path', description: 'A saved project (.ifclite-project.json), to check its split schedules as well.', required: false },
  ],
  render(args) {
    const open = args.model_id?.trim()
      ? `1. The model is open as ${JSON.stringify(args.model_id.trim())}; do not open it again.`
      : `1. ifcsheet_open_model with {file_path: ${JSON.stringify(given(args.model_path, 'model_path'))}}. Keep the model_id.`;
    const project = args.project_path?.trim() ? `, project_path: ${JSON.stringify(args.project_path.trim())}` : '';
    return {
      description: 'Check readiness and say what to fix',
      messages: [
        user([
          'Check whether a model has what its drawing set reads, with the ifcsheet_* tools, and say what to fix.',
          '',
          GROUND_RULES,
          '',
          open,
          `2. ifcsheet_check_readiness with {model_id${project}}. If ready is true, say so and stop. Otherwise, for each finding give its kind, what is missing, which drawings or schedules are weaker for it, and the counts.`,
          '3. For each finding say who can fix it. None of these tools edits the IFC: what the model lacks (storeys, rooms, materials, quantity sets, unique GlobalIds) has to be added by whoever authors the model, in the authoring tool, and the model re-exported. Say what to ask for in plain words, using only what the finding says.',
          '4. If the user wants to see the effect, ifcsheet_generate_set with {model_id}, then ifcsheet_list_sheets with {document_id}, and say which sheets the findings touch. Do not claim a drawing is wrong unless the finding says it is weaker.',
          '5. After the model is re-exported, repeat from step 1 with the new file and compare the findings.',
          '',
          'Finish with a list: finding, what is weaker, what to ask the model\'s author for.',
        ].join('\n')),
      ],
    };
  },
};

export const ifcsheetPrompts: Prompt[] = [preparePermitSet, updateSetForNewModel, checkReadinessAndFix];
