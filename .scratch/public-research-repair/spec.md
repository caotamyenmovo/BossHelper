# Repair Xiaohongshu research retrieval
Status: resolved

## Evidence
The supplied screenshot reports no accessible public results. Live requests with Java and security/product roles return HTTP 200 from Bing but links to other domains; strict Xiaohongshu filtering leaves an empty list. The existing UI conflates unavailable indexed notes with absence of matching posts, and only offers pasted text.

## Design
- Retain public index lookup with shorter queries, relative redirect support, multiple result containers, exact note-host/path validation, and distinct network/verification/no-note messages.
- Add primary Xiaohongshu webpage search using a user-opened browser tab. Read rendered search cards or visible note text through an isolated content script only after an extension request. Normal login/verification happens on the website, without private endpoints or bypassing restrictions.
- Persist the chosen tab/role/task for options reloads; bound waiting, handle closure, changed queries and old tasks. Show login/loading/result states and an explicit stop control.
- Label card titles, search snippets, page descriptions, and note bodies as distinct evidence. AI receives actual sources and must not treat card titles as full posts. Keep source role fixed to prevent mismatched advice.
- Test public parsing, DOM extraction, browser task lifecycle and an actual production extension with controlled search/login fixtures. Verify live connectivity separately; do not claim a logged-in Xiaohongshu end-to-end test without one.

## Verification (2026-11-08)
- 53 unit regressions passed across the resume, Boss import, career storage, AI and public-research suites. The affected research suite passed again after the final navigation-order fix.
- Chrome production build passed. The actual extension with controlled Bing/Xiaohongshu fixtures passed unrelated public-result diagnostics, opening the search tab, login continuation, card extraction with access query preserved, options reload recovery, source reset after role changes and website security-block reporting.
- Real requests to Bing returned non-Xiaohongshu results for tested role queries. A separate clean Chrome session reached Xiaohongshu's website-login/error page with a network-risk warning. No authenticated live Xiaohongshu search success is claimed; the extension reports that actual restriction instead of treating it as zero results.
- Temporary TypeScript 5.9 check reports no errors in changed application files; unrelated repository diagnostics remain.
- Reader only uses rendered page content and never calls a private Xiaohongshu API. Search cards are explicitly labelled as title-only evidence.

## Reproduce
- `bun run test:research`
- `bun run build:chrome`
- `bun run test:research:browser`
- `bun run test:resume:browser`
