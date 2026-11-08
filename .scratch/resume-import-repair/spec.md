# Repair local resume imports

Status: resolved

## Scope
The user reports that Boss opens but import waits or times out, and file fields are unreliable. Keep extraction local and reviewable, without implicit AI requests.

## Findings and design
- Track Boss imports by extension tab ID, independent of URL query parameters. The background stores the pending task and complete result; content waits for actual stable resume data. Handle navigation, empty DOM, timeout, tab close, and option page reopen.
- Prefer explicit resume containers and section headings, ignore hidden menus/editor placeholders, and share the local field/experience parser between files and DOM extraction.
- Parse labelled/multiline fields, common section aliases, dated school/company/project records, and PDF rows without inserting spaces into every Chinese glyph. Do not invent missing values.
- Clear source state when switching imports; prevent late imports from applying to a new source and report empty extraction.

## Validation
Regression fixtures for original failure patterns, DOM/loading tests, import handoff lifecycle tests, existing career/storage tests, type checking and Chrome production build. Live authenticated Boss validation depends on the user's browser session; report its absence honestly.

## Result (2026-11-08)
- Implemented background-owned tab/token handoff with persistent pending/result state, sender checks, timeout, old-result rejection, tab-close handling and recovery after options reload.
- Removed document-start DOM access and detached-DOM text flattening. Added visible resume container/record extraction, stable-content waiting, hidden editor/menu exclusion and empty-result checks.
- Added shared section/experience/label parsing, date-range boundaries, ASCII/full-width pipes, multiline fields, section aliases, PDF baseline/glyph spacing and UTF-16/GB18030 TXT decoding. PDF worker resources are destroyed after extraction.
- Reset source state between imports, retain complete raw preview, report missing fields, and replace structuredClone on nested Vue proxy records with JSON cloning for edit/save.
- 32 Bun regression tests and the existing Node storage test passed. A clean Chrome profile loaded the production extension and passed synthetic delayed Boss navigation/import, options reload, TXT replacement, confirmed persistence, actual PDF import and actual DOCX import. No authenticated live Boss session was used.
- Chrome production build passed. Normal `check` is blocked by the existing vue-tsc/TypeScript 7 incompatibility. Running vue-tsc with a temporary TypeScript 5.9 compiler found no errors in changed application files; unrelated repository typing issues remain.

## Reproduce
- `bun run test:resume`
- `bun run build:chrome`
- `bun run test:resume:browser` (Windows Chrome default; set BOSS_TEST_CHROME for another executable)
- `node --test scripts/use-json-storage.test.ts`


## Follow-up: screenshot field mapping (2026-11-08)
Status: resolved

The user supplied a screenshot showing missing internship editing, a Boss completeness hint used as a major, school badge `省部共建` used as another major, job-type/industry text used as target roles, and placeholder `无无` in self-introduction.

- Add independent internship experience storage, parsing, editing and AI context; legacy profiles default to an empty internship list.
- Filter UI prompts/placeholders and school badges before choosing major/title; support date-first headers and preserve sections even without dates.
- Preserve partially uncovered records when DOM selectors identify only some entries. Read standalone internship sections and internship titles in mixed work sections.
- Add explicit field labels for school/major/company/position/dates.
- Regression evidence includes the screenshot text, DOM with partial record selectors, existing-profile compatibility and browser editor assertions.

### Follow-up result
- Independent internship fields now persist and appear in the editor, local parser, Boss reader, and explicit AI context. Existing profiles retain their work history.
- Screenshot regression correctly maps 桂林电子科技大学 → 网络空间安全 and 江西理工大学 → 软件工程, excluding completeness hints and school badges from majors; role/type/industry and self-introduction placeholders are filtered.
- Recognizing another source replaces all parsed draft fields, including empty fields, so old work/internship entries cannot leak into the new import. The preview explains this before recognition; persistence still requires confirmation.
- 38 unit regressions across five files passed. The final Chrome build passed, and the production extension browser test passed delayed synthetic Boss loading, separate work/internship editors, both majors, reload recovery, TXT replacement without stale experiences, saving, PDF and DOCX import. Browser preview saved as `fields-preview.png` (synthetic fixture).
- Authenticated live Boss layouts were not tested. Previously saved incorrect fields require re-import and confirmation.

## Follow-up: combined experience and full-width fields (2026-11-08)
Status: resolved

- User requests one 工作/实习经历 editor. Combine both stored arrays in the editor with reference-preserving edit/delete, retaining compatibility with saved profiles and parsed imports.
- Screenshot shows cities in target roles and controls constrained to the right. Filter exact common city names and full labelled location lines; retain genuine job titles including 城市规划师.
- Use a full-width tag editor for multiple roles (Enter/paste/blur), and a full-width autoresizing self-introduction textarea. Override the global horizontal form-field orientation locally.
- Validate combined edit/delete/save, role entry and city exclusion, control widths, production build, and sync to F with backup/hash checks.

### Combined editor result
- Unified work/internship editor preserves both existing arrays and supports editing/removing records from either source. New entries use the same combined editor.
- Full-width role tags support Enter and blur commits, paste delimiters, and individual deletion. Self-introduction is full-width, six rows initially, autoresizing and manually resizable.
- Browser save validation uncovered numeric-keyed objects from reactive-array persistence. Resume saves now JSON-clone before storage; existing numeric-keyed role/experience objects normalize back to arrays when loaded.
- 42 unit tests passed. Chrome production build and browser integration passed, including city exclusion, merged work/internship fields, tag entry with spaces, field widths above 90% of editor width, internship edits and deletion, persistence of true arrays, and existing Boss/TXT/PDF/DOCX flows.
- Temporary TypeScript 5.9 check has no diagnostics in changed application files; unrelated repository diagnostics and normal TypeScript 7/vue-tsc incompatibility remain.
