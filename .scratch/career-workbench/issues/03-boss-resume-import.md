# 03: Import Resume from Boss

**What to build:** The user can ask the workbench to open Boss personal resume details and import readable data into a reviewable draft, with a retry and file-import fallback when access fails.

**Blocked by:** 01 Workbench Entry and Local Resume Profiles

**Status:** resolved

- [x] The import action opens the Boss personal resume page.
- [x] Readable basic details, job preferences, work, education, project experience, and self-introduction are mapped into a draft.
- [x] Logged-out, unsupported, or changed pages report why import failed and offer retry or file import.
- [x] No undocumented endpoint or login/access-control bypass is used.
- [x] Boss data is not saved or sent to AI until the user reviews and confirms the draft.

## Comments
The handoff is bound to the browser tab and an opaque token in the extension background. The content script waits for the actual resume DOM to stabilize, preserves section boundaries, and returns both text and locally parsed fields. Pending/result state survives page reloads and background restart. Navigation query strings are not required. An authenticated live Boss session is still required for site-specific verification.
