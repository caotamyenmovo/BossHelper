# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Each issue has a `Status:` line near the top: `open`, `claimed`, or `resolved`
- Comments and conversation history append under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a file under `.scratch/<feature-slug>/`, creating directories as needed.

## When a skill says "fetch the relevant ticket"

Read the referenced path. The user will normally pass the path or issue number directly.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`
- Child tickets: `.scratch/<effort>/issues/NN-<slug>.md`
- Each child records `Type:` (`research`, `prototype`, `grilling`, or `task`) and `Status:` (`claimed` or `resolved`)
- `Blocked by:` lists prerequisite ticket numbers; a ticket is unblocked when all listed files are resolved
- Claim by setting `Status: claimed`; resolve by adding an `## Answer`, setting `Status: resolved`, and recording the result in the map
