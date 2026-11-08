# Finish career AI requests reliably
Status: resolved

## Report and confirmed code defects
The relay shows generated output but resume advice continues spinning. Workbench generateText currently uses the shared background transport, which buffers the whole response with arrayBuffer before replying over RPC. Its abort handler only sends a cancellation RPC and never independently settles the caller. The workbench has no partial output or stop action, and research fetching and AI generation share a busy flag.

## Design
- Use direct extension-page fetch for career calls through an explicit transport argument to the existing model factory. Preserve other model consumers and protocol/header/body settings.
- Stream prose to the two resume advice outputs; retain explicit non-stream mode for relays configured with stream:false. Recognize protocol completion markers (or complete JSON) without waiting for an unclosed HTTP body.
- Independently enforce a bounded deadline, disable automatic paid retries, support caller cancellation, preserve partial text on errors, and reject empty output clearly.
- Separate research-fetch and research-AI busy states. Add stop buttons/statuses and cancel upon component disposal.
- Verify with unit transport tests and an actual extension against a local synthetic relay that deliberately keeps completed responses open. No real API credentials or paid requests are required.

## Result (2026-11-08)
- Career completions now use direct extension-page fetch through an optional model-factory transport; other model callers retain their existing transport. Both resume advice actions stream text and show separate statuses/stop controls. Explicit stream:false remains supported.
- The transport closes at Chat Completions finish_reason/[DONE], Responses completion/incomplete/failure, Anthropic message_stop, or a complete JSON response, instead of requiring the relay to end HTTP. Timeout and user abort independently settle the caller and preserve partial text. Automatic retries are disabled.
- 62 tests across six suites passed. Production Chrome build passed. Actual extension tests against a local synthetic relay passed both advice actions, partial rendering before finish, completed SSE/JSON with deliberately unclosed HTTP, cancellation, retry after cancellation, hard timeout and no duplicate network calls. Existing public-search browser regression also passed.
- Temporary TypeScript 5.9 checking reports no errors in changed application files. Existing unrelated repository diagnostics remain. No real credentials or paid model requests were used; the user's specific relay was not directly tested.

## Reproduce
- `bun run test:career-ai`
- `bun run build:chrome`
- `bun run test:career-ai:browser`
