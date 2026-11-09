# ADR 0001: Keep Career Data Local and Make AI Use Explicit

**Status:** Accepted

## Context

The workbench handles resumes and interview answers, which can contain sensitive personal information. The extension already stores user configuration locally and supports user-configured AI providers. The user wants the resume and interview history saved locally, with AI processing initiated by an explicit action.

## Decision

The extension's local storage is the source of truth for resume profiles and interview records. Resume analysis and interview simulation/review send the relevant content only after the user starts that operation, using the model selected in the project's existing AI configuration. The workbench does not add a second AI settings flow or a service that uploads or stores career data.

## Consequences

- Users can review, edit, and delete stored profiles and interview records in the workbench.
- AI features require a configured provider and must explain that the selected provider receives the submitted content.
- Importing a file or reading a Boss profile must not by itself trigger an AI request.
- Cross-device synchronization is out of scope unless separately designed and approved.

## Workbench recovery (2026-11-09)

An interview retains its starting resume snapshot, current question and answer draft locally. Advice records retain their input snapshot, role, model label, source evidence, output and completion status. Editing or deleting the original profile does not rewrite these historical inputs. Users delete these records separately. Existing records without snapshots can use an available original profile when reopened; if it is missing, explain the limitation rather than inventing a resume.

Career writes are coordinated by the extension background with revision checks. A stale page must report a conflict and preserve its input rather than overwrite newer records. AI still uses the existing configured model and only runs after an explicit user action.
