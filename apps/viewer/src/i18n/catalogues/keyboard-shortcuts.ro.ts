/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for the Info dialog the Keyboard button opens (#314): its tabs and footer,
 * the About and What's New tabs, the Learn tab and the group titles of the Shortcuts
 * tab (`keyboard-shortcuts.en.ts`, plus the keys the dialog takes from `commands.en.ts`,
 * `tours.en.ts` and `viewer-shell.en.ts`). The release notes themselves are the project's
 * own text and stay as written. Product names, version numbers and key names are not
 * translated. Term choices: `../ro-glossary.md`.
 */
export const keyboardShortcutsRo = {
  'keyboardShortcuts.header.title': 'Informații',
  'keyboardShortcuts.header.mcpAriaLabel': 'Deschide ifc-lite MCP — comandați ifc-lite din orice LLM',
  'keyboardShortcuts.header.mcpCta': 'Comandați din orice LLM',

  'keyboardShortcuts.tabs.about': 'Despre',
  'keyboardShortcuts.tabs.whatsNew': 'Noutăți',
  'keyboardShortcuts.tabs.shortcuts': 'Comenzi rapide',
  'keyboardShortcuts.tabs.learn': 'Învățare',

  'keyboardShortcuts.footer.pressPrefix': 'Apăsați',
  'keyboardShortcuts.footer.toggleSuffix': 'pentru a afișa sau a ascunde acest panou',

  'keyboardShortcuts.privacy.banner': 'Modelele locale se vizualizează pe dispozitivul dvs.',
  'keyboardShortcuts.privacy.intro': 'Vizualizarea locală a modelelor folosește',
  'keyboardShortcuts.privacy.wasmLink': 'WebAssembly (WASM)',
  'keyboardShortcuts.privacy.outro': 'în browser. Importurile din cloud folosesc descărcări găzduite și, pentru Forma și Data Exchange, conversie pe server.',
  'keyboardShortcuts.privacy.verifyIntro': 'Verificați: apăsați',
  'keyboardShortcuts.privacy.verifyKey': 'F12',
  'keyboardShortcuts.privacy.verifyOutro': '→ fila Network → inspectați cererile funcțiilor activate.',

  'keyboardShortcuts.about.appName': '{app}',
  'keyboardShortcuts.about.versionLabel': 'v{version}',
  'keyboardShortcuts.about.homepageLink': 'ifclite.dev',
  'keyboardShortcuts.about.docsLink': 'Documentație',
  'keyboardShortcuts.about.githubLink': 'IfcSheet pe GitHub',
  'keyboardShortcuts.about.reportIssueLink': 'Raportați o problemă IfcSheet',
  'keyboardShortcuts.about.license': 'MPL-2.0',
  'keyboardShortcuts.about.packagesCount': { one: '{count} pachet', few: '{count} pachete', other: '{count} de pachete' },

  'keyboardShortcuts.whatsNew.empty': 'Nu există un istoric al versiunilor.',
  'keyboardShortcuts.whatsNew.currentVersion': 'Folosiți versiunea v{version} a vizualizatorului',
  'keyboardShortcuts.whatsNew.perPackageHint': 'rândurile de mai jos sunt versiunile pe pachete',
  'keyboardShortcuts.whatsNew.releaseVersionLabel': 'v{version}',
  'keyboardShortcuts.whatsNew.viewerBadge': 'vizualizator',
  'keyboardShortcuts.whatsNew.changeCount': { one: '{count} modificare', few: '{count} modificări', other: '{count} de modificări' },
  'keyboardShortcuts.whatsNew.legendFeature': 'Funcție nouă',
  'keyboardShortcuts.whatsNew.legendFix': 'Remediere',
  'keyboardShortcuts.whatsNew.legendPerf': 'Performanță',

  'keyboardShortcuts.shortcuts.learnMore': 'Aflați mai multe:',
  'keyboardShortcuts.shortcuts.homepageLink': 'ifclite.dev',
  'keyboardShortcuts.shortcuts.docsLink': 'documentație',

  // The group titles of the Shortcuts tab.
  'commands.category.editing': 'Editare',
  'commands.category.tools': 'Instrumente',
  'commands.category.selection': 'Selecție',
  'commands.category.visibility': 'Vizibilitate',
  'commands.category.camera': 'Cameră',
  'commands.category.search': 'Căutare',
  'commands.category.wall': 'Panoul',
  'commands.category.drafting': 'Desenare',
  'commands.category.ui': 'Interfață',
  'commands.category.help': 'Ajutor',

  // The rows of the Shortcuts tab on the Wall (the table is `lib/commands/keyboard-commands.ts`, the English `commands.en.ts`); the rest of its rows are the Wall's own, in `wall-keys.ro.ts`.
  'commands.ui.commandPalette': 'Paleta de comenzi',
  'commands.wall.prevSheet': 'Planșa anterioară',
  'commands.wall.nextSheet': 'Planșa următoare',
  'commands.drafting.undo': 'Anulează ultima acțiune',
  'commands.drafting.redo': 'Reface acțiunea anulată',
  'commands.drafting.snap': 'Pornește sau oprește fixarea pe puncte',
  'commands.drafting.ortho': 'Pornește sau oprește modul ortogonal (sau țineți apăsat Ctrl)',
  'commands.drafting.copy': 'Copiază elementele desenate selectate',
  'commands.drafting.paste': 'Lipește elementele copiate (clic pentru a le așeza)',
  'commands.drafting.duplicate': 'Dublează selecția pe loc, decalată',
  'commands.drafting.cancel': 'Anulează comanda',
  'commands.drafting.erase': 'Șterge selecția',
  'commands.drafting.confirm': 'Confirmă sau repetă ultima comandă',
  'commands.help.shortcuts': 'Arată comenzile rapide de la tastatură',

  // The Learn tab.
  'tours.learnTab.description': 'Parcursurile interactive rulează pe modelul dvs. sau pe proiectul demo inclus. Orice pas poate fi omis.',
  'tours.learnTab.completedAriaLabel': 'Încheiat',
  'tours.learnTab.replay': 'Reluați',
  'tours.learnTab.start': 'Începeți',
  'tours.learnTab.minutes': '{count} min',

  'viewerShell.dialog.close': 'Închide',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
