# Automatically read note bodies and five highest-liked loaded comments
Status: resolved

## Scope
After either search entry returns note sources, automatically read each note's rendered body and comments. Reuse one task tab and persist the queue/progress across options reloads. Keep AI generation explicit. Display progress, allow stopping, retain successful sources if individual notes fail.

## Evidence and limits
Read visible DOM only, scroll the comment area and expand visible reply-load controls within a bounded collection window. Extract comment text, author and displayed like counts; deduplicate and sort by numeric likes (including 万/w/千/k). Return at most five. Never infer likes from DOM order or confuse post likes with comment likes. Record number of comments observed, unknown-like counts and whether loading ended or hit a bound; claim top-five only among comments actually loaded. Fewer than five or absent comments are reported honestly.

## Verification
Cover sorting/deduplication/nested replies, dynamic collection and cancellation, automatic queue advancement, failed-note retention, restoration, and AI payload/prompt provenance. Exercise the compiled extension against synthetic pages and local model responses. Sync source/build/docs to F after validation.

## Result (2026-11-08)
- Both search entry points now queue rendered note bodies and comment collection automatically. The persisted queue reuses one tab, supports stop/reload/retry, and retains completed sources when a note is unavailable. Site blocks stop the queue with an actionable message.
- The DOM reader accumulates comments across bounded scroll/reply-expansion passes, deduplicates nested wrappers and replies, parses compact like counts, and keeps up to five highest-ranked comments. Coverage distinguishes end-of-loading, partial, unavailable and unknown-like cases. Comment authors are excluded from note-author extraction.
- The UI shows authors, numeric likes, comment text, observed counts and collection limits. AI input contains these comments alongside note evidence and the resume; instructions distinguish commenter views from note-author claims and prohibit claiming a global top-five ranking.
- 75 unit/regression tests passed; focused reader tests were rerun after the note-author isolation fix. Production Chrome output compiled successfully. Browser integration verified automatic body/top-five extraction without an extra click, correct ordering from seven unsorted comments, reload retention and author isolation. Local-relay browser integration verified comments/likes/provenance in the actual AI request and existing completion/cancel/timeout behavior.
- Changed application files have no diagnostics in the temporary TS5.9 check. Full repository checking still reports existing unrelated errors and missing bun:test types. Real logged-in Xiaohongshu/provider behavior was not tested.
