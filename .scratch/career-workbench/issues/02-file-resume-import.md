# 02: Import Resume Files

**What to build:** The user can select a supported resume file, review extracted content and normalized fields, edit the draft, and confirm a merge into a saved profile.

**Blocked by:** 01 Workbench Entry and Local Resume Profiles

**Status:** resolved

- [x] PDF, DOCX, and TXT files can be selected and parsed into a reviewable draft.
- [x] Basic details, job preferences, work, education, project experience, and self-introduction can be reviewed and edited.
- [x] Importing does not overwrite a saved profile until the user confirms the merge.
- [x] Unsupported, empty, and malformed files show actionable errors.

## Comments
Files are parsed locally. Field extraction uses local deterministic rules without an AI request; the editable merged draft is saved only after confirmation. Legacy .doc files are rejected with a .docx/PDF conversion hint.
