# Ground resume edits in retrieved sources

Status: resolved

## Request and evidence

The user expects AI resume editing based on retrieved job-related posts. The prominent button instead calls resume-only analysis. Search cards may contain titles only. The latest screenshot also shows a timeout after partial text; the existing absolute timer interrupts healthy long streams and wrongly attributes every timeout to the relay.

## Design

- Make source-grounded advice the prominent action; retain resume-only analysis in an explicitly optional collapsed section.
- Require a selected resume, target role, and actual source content before dispatch. Read a selected post's rendered body via the existing tab reader, preserving other collected sources and access tokens. Title-only cards cannot support an AI editing request.
- Prompt for source evidence, exact resume passages, concrete revision examples, and missing facts, with links and evidence limitations. Never invent resume facts or execute source instructions.
- Use a resettable inactivity deadline for text/reasoning/response-body progress and a separate bounded overall deadline. Preserve partial text and report the observed timeout without asserting an unverified relay defect.
- Test actual request payloads through the production extension and a local synthetic relay, including title-only blocking, selected-note enrichment and a healthy response longer than the inactivity window. Sync changed source/build files to F after validation.

## Result (2026-11-08)

- The main action dispatches source-grounded resume edits; standalone analysis remains in a collapsed optional section. Missing resume/role/content is rejected before any model call. Title-only evidence is excluded. Advice instructions require source links, resume quotations, concrete rewrites, missing facts and evidence limits. Output is limited to five suggestions and a plain-text field layout. The explicit target-role input overrides older roles stored in the resume.
- Selected-note reading opens a normal browser tab, uses visible rendered text, preserves other evidence and survives options reload. Different-note results are not attached to the requested card. Login/blocks/timeouts remain explicit.
- Healthy long streams reset an inactivity deadline; raw compatible-relay reasoning fields count even when ignored by the Chat SDK. An independent overall deadline still bounds active streams. Timeouts preserve partial results without claiming an unverified relay defect.
- 67 tests / 186 assertions passed. Chrome build emitted successfully. Both browser suites passed using synthetic pages/credentials and a local relay: actual request body includes source text/link, role and resume; title-only input sends no AI request; body enrichment, reload, cancellation, idle timeout, long active response and non-stream JSON all verified.
- Temporary TS5.9 checking has no diagnostics for changed application files; unrelated existing repository diagnostics remain. Real account/provider not tested. Build CLI retains an open process after printing successful completion, as earlier builds did; production output was exercised directly in both browser suites.
