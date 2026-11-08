# Automatically read note bodies and five highest-liked loaded comments

Status: resolved

## Scope

After either search entry returns note cards, keep the results visible without opening notes or reading comments. The user selects a note and clicks its read button to read that note's rendered body and comments. Keep AI generation explicit. Display progress, allow stopping, and retain the selected note's content if reading fails.

## Evidence and limits

Read visible DOM only, scroll the comment area and expand visible reply-load controls within a bounded collection window. Extract comment text, author and displayed like counts; deduplicate and sort by numeric likes (including 万/w/千/k). Return at most five. Never infer likes from DOM order or confuse post likes with comment likes. Record number of comments observed, unknown-like counts and whether loading ended or hit a bound; claim top-five only among comments actually loaded. Fewer than five or absent comments are reported honestly.

## Verification

Cover sorting/deduplication/nested replies, dynamic collection and cancellation, automatic queue advancement, failed-note retention, restoration, and AI payload/prompt provenance. Exercise the compiled extension against synthetic pages and local model responses. Sync source/build/docs to F after validation.

## Result (2026-11-08)

- Search results remain as cards. Only a user click starts reading one selected note's rendered body and comments; the reader supports stop/reload/retry and retains results if a note is unavailable. Legacy automatic queues stop after the current note.
- The DOM reader accumulates comments across bounded scroll/reply-expansion passes, deduplicates nested wrappers and replies, parses compact like counts, and keeps up to five highest-ranked comments. Coverage distinguishes end-of-loading, partial, unavailable and unknown-like cases. Comment authors are excluded from note-author extraction.
- The UI shows authors, numeric likes, comment text, observed counts and collection limits. AI input contains these comments alongside note evidence and the resume; instructions distinguish commenter views from note-author claims and prohibit claiming a global top-five ranking.
- Pending verification after switching to manual per-note reads.
- Changed application files have no diagnostics in the temporary TS5.9 check. Full repository checking still reports existing unrelated errors and missing bun:test types. Real logged-in Xiaohongshu/provider behavior was not tested.
