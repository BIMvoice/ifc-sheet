# Romanian glossary (ro)

One place to correct term choices. Edit the term here and in `catalogues/*.ro.ts`
(`command-palette`, `feedback`, `selection-bar`, `settings`, `wall`, `wall-keys`, `sheets`, `check`, `issue`, `whatchanged`, `sheet-content`, `review`, `print-preview`, `tag-fields`, `revisions`, `face`, `drafting`, `annotate-all`, `keyboard-shortcuts`, `sheet-templates`, `wall-materials`, `export-dialog`, `geometry-export-dialogs`, `sheets-pdf`, `anonymized-export`, `export-changes-review`, `ion-upload`); the tests in
`locales/ro.test.ts` keep keys, placeholders and diacritics honest.

Rules: comma-below diacritics only (ș ț, never ş ţ), plus ă â î. Polite plural
imperative for instructions ("Deschideți…"). Romanian quotation marks „…”.
Product and format names stay as they are: IfcSheet, IFC, DXF, PDF, SVG, CSV, BIMvoice.
Command names typed by the user (CHECKSET, ISSUE, WHATCHANGED, DRAFTSET, LINE, TAGALL) stay as typed, and so do the option words a command line prompt offers (Close, Undo, SINGLE, MARK / NAME / CLASS). Where a figure counts one kind of thing, the entry has the forms Romanian counts with (1 subiect, 2 subiecte, 20 de subiecte); where it counts several, the figure follows a colon.

| English | Romanian | Note |
|---|---|---|
| Wall (the board of sheets) | Panou | The metaphor is a pinboard; "perete" would read as a building wall. |
| Sheet | Planșă | 1 planșă, 2 planșe, 20 de planșe |
| Drawing set | Set de planșe | |
| View | Vedere | 1 vedere, 2 vederi, 20 de vederi |
| Drawing (on a sheet) | Desen | |
| Plan / floor plan | Plan | |
| Section | Secțiune | |
| Elevation | Fațadă | |
| Detail | Detaliu | |
| Title block | Cartuș | |
| Scale | Scară / Scara | "Scara" in the title block, "Scară" as a field name |
| Schedule | Tabel | Door and window schedule: "Tabel de tâmplărie (uși și ferestre)" |
| Material takeoff | Extras de materiale | |
| Dimension (a tool, the act) | Cotare | A single dimension is a "cotă"; "Cotează întregul plan" |
| Level mark | Cotă de nivel | |
| Section mark | Marcaj de secțiune | |
| Tag | Etichetă | |
| Note | Notă | |
| Symbol | Simbol | |
| Level / storey | Nivel | |
| Room | Încăpere | 1 încăpere, 2 încăperi, 20 de încăperi |
| Door / window | Ușă / fereastră | 20 de uși, 20 de ferestre |
| Area | Arie | In the takeoff column (Arie m²). |
| Built area (Ac) / Gross developed area (Ad) / Useful area (Au) | Aria construită / Aria desfășurată / Aria utilă | The urban indicators, #258. Ac, Ad, Au, POT and CUT stay as the abbreviations a Romanian drawing prints; "Ad pentru CUT" is Ad counted for CUT |
| Usable / built / gross floor area (Su, Sc, Sd) | Aria utilă / construită / desfășurată (Su, Sc, Sd) | The area summary under the room schedule, #42: the same figures as Au, Ac, Ad on the urban sheet, under the names of the permit forms. Sd is Ad (all levels, basements included), not Ad pentru CUT; a lower bound reads "≥ 120,00" |
| Perimeter | Perimetru | The room schedule's column, "Perimetru m" |
| Room and area schedule | Tabel de încăperi și arii | #42. Heading of the area column: "Arie utilă m²", as on the urban sheet; the building total reads "Total clădire (Au)"; a room on no level is "Fără nivel" |
| POT / CUT | POT (procent de ocupare a terenului) / CUT (coeficient de utilizare a terenului) | Only the abbreviation is printed on the sheet |
| Site balance | Bilanț teritorial | The table on the site plan |
| Site area / plot area | Suprafața terenului | One term for both, as on a Romanian site plan; "teren" in the short POT and CUT formulas |
| Basement | Subsol | Level elevation: "Cota"; ±0,00 takes the decimal comma |
| Slab (floor structure) | Planșeu | Not "planșă", which is a sheet |
| Cut / fill (civil) | Debleu / rambleu | |
| Volume | Volum | |
| Cut height | Înălțimea de secționare | |
| Window head / sill | buiandrug / parapet | |
| Issue the set | Emite setul | "Emitere" for the act; the issue record is "Emitere" in the drawing list |
| Revision | Revizie | |
| Revision cloud | Nor de revizie | |
| Comment (on a sheet) | Comentariu | "Comentarii" for the list; resolved is "Rezolvat" |
| Site plan / key plan | Plan de situație / Plan de încadrare | |
| Print preview | Previzualizare la tipărire | The toolbar button: "Previzualizare la dimensiunea hârtiei" |
| What is missing | Ce lipsește | |
| Client | Beneficiar | Title block |
| Title (of a sheet, in the title block) | Titlu planșă | |
| Untitled project | Proiect fără titlu | |
| Generated names | Planuri, Fațade sud și nord, Fațade est și vest, Secțiuni, Tabele; Fațada nord/est/sud/vest; Secțiunea A-A; Detaliu 1 - … | Resolved once at creation (`names.*`), stored as plain text, never re-translated |
| Drawn by / Checked by | Desenat / Verificat | As printed in Romanian title blocks |
| Sheet no. | Nr. planșă | |
| General designer (title block) | Proiectant general | The firm that holds the design; the title block's organisation |
| Project manager (title block) | Șef proiect | |
| Designed by (title block) | Proiectat | With "Desenat" and "Verificat" |
| Phase (of the design, title block) | Faza | Written as the issue names them: PAC (DTAC before 25 August 2026), PTh, DE; typed, never translated |
| Project no. (title block) | Proiect nr. | |
| Signature (title block) | Semnătura | The empty box for a signature on the title block (F_01, Ordinul 975/2026); F_01 names no stamp |
| Requirement verified (title block) | Cerința | The quality requirement of Law 10/1995 the verifier checked |
| Paper | Hârtie | Paper format: "Format" |
| Landscape / Portrait | Orizontal / Vertical | |
| As indicated | Conform indicațiilor | |
| Hatch | Hașură | |
| Pattern (of a hatch) | Tipar | Not "model", which reads as the IFC model; "Tipare de hașură" |
| Reshaped (what changed) | Formă modificată | Not "remodelat", for the same reason |
| Leaf (of a door or window) | Canat | The leaf itself, never the way it opens: "Canat batant", "Canat glisant" |
| Swing (door) | Canat batant | Neuter "canat" takes "batant"; on its own, of a door, "batantă" |
| Double-acting (door) | Canat pendulant | As above: "pendulant", "pendulantă" of a door |
| Bottom-hung (tilt) | Oscilant | Not "basculant" |
| Top-hung | Proiectant | |
| Tilt and turn | Oscilo-batant | |
| Pivot, horizontal axis | Pivotant, ax orizontal | The only opening "basculant" may describe |
| Pivot, vertical axis | Pivotant, ax vertical | |
| Frame (of a door or window) | Toc | "Toc și canat" for the section; the frame's depth and width are "Adâncime toc", "Lățime toc" (`joinery.*`, #475) |
| Mullion / transom | Montant / traversă | The vertical and horizontal bars between the fields of a window |
| Panel (a field of the window grid) | Câmp | Not "panou", which is the Wall |
| Window board / external sill | Glaf interior / glaf exterior | Not "parapet", which is the wall under the window |
| Threshold | Prag | |
| Glazing | Vitraj | The glass colour is "Sticlă" |
| Library | Bibliotecă | |
| Project navigator | Navigatorul de proiect | |
| Keyboard (settings) | Tastatură | |
| Key / key combination | Tastă / combinație de taste | "Tasta implicită" for the default key |
| Shortcut | Comandă rapidă | "Comenzile rapide" for the list |
| Customise (keys) | Personalizați | |
| AutoCAD mode | Modul AutoCAD | Typed aliases (Z, U, PLOT…) stay as typed |
| Ortho (mode) | Modul ortogonal | As `wall.ortho.*` |
| Snap (to points) | Fixarea pe puncte | |
| Command line | Linia de comandă | Prompt: "Comandă:"; `*Anulat*` for `*Cancel*` |
| Specify (a point) | Specificați | Polite plural imperative, as in "Specificați primul punct:" |
| Select (objects) / pick | Selectați / Alegeți | Selectați obiectele; Alegeți un punct |
| Polyline | Polilinie | |
| Dimension (the figure) / string of dimensions | Cotă / șir de cote | "Cotare" is the act; 1 cotă, 2 cote, 20 de cote |
| Extension line / dimension line | Linie de ajutor / linie de cotă | |
| Leader | Linie de indicație | |
| Revision cloud (REVCLOUD) | Nor de revizie | |
| Grid axis / bubble | Axă / bulă | |
| Offset / Trim / Extend / Fillet / Mirror | Decalare / Tăiere / Prelungire / Racordare / Oglindire | Commands stay OFFSET, TRIM, EXTEND, FILLET, MIRROR |
| Erase / Move / Copy / Rotate | Ștergere / Mutare / Copiere / Rotire | Commands stay ERASE, MOVE, COPY, ROTATE |
| Ceiling plan (reflected) | Plan de plafoane (reflectat) | CEILTAG |
| Info (the dialog behind Keyboard) | Informații | Tabs: Despre, Noutăți, Comenzi rapide, Învățare |
| Sheet template | Șablon de planșă | The built-in ones: Planuri, Detalii, Fațade în format lung, Tabele; the paper follows in parentheses |

## Not translated yet

The 3D viewer around the Wall (ribbon, panels, dialogs; the face covers it and makes it inert, so only what `IfcSheetShell` keeps is translated: the command palette, the Settings dialog, the feedback dialog and a drawing's annotation bar, and the export dialogs its palette opens: IFC, GLB, KMZ, USD, energy model, the to-scale PDF, the anonymized subset, the review before the modified IFC and the Cesium ion upload), the drafting tools' panels
and ribbon labels (`drafting.tool.*`, `drafting.props.*`; the command line and its messages are Romanian since #314), the sheet PDF setup and title-block dialogs (`sheetsPdf.sheetSetup.*`, `sheetsPdf.titleBlock.*`) and the
drafting standards stay English; a missing key falls back to English one by one.
The "Detail marks" drafting layer name, the sheet name of a new blank schedule
sheet made before this change, and anything a person typed are stored text and stay
as they were. Storey names come from the IFC and are never translated.
