# ADR 0002: Use Public Job-Experience Sources with an Import Fallback

**Status:** Accepted

## Context

The workbench should find Xiaohongshu experience sharing related to the user's target role and provide verifiable source links. The current public Xiaohongshu Open Platform documentation lists e-commerce APIs; no public note or blogger search API was found. Public pages may also require login or restrict automated access.

## Decision

The first release searches and reads only content that is publicly accessible through the chosen retrieval source. Search results retain their source links. If a page cannot be retrieved, the workbench offers user-pasted links or imported text as a fallback. It does not depend on undocumented/private APIs or attempt to bypass login or access restrictions.

## Consequences

- Retrieval is best-effort and must show when automatic access failed.
- The search/retrieval source should be replaceable without changing resume and interview flows.
- Recommendations must distinguish source-grounded observations from generated suggestions and preserve links for verification.
- A first release may have incomplete coverage when Xiaohongshu content is not publicly indexed or accessible.

## Clarification (2026-11-08)

A user-initiated search may open Xiaohongshu in a browser tab and read the rendered search cards or note text visible in that tab. The user handles ordinary login or verification on the website. This does not call undocumented search APIs or bypass website restrictions. Card titles, snippets and full visible text must be distinguished when generating advice; a blocked webpage must be reported as blocked rather than as zero matching posts.


## Source-grounded editing (2026-11-08)

The primary advice action requires a resume, role and nonempty source text. Title-only cards are excluded from model input. Users may read a selected note in a normal browser tab to replace its card with rendered body text; other collected sources are retained. Login and verification remain user actions. Advice must identify source evidence and the resume passage to revise, preserve known facts, and label missing information or unsupported generic suggestions. Resume-only analysis is an optional separate action.


## Automatic note/comment reading (2026-11-08)

A user-initiated search now automatically queues the returned notes for rendered-body and comment reading. One task tab is reused, with persisted progress and per-note/overall deadlines. Comment loading is bounded and limited to normal scrolling and visible reply-loading controls. Store the five highest displayed like counts among observed, deduplicated comments with author, text and explicit coverage. Unknown-like counts are excluded from ranking. Stops retain evidence; site blocks are reported without bypassing restrictions. AI generation still requires the explicit generation action and distinguishes comment opinions from note-author claims.
