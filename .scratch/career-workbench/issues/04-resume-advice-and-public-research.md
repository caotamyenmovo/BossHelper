# 04: Resume Advice and Public Xiaohongshu Research

**What to build:** The user can analyze a saved resume for target roles and concrete edits, then find related public Xiaohongshu experience sharing with source links and a restricted-access fallback.

**Blocked by:** 01 Workbench Entry and Local Resume Profiles; 02 Import Resume Files

**Status:** resolved

- [x] The user explicitly starts analysis with the configured AI provider.
- [x] Resume analysis and research summaries use the model selected in the existing AI configuration; no parallel provider setup is added.
- [x] Analysis identifies target roles, supporting evidence, gaps, and concrete edits without inventing experience or metrics.
- [x] Search keywords are derived from target roles and public research results retain note title, blogger when available, and original URL.
- [x] Suggestions distinguish retrieved evidence from generated advice and include source links where applicable.
- [x] When automatic retrieval is unavailable, the UI explains the limitation and offers pasted-link or text input.
- [x] Importing a resume alone never sends it to an AI provider.

## Comments
Public retrieval uses indexed search results and attempts to read public page metadata; this is best-effort and does not use private APIs or bypass access restrictions.
