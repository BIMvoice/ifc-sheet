---
"@bimvoice/ifcsheet": minor
"@ifc-lite/viewer": patch
"@ifc-lite/mcp": patch
---

Generated names follow the language on the command line as in the app. `ifcsheet build` named the starting set in English whatever the project (a Romanian title block printed "Titlu planșă: Floor plans"). It now names the sheets, views and view templates in the language the project records (`language`), else `--locale ro|en`, else English, with the same strings the app's Romanian catalogue uses (`ENGINE_NAMES_RO`, one copy in the engine). The app records its language in the project when it starts the set; a project without one reads as before, and names already stored are never rewritten. `generateDefaultSet` takes a `language` option and writes it on the document; the engine exports `withNameLanguage`, `nameResolverFor` and `nameLanguageOf`. `ifcsheet build` now accepts `--locale` (it was refused with a usage error).
