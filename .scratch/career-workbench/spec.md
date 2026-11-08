# 求职工作台 Spec

## Problem Statement

求职者需要在多个地方整理简历、寻找岗位经验和准备面试。BossHelper 当前主要面向招聘页面上的投递辅助，缺少围绕个人求职方向的简历分析、经验参考和面试练习流程。

## Solution

新增独立的求职工作台，复用扩展已有的 AI 模型配置和本地存储，为用户提供简历导入与分析、公开求职经验检索、文字模拟面试和面试复盘。工作台明确展示资料来源与 AI 使用时机，并让用户控制保存和删除。

## User Stories

1. As a job seeker, I want to open a separate career workbench, so that job-preparation tasks are distinct from automated application settings.
2. As a job seeker, I want to import a PDF, Word document, or TXT resume, so that I can reuse the materials I already have.
3. As a job seeker, I want the workbench to open Boss and attempt to read my personal resume, so that I do not have to re-enter information already present there.
4. As a job seeker, I want to see a clear error and retry or import a file when Boss is logged out or its resume page cannot be read, so that import failure does not block me.
5. As a job seeker, I want imported data normalized into basic details, job preferences, work, education, project experience, and self-introduction, so that later tools can use consistent information.
6. As a job seeker, I want to review and edit extracted data before saving, so that parsing errors do not silently become my profile.
7. As a job seeker, I want to preview a merge when importing multiple sources, so that duplicate or conflicting facts remain under my control.
8. As a job seeker, I want saved resume profiles stored locally and removable at any time, so that I control retention of personal data.
9. As a job seeker, I want to start resume analysis explicitly using my configured AI provider, so that import alone never sends personal data to an AI service.
10. As a job seeker, I want analysis to identify likely target roles, matching evidence, gaps, and concrete resume edits, so that I can improve my application materials.
11. As a job seeker, I want recommendations to avoid inventing experience or metrics, so that revised content remains truthful.
12. As a job seeker, I want to search public job-experience sharing using keywords derived from my target role, so that I can find relevant advice without starting from a blank query.
13. As a job seeker, I want source cards to show the note title, blogger when available, and original link, so that I can inspect the source behind each recommendation.
14. As a job seeker, I want actionable suggestions to be connected to retrieved sources where possible, so that I can distinguish sourced observations from AI-generated advice.
15. As a job seeker, I want a fallback to paste a link or import text when a public page cannot be retrieved, so that restricted access does not end the research flow.
16. As a job seeker, I want the workbench to explain when automatic search or retrieval is unavailable, so that incomplete coverage is not presented as exhaustive research.
17. As a job seeker, I want to select a target role from my resume and optionally add a company and job description, so that interview practice matches a real opportunity.
18. As a job seeker, I want to start a text-based mock interview explicitly with my configured AI provider, so that I control when interview content is sent externally.
19. As a job seeker, I want the interviewer to ask one question at a time and wait for my written answer, so that the session feels like an interview rather than a static questionnaire.
20. As a job seeker, I want to end or complete the session and receive feedback for each answer, so that I can understand specific strengths and weaknesses.
21. As a job seeker, I want the final review to include strengths, improvement areas, example answers, and an action list, so that I know what to practice next.
22. As a job seeker, I want interview transcripts and reviews saved locally and deletable, so that I can revisit practice without giving up control of my records.
23. As a job seeker, I want clear empty, loading, failure, and retry states, so that unavailable AI or source services do not leave the workbench blank.

## Implementation Decisions

- Add the workbench as an independent extension page and expose it through a clear extension entry point.
- Keep a normalized resume profile as the shared input for role extraction, resume advice, and interview setup.
- Support user-selected PDF, DOCX/DOC, and TXT files. Show extracted text and parsed fields for review before saving. If a format cannot be parsed, explain the limitation and allow a supported format or manual text input.
- Boss import is user-triggered from the workbench: open the Boss personal-resume page, use the authenticated page's available visible data, and report a recoverable error if the page is logged out, unsupported, or changed. Do not make profile import depend on an undocumented endpoint.
- Merge imports into a reviewable draft. Preserve source information for extracted sections and require user confirmation before replacing saved profile data.
- Store profiles, source references, interview sessions, and reviews in extension-local storage. Provide explicit deletion controls.
- All AI operations reuse the project's existing AI provider/model configuration and the user's currently configured model selection; do not add a second API key, provider, model, or AI settings page. Import and browsing do not call AI; analysis and interview operations call the configured AI only after the corresponding user action.
- Derive search keywords from the selected target role. Retrieve public Xiaohongshu-related material where available, retain title/author/link metadata, and disclose unavailable or partial results. Offer pasted-link/text fallback; do not bypass authentication or access controls.
- Ask mock-interview questions one at a time. Persist transcript state locally; on completion, produce per-answer feedback and a summary with strengths, improvement areas, example answers, and next actions.
- Keep the orchestration behind one workbench workflow interface over storage, import sources, public research retrieval, and the existing AI layer. Test observable flows through that interface with replaceable adapters.

## Testing Decisions

- Tests should verify user-observable outcomes: parsing and merge previews preserve source content, data is not persisted before confirmation, AI is not called during import, and deleting a record removes it from later reads.
- Test the workbench workflow with fake storage, file/Boss import, public research, and model adapters. Cover success, partial-source failure, provider errors, retry, and deletion.
- Test file extraction for the supported formats with representative fixtures, including malformed/empty files.
- Test interview progression so a new question is not requested until the previous answer is submitted, and verify transcript/review persistence.
- The repository uses Bun tests under `scripts/`; add focused Bun tests for the new workflow. UI checks should cover the complete import, analysis, search fallback, mock interview, and review flows.
- Existing `bun run check` is currently affected by the repository's TypeScript/vue-tsc package incompatibility; record that baseline separately from feature regressions.

## Out of Scope

- Automatically applying to jobs, sending messages, or changing the user's Boss profile.
- Voice recording, speech recognition, or audio interview simulation in the first release.
- Cloud storage, cross-device synchronization, or a new backend for personal career data.
- Login automation, private or undocumented Xiaohongshu APIs, or bypassing platform access restrictions.
- Guaranteeing exhaustive Xiaohongshu search results when content is not publicly indexed or accessible.
- Automatically rewriting and overwriting the user's source resume without review.

## Further Notes

- The repository contains a Boss resume data type, but no current personal-resume import flow. The Boss import path and readable fields need a browser-level verification against the logged-in personal-resume page.
- Xiaohongshu automatic retrieval is best-effort because the current public Open Platform documentation does not expose a note/blogger search API.
