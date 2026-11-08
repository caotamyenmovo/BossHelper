# 05: Text Mock Interviews and Review

**What to build:** The user can choose a target role, optionally add a company and job description, complete a one-question-at-a-time text mock interview, and save/revisit/delete its written review.

**Blocked by:** 01 Workbench Entry and Local Resume Profiles; 02 Import Resume Files

**Status:** resolved

- [x] The user explicitly starts a session using the configured AI provider.
- [x] Questions and reviews use the model selected in the existing AI configuration; no parallel provider setup is added.
- [x] The interviewer asks one question at a time and waits for the user's answer.
- [x] The user can end a session and receive feedback for each answer.
- [x] The completed review includes strengths, improvement areas, example answers, and an action list.
- [x] Transcript and review are saved locally and can be reopened or deleted.
- [x] AI/provider errors preserve the draft session and offer retry.

## Comments
Interviews are text-only in this release. The initial question session is persisted before the AI request so the user can retry after a provider failure.
