# Project Change Log (`log.md`)

All structural, architectural, configuration, and code changes made in this workspace are recorded below in chronological order.

---

## [2026-11-13 20:25] Independent Standalone CI/CD Pipelines, Dependabot & Decoupled Repository Verification

Architected and implemented enterprise-grade, independent GitHub Actions CI/CD pipelines and Dependabot security configurations for the decoupled `backend/` and `frontend/` repositories with zero root-level `.github/` dependencies and strict decoupling.

### Deliverables Created & Configured
- **Backend Automation (`backend/.github/`):**
  - `backend/.github/dependabot.yml`: Automated weekly dependency vulnerability scans for `npm`, `docker`, and `github-actions` with `chore(deps)` commit prefix.
  - `backend/.github/workflows/ci.yml`: 7 discrete jobs on Node 20 with least-privilege permissions, concurrency controls (`cancel-in-progress: true`), and timeouts:
    1. `unit-integration`: Executes `npm test`, `npm run test:board-paper`, `npm run test:progress`, and `node scripts/test_latex_rendering_and_options.js`.
    2. `live-server`: Boots `src/server.js` on port 5050 with in-memory fallback, polls `/api/health` with a 30s timeout, runs `npm run test:math-bank` and `node scripts/verify_staging.js http://localhost:5050`, and uploads `server.log` artifact on failure.
    3. `postgres-integration`: Spins up a `postgres:16-alpine` service container, installs `postgresql-client`, applies `database/schema.sql` and `database/seed_data.sql`, starts the server with `DATABASE_URL`, and validates live `/api/health`.
    4. `network-integration`: Runs `node scripts/test_voice_tutor_hinglish.js` non-blockingly (`continue-on-error: true`). Excludes real messaging script `test_real_whatsapp_dispatch.js`.
    5. `security-scan`: Runs `npm audit --audit-level=high` and Gitleaks secret detection (`gitleaks/gitleaks-action@v2`).
    6. `codeql-analysis`: Static application security testing (SAST) for JavaScript/Node.js (`github/codeql-action@v3`).
    7. `docker-build-smoke`: Multi-stage Buildx image compilation with GitHub Actions layer cache (`type=gha`), runs container, tests `/api/health`, and scans for HIGH/CRITICAL vulnerabilities with Trivy (`aquasecurity/trivy-action@0.28.0`).
  - `backend/.github/workflows/cd.yml`: Release deployment pipeline on version tags `v*.*.*` and manual `workflow_dispatch` (target environment input: `staging` or `production`):
    - Builds and pushes multi-platform image to GitHub Container Registry (`ghcr.io/${{ github.repository }}`).
    - `deploy-staging`: Automatic staging deployment with clearly defined inputs (`IMAGE_REF`, `DATABASE_URL`, `CORS_ORIGIN`, `FRONTEND_URL`, `PORT`, `JWT_SECRET`) and post-deploy gate `node scripts/verify_staging.js <DEPLOYED_URL>`.
    - `deploy-production`: Manual approval gate via GitHub Environment `production`, post-deploy verification gate, and detailed rollback runbooks.
- **Frontend Automation (`frontend/.github/`):**
  - `frontend/.github/dependabot.yml`: Automated weekly dependency scans for `npm` and `github-actions`.
  - `frontend/.github/workflows/ci.yml`: 6 discrete jobs on Node 20:
    1. `build-and-test`: Executes `npm test` (buttons & solution card), `npm run test:latex` (KaTeX), `node scripts/test_screenshot_case.js` (headless LaTeX validation), `npm run build:whiteboard` + `git diff --exit-code vendor/tldraw/tldraw-standalone.bundle.js` (bundle diff check), and `node scripts/test_static_guards.js` (guards against bare `/api/` fetch calls, hardcoded `../../` sibling paths, and newly added PR emojis).
    2. `server-smoke-test`: Starts `server.js` on port 3008, validates `/` and `/whiteboard` return HTTP 200, and uploads logs on failure.
    3. `playwright-overflow-check`: Non-blocking job (`continue-on-error: true`) running `node scripts/test_overflow_viewports.js` against 360px, 768px, 1024px, and 1440px viewports.
    4. `live-backend-integration`: Dispatched via `workflow_dispatch` with a `backend_url` input pointing at a deployed staging backend (executes `node scripts/test_quiz_creation_and_modal_display.js` without checking out backend repo).
    5. `security-scan`: Runs `npm audit --audit-level=high` and Gitleaks secret detection.
    6. `codeql-analysis`: Static code analysis for JavaScript and HTML.
  - `frontend/.github/workflows/cd.yml`: Release packaging and deployment pipeline on tags `v*.*.*` and manual dispatch:
    - Packages static release archive `haps-frontend-<tag>.tar.gz` and conditionally pushes container if Dockerfile is added.
    - `deploy-staging`: Deploys to staging web host, injects `window.HAPS_API_BASE` dynamically at deploy time, and runs HTTP 200 smoke test.
    - `deploy-production`: Regulated deployment with manual approval gate via GitHub Environment `production`.
- **Scripts & Repository Hardening:**
  - `frontend/scripts/test_overflow_viewports.js`: Responsive layout test validating `scrollWidth <= innerWidth` across standard viewports.
  - `frontend/scripts/test_static_guards.js`: AST/regex guard verifying 0 bare `/api/` fetches, 0 `../../` sibling paths across 20 source files, and diff-based emoji detection for incoming commits.
  - `backend/scripts/test_class_progress_dashboard.js`: Updated lines 82–94 assertions to match pre-seeded 8 submissions and 4 question analytics.
  - `backend/scripts/verify_staging.js`: Updated Test 8 to accept decoupled JSON backend service descriptors (`mode: standalone-backend`) alongside HTML shells, and suppressed `vercel curl` fallback for localhost URLs.
  - `backend/Dockerfile`: Aligned default exposed port to `5050`.
  - `frontend/vendor/tldraw/tldraw-standalone.bundle.js`: Recompiled and synchronized with `src_whiteboard/index.jsx`.
- **Documentation Updated:**
  - `backend/README.md`, `backend/INTERN_ONBOARDING_GUIDE.md`, `backend/TASKS.md` (added TASK-21).
  - `frontend/README.md`, `frontend/INTERN_ONBOARDING_GUIDE.md`, `frontend/TASKS.md` (added TASK-21).

### Local Command Verification Results
All CI commands were executed locally in the exact pipeline sequence and passed cleanly:
- `backend/`:
  - `npm test`: 8/8 tests passed (in-memory NCERT/PYQ fallback verified).
  - `npm run test:board-paper`: 6/6 tests passed (CBSE/HPBOSE papers and question mutations verified).
  - `npm run test:progress`: 45/45 tests passed across Class 10 Math, Class 10 Science, Biology, and Physics.
  - `node scripts/test_latex_rendering_and_options.js`: 2,528 options and 4 assessments verified.
  - `npm run test:math-bank`: 438 questions and all chapter filters verified.
  - `node scripts/verify_staging.js http://localhost:5050`: 14/14 checks passed (`GATE APPROVED`).
- `frontend/`:
  - `npm test`: 202/202 static buttons bound + Solution Card engine verified.
  - `npm run test:latex`: 4 display + 3 inline KaTeX math blocks verified.
  - `node scripts/test_screenshot_case.js`: 5/5 display equations rendered in headless Node environment.
  - `npm run build:whiteboard` + `git diff --exit-code`: 0 diff; compiled bundle matches committed source.
  - `node scripts/test_static_guards.js`: 0 bare APIs, 0 sibling paths, 0 added emojis across 20 source files.
  - `server.js` route smoke test: `GET /` (200), `GET /whiteboard` (200) verified.

---

## [2026-11-12 17:07] Student AI Whiteboard Controls, Class-Scoped Topic Search & Ask-Any-Doubt Studio

Rebuilt the Student AI Smartboard tab (`#tabStudentSmartboard`) from a placeholder iframe view into a complete interactive learning and live doubt-resolution workspace, verified across Desktop (`1440x900`) and Mobile (`360x800`) Chrome viewports.

### Changes Implemented
- **Student AI Smartboard UI & Responsive Layout (`frontend/index.html`, `frontend/css/styles.css`):**
  - Replaced the bare iframe box inside `#tabStudentSmartboard` with a complete control bar and split studio layout:
    - **Class, Subject & Topic Finder (`#studentWbTopicControls`):** Class selector (`#selectStudentWbClass`: Class `10`, `11`, `12`), dynamic class-scoped Subject selector (`#selectStudentWbSubject`), live keyword Topic Search (`#inputStudentWbTopicSearch`, `#btnStudentWbClearSearch`), Chapter-prefixed Topic dropdown (`#selectStudentWbTopic`, e.g., `Ch 1 - ...`), clickable filtered topic chips (`#studentWbTopicChips`), and `"Teach Topic"` action (`#btnStudentWbTeachTopic`).
    - **Whiteboard Playback & Canvas Controls (`#studentWbCanvasToolbar`):** Wired `Prev Step`, `Pause / Play`, `Next Step`, `Full Board`, `Zoom Fit`, `Clear Board`, `Listen AI`, `Live Class`, `Refresh Board`, and Voice Persona selector (`#selectStudentWbVoice`: Swara, Madhur, Neerja, Prabhat) directly to `#studentWbIframe` (`/whiteboard.html?role=student`).
    - **Synchronized Step Cards & Ask-Any-Doubt Studio (`#studentWbSyncedCards`, `#studentWbDoubtSection`):** Added readable KaTeX Step 1–3 derivation cards + Exam Tip below the board and a dedicated **Ask Any Doubt** chat studio with quick doubt chips (`.student-wb-quick-doubt-btn`), voice-to-text microphone input (`#btnStudentWbMic`), Hinglish/English AI responses (`#btnStudentWbAskDoubt`), per-reply `"Listen"` replay, and `Clear Chat` (`#btnStudentWbClearDoubts`).
  - Added responsive CSS rules including `<= 768px` single-column stacking, `0` horizontal overflow at `360x800`, and `>= 36px` mobile touch targets on `.student-wb-topic-chip` and `.student-wb-replay-reply`.
- **Smartboard Controller & Race-Safety (`frontend/js/app.js`, `frontend/whiteboard.html`):**
  - Added `studentSmartboardState` and `initStudentSmartboardWorkspace()` (auto-initialized from `switchStudentTab('tabStudentSmartboard')` plus top-level `WHITEBOARD_READY` handshake) with `topicsRequestId`, `teachRequestId`, and `doubtGenerationId` request/generation guards preventing stale async responses on rapid Class switching or `Clear Chat`.
  - Extended `frontend/whiteboard.html` `message` listener to handle `NEXT_CONCEPT`, `PREV_CONCEPT`, `TOGGLE_PACING`, `SHOW_ALL_CONCEPTS`, `CLEAR_BOARD`, and responsive `resize` redraws.
- **Voice Tutor JSON Model Chain & Context-Aware Doubts (`backend/src/routes/voiceTutor.js`, `backend/src/services/aiVoiceTutorService.js`):**
  - Updated `/api/voice-tutor/interrupt` and `answerStudentInterruption()` to accept Class/Subject/Chapter/Topic context and extracted shared `callVoiceTutorJsonModel()` prioritizing active Groq model `openai/gpt-oss-20b` (`~1.2s` JSON latency) with `openai/gpt-oss-120b` and `gemini-2.5-flash` fallbacks, plus optics/sign-convention fallback logic.

### Verification Results (Post-Final Edit)
- **Live Chrome `1440x900` & `360x800` QA (`http://localhost:3008` + `http://localhost:5050`):**
  - Class/Subject scoping verified (`42` Physics, `32` Chemistry, `35` Maths, `38` Biology in Class 12; `21` Physics in Class 11; `40` Science & `43` Maths in Class 10), keyword search (`"mirror"`, `"gauss"`), tldraw smartboard rendering (`11–13` shapes), all playback/clear/fit buttons, AI Hinglish doubt answers + KaTeX (`0` `.katex-error`), rapid Class-switch race guard, `Clear Chat` in-flight cancellation, mobile `360x800` (`scrollWidth === 360`, `.student-wb-topic-chip` `36px`, `.student-wb-replay-reply` `42.4px`), and `0` console errors.
- **Automated Suites:**
  - `frontend/`: `npm test` (`202/202` static buttons bound + Solution Card engine), `npm run test:latex`, `node scripts/test_screenshot_case.js`, and `node scripts/test_quiz_creation_and_modal_display.js` (`32/32`) all exited `0`.
  - `backend/`: `test_evaluator.js` (`8/8`), `test_board_paper_generator.js` (`6/6`), and `test_latex_rendering_and_options.js` (`2,528` options + 4 assessments) passed; live HTTP `/api/voice-tutor/interrupt` responded in `1235ms` (`GROQ_OPENAI/GPT-OSS-20B`).

---

## [2026-11-12 16:20] Full E2E Functional Audit, 14 Bug Fixes & Desktop/Mobile Chrome Verification

Conducted a full Desktop (`1440x900`) and Mobile (`360x800`) interactive QA pass across `http://localhost:3008` and `http://localhost:5050`, resolved all 14 functional, data, Board Paper, Voice Tutor, Remedial Routing, WhatsApp encoding, KaTeX DOM corruption, and portal synchronization defects, restarted the backend daemon (`node backend/src/server.js`), and re-verified every fix in live Chrome and automated suites.

### Fixes Implemented
- **Form Validation, Assigned Test Filter & Finalize Score Banner (`frontend/index.html`, `frontend/js/app.js`):**
  - Escaped hyphen in HTML5 `pattern="[0-9\s+\-]{10,15}"` on `#inputGatewayTeacherPhone` (`frontend/index.html`) for strict `/v` RegExp compatibility.
  - Normalized `'SCHEDULED' || 'UPCOMING'` status matching in `renderAssignedTestsTable()` (`frontend/js/app.js`) so the `Scheduled` filter pill count matches filtered rows.
  - Added `#liveTestStatusBadge` and `#liveTestSubmissionsPercent` (`frontend/index.html`) and updated `finalizeCurrentTest()` to set `#liveTestSubmissionsCounter` to `'48 / 48'`, `'Students Submitted (100%)'`, and `'FINALIZED & GRADED'`.
- **Voice Tutor Ephemeral Endpoint & Headless Fallback (`backend/src/routes/voiceTutor.js`, `frontend/js/geminiLiveVoiceTutor.js`, `frontend/js/app.js`):**
  - Updated `GoogleGenAI` client and WebSocket URL in `/api/voice-tutor/gemini-live-token` to `apiVersion: 'v1alpha'` (`v1alpha.GenerativeService.BidiGenerateContentConstrained`) as required for ephemeral auth tokens.
  - Updated `socket.onerror` and `socket.onclose` in `GeminiLiveVoiceTutorEngine` to reject pending setup promises cleanly (`console.warn` instead of `console.error`), and added automatic fallback to the Studio Neural Voice Tutor (`speakWithVoiceEngine()` + smartboard pacing) in `startRealtimeVoiceAssistant()` when live socket/mic access fails.
- **Board Paper Studio Blueprints, Section A 1-Mark Validation & Mode 2 Sync (`backend/src/services/boardPaperGeneratorService.js`, `frontend/js/app.js`):**
  - Added `CBSE_CLASS_12_MATHS` (80M, 38 Qs) and `HP_BOARD_CLASS_12_MATHS` (80M, 34 Qs) blueprints plus senior Mathematics question pools; enforced strict grade isolation in `getSubjectQuestionsPool()`.
  - Added `inferQuestionMarks()` and `isMatchingBoardMarks()` across paper generation and swap candidate lookups so Section A 1-Mark MCQ slots only accept 1-mark MCQs with 4 options (excluding 2M/3M/5M derivations even when options exist) and deduplicated custom questions in `addCustomQuestionToPaper()`.
  - Fixed `openAddCustomQuestionModal()` (preserving `preselectedSectionId` after `form.reset()`, syncing `#selectCustomQMarks` and `#groupCustomQOptions` on initial open and section change) and `submitAddCustomQuestion()` (preserving entered options A-D).
  - Updated `switchPaperCreationMode('board_paper')` and `applyTeacherProfile()` (checking `state.activePaperCreationMode === 'board_paper'` and DOM panel visibility) to sync subject/grade/board immediately and regenerate stale papers when switching faculties even while staying on Mode 2; updated Class 10 Maths header formatting checks (`profSubj.includes('MATH')`) and Mode 2 banner copy.
- **Class Test Report Tier Counts & Clean UTF-8 WhatsApp Payloads (`frontend/js/app.js`, `backend/src/routes/notifications.js`):**
  - Computed `All`, `Excellent`, `Average`, and `Below Avg` tier filter counts dynamically from `test.studentResults` inside `viewTestReportDetail()` so counts sum cleanly to the rendered rows.
  - Added `sanitizeWhatsAppPayload()` (stripping `\uFFFD`, broken surrogate/emoji characters, and box-drawing glyphs) across `formatWhatsAppDossierText()`, `shareStudentReportWhatsApp()`, `formatWhatsAppText()`, `dispatchWhatsAppMessage()`, `sendRosterStudentWhatsApp()`, `#btnSendDirectWhatsApp`, and `backend/src/routes/notifications.js`.
- **Safe TreeWalker KaTeX Renderer, Student Exam Sync, Remedial Routing & Studio Modal (`frontend/js/app.js`, `frontend/index.html`, `backend/src/services/remedialAssignmentService.js`):**
  - Replaced destructive `element.innerHTML = renderLatexString(element.innerHTML)` in `renderMathInElement()` with a DOM `TreeWalker` over text nodes (`NodeFilter.SHOW_TEXT`), skipping `SCRIPT`/`STYLE`/`TEXTAREA`/`CODE`/`PRE`/`OPTION`/`.katex`, preserving HTML attributes and live JS click listeners.
  - Moved LaTeX formulas out of inline `onclick="..."` strings in `#tabStudentPreviousTests` and `#tabStudentRemedial` into `data-*` attributes and formatted `#tabStudentRemedial` equations ($\omega_0$, $\omega_d = \sqrt{\omega_0^2 - \gamma^2}$, $a = \frac{g \sin\theta}{1 + I/(MR^2)}$) in KaTeX.
  - Fixed `setupStudentMode()` Socratic hints so active exam questions never fall back to `state.currentQuestion` (Rotational Motion) hints.
  - Expanded `FORMULA_REPOSITORY` and keyword routing in `remedialAssignmentService.js` (isolating `Science` from `Mathematics` and routing optics/mirrors/circuits/capacitors/damped-oscillation items accurately); updated `startAssignedTest()` (`chapter_name`, `solution_latex`, `marks`, `_assignedTestLoaded`), `displayDiagnosticResults()`, and `formatIntuitiveSteps()` to match combined topic/question text cleanly without Physics-to-Biology fallback leaks.
  - Fixed `launchRemedialDrillSheet()` to update `#remHostelDirective` and `#remParentDirective`; wired `#btnStudioBackBtn` and `#btnStudioAssignQuiz` in `openPreviousTestReview()` (`Close Review`, hiding teacher assign button) vs. `openStepSolutionStudio()` (`Back to Question Bank`); auto-hydrated first published test on `loadStudentAssignedTests()` / `switchPortalRole('student')`; appended submitted rows to `#studentPrevTestsTableBody` using `rData.totalScore` and updated completed badges (`#studentCompletedBadgeNav`, `#drawerStudentCompletedBadge`, `#drawerStudentCompletedSub`, `#studentSmartReportTestsCountLabel`, `#studentSmartReportAttemptedSub`, `#studentSmartReportAttemptedBtnLabel`); updated Question Bank drawer badge/subtitle dynamically (`#drawerQbSubtitle`, `#drawerQbCountBadge`).

### Verification Results (Post-Final Edit)
- **Live Chrome `1440x900` & `360x800` QA (`http://localhost:3008` + `http://localhost:5050`):**
  - Verified all 14 bug fixes cleanly across Desktop (`1440x900`) and Mobile (`360x800`) with `0` console errors, `0` uncaught exceptions, `0` `window.alert()` dialogs, `0` `.katex-error`, `0` failed HTTP requests (`>= 400`), and `0` horizontal overflow / rect / scroll offenders (`document.documentElement.scrollWidth === 360` across Mode 2 Board Paper Studio, `#tabStudentPreviousTests`, `#modalStepSolutionStudio`, `#tabStudentRemedial`, `#modalPersonalizedRemedial`, Question Bank Voice Tutor, Custom Q Modal, Class Progress, Exam Simulator, Diagnostic Results, and Weekly Report).
- **Automated Suites (Executed After Final Edits):**
  - `frontend/` (`npm test`, `npm run test:latex`, `node scripts/test_screenshot_case.js`, `node scripts/test_quiz_creation_and_modal_display.js`): all exited `0` (`32/32` live `:5050` API & modal checks passed; `186/186` static buttons + 6 dynamic selectors verified).
  - `backend/`: `test_evaluator.js` (`8/8`), `test_board_paper_generator.js` (`6/6`), `test_personalized_remedial_flow.js`, `test_latex_rendering_and_options.js` (`2,528` options + 4 assessments), `test_subject_remedial_pipeline.js` (`31/31`), and `test_voice_tutor_hinglish.js` verified passing.

---

## [2026-11-12 13:10] Full Mobile Resolution (`360x800`) Frontend Remediation & Live Chrome Verification

Conducted an exhaustive `360x800` live Chrome viewport audit (plus `1440x900` desktop parity check) across `http://localhost:3008` and `http://localhost:3008/whiteboard`, fixed every overflowing grid, modal, card, KaTeX block, voice-tutor form, and HUD overlap, and verified `0` horizontal overflows (`scrollWidth === 360`), `0` element/rect offenders, `0` console errors, and `0` failed network requests.

### Fixes Implemented
- **Global Shell, Top Navbar & Role Gateway (`frontend/index.html`, `frontend/css/styles.css`):**
  - Replaced fixed `height: 54px !important` in `<head>` `<style>` with `min-height: 54px !important; height: auto !important;` so wrapped mobile headers do not collide or overflow, tightened `.top-navbar`/`.header-right`/`#headerRoleBadge`/`.header-faculty-chip` padding and wrapping under `@media (max-width: 768px)`, and bumped `css/styles.css?v=9.0`.
  - Updated `#portalRoleGatewayModal` (`div.brand-logo-badge` `width: auto` for `UNISOLE`, responsive `minmax(min(280px, 100%), 1fr)` / `minmax(min(290px, 100%), 1fr)` grids, single-column stacking under `768px`, and wrapped header/form grids).
- **Teacher Portal Forms, Draft Studio, Board Paper, Analytics & Modals (`frontend/css/styles.css`, `frontend/index.html`, `frontend/js/app.js`):**
  - Fixed `.two-col-form-grid` column collapse (overrode inline `grid-column: span 2` on the marks-weightage row via `.two-col-form-grid > * { grid-column: 1 / -1 !important; }` so column 1 no longer crushes to `17.6px` on mobile) and wrapped `renderUnitTestDraftStudio()` options grids/headers (`1fr`, `min-width: 0`, `overflow-wrap: anywhere`).
  - Contained `.board-paper-studio-body` and `.board-paper-sheet` horizontally (`max-width: 100%; overflow-x: auto;`) for CBSE & HPBOSE A4 previews.
  - Fixed `#modalEditPaperQuestion` (`+6px` overflow from `#selectEditCorrectOpt` `margin-left: 6px` on a `100%`-wide `.form-select`, plus `.responsive-2col-grid` `minmax(0, 1fr)` stacking), `#modalSelectAlternativeQuestion` (`flex-wrap: wrap` + `min-width: 0`), and `#modalInjectQuestion` (`minmax(min(200px, 100%), 1fr)`, wrapped mode tabs & auto-categorization banner).
  - Fixed `#tabClassAnalytics` header pill wrapping and chart grid/card `min-width: 0; overflow: hidden;` containment.
- **Question Bank, KaTeX Equations & Voice Tutor (`frontend/css/styles.css`, `frontend/js/app.js`):**
  - Prevented horizontal expansion inside `.qb-solution-mastercard`, `.qb-solution-concept-box`, `.qb-solution-step-item`, `.sol-step-content`, and `.sol-math-line` (`min-width: 0; max-width: 100%;`) while allowing wide `.katex-display` equations to scroll cleanly inside their containers (`overflow-x: auto`).
  - Wrapped `.qb-voice-brand`, `.qb-voice-actions-row`, and `#voiceInterruptionArea_${qId}` (`#inputVoiceDoubt_*`, `#btnMic_*` "Speak", and "Ask Doubt" buttons stay inside `360px` with `>= 40px` touch height).
- **Director & Student Portals (`frontend/css/styles.css`, `frontend/index.html`, `frontend/js/app.js`):**
  - Added responsive breakpoints for `.grid-4col` (`repeat(2, minmax(0, 1fr))` at `<= 1024px`, `minmax(0, 1fr)` at `<= 768px`), resolving off-screen cards in `#directorView` and crushed `.tier-kpi-card` tiles in `#tabStudentSmartReport`.
  - Refactored `#ntaExamContainer` and `.exam-quick-jump-panel` on mobile so `.quick-question-number-strip` renders as a `38px`-tall horizontally scrollable palette row (`281px` clientWidth / `1194px` scrollable) instead of a `642px`-tall 2-column vertical strip, eliminating `.glass-card` overflow (`336 === 336`).
  - Fixed `#modalDiagnosticResults` (`.diag-modal-header` wrapping so `"Print Report"` & `#btnCloseDiagnosticResults` fit visibly inside `360px`, `minmax(0, 1fr)` KPI & dual directive grids, `.diag-formula-scroll` & scrollable stem wrappers so `#diagReportScrollContainer` measures `314 === 314`, wrapped mastery pills, and `minmax(min(280px, 100%), 1fr)` mastery grid) and `#modalPersonalizedRemedial` (wrapped `#remFormulaDrillsContainer` `"Verify Equation"` row & `1fr` `.remedial-options`).
- **Standalone Interactive Whiteboard (`frontend/whiteboard.html`):**
  - Switched mobile (`<= 768px`) layout to a `100dvh` flex column (`#whiteboard-overlay-badge` -> `#whiteboard-quick-actions` -> `#root` -> `#whiteboard-diagnostic-panel`), overrode tldraw's internal inline `position: fixed; inset: 0;` mount wrapper via `#root > div { position: relative !important; inset: auto !important; }`, raised mobile button targets to `min-height: 36px`, and replaced the clipboard `alert()` in `copyDiagnosticLogs()` with non-blocking `"Copied!"` feedback.

### Verification Results (Post-Final Edit)
- **Live Chrome `360x800` & `1440x900` Audit (`http://localhost:3008` + `/whiteboard`):**
  - Measured `document.documentElement.scrollWidth === 360`, `0` rect/scroll offenders, `0` console errors, `0` uncaught exceptions, `0` `window.alert()`, and `0` failed network requests across every audited mobile view including `#portalRoleGatewayModal`, `.top-navbar`, `#tabTeacherBoardPaper`, `#modalSelectAlternativeQuestion`, `#modalEditPaperQuestion`, `#tabTeacherCreateTestAndPaper`, `#containerUnitTestDraftStudio`, `#tabClassAnalytics`, `#tabQuestionBank` (solutions + Voice Tutor + `/whiteboard` iframe + `#modalInjectQuestion`), `#directorView`, `#ntaExamContainer`, `#modalDiagnosticResults`, `#modalPersonalizedRemedial`, `#tabStudentSmartReport`, and standalone `/whiteboard` (`badgeVsPageBtn === false`, `diagVsBottomActions === false`, `diagVsBottomTools === false`), with `1440x900` desktop multi-column parity verified clean.
- **Automated Suites (Post-Final Edit):**
  - `backend/` (`npm test` -> `test_evaluator.js`): `8/8` tests passed (exit `0`).
  - `frontend/` (`npm test`, `npm run test:latex`, `node scripts/test_screenshot_case.js`, `node scripts/test_quiz_creation_and_modal_display.js`): all exited `0` (`186/186` static buttons + 6 dynamic selectors bound; `32/32` quiz creation/modal/live `:5050` API checks passed).

---

## [2026-11-12 12:40] Full Bugfix Resolution & Verified Live Chrome End-to-End QA

Fixed every defect uncovered during live Chrome end-to-end testing across `frontend/` (`:3008`) and `backend/` (`:5050`), eliminated blocking browser `alert()` dialogs, resolved mobile `360x800` overflows, and re-verified all workflows in live Chrome and automated backend/frontend suites.

### Fixes Implemented
- **SVG `<path>` `<br/>` Corruption & HPBOSE Bilingual Math Classification (`frontend/js/app.js`):**
  - Removed duplicate `replace(/\n/g, '<br/>')` pass inside `renderLatexString()` so KaTeX `<svg><path d="...">` attribute newlines are preserved intact.
  - Replaced the broken `isFormulaString()` regex character class (which previously matched plain ASCII letters inside HPBOSE bilingual headings like `खण्ड-क (Section A)`) and added Devanagari/bilingual text guards so HPBOSE section instructions render as crisp upright text.
- **Toast System & Handwritten Workspace (`frontend/js/app.js`, `frontend/css/styles.css`, `frontend/index.html`):**
  - Added global `window.showToast(message, type)` backed by fixed bottom-right styling for `.role-switch-toast` (`position: fixed; bottom: 24px; right: 24px; z-index: 100500`) and replaced blocking `alert()` calls across test builder, exam navigation, WhatsApp dispatch, faculty auth, Question Bank copy/flash-quiz, AI question injection, and handwritten grading flows.
  - Added "Scan Paper Sheets" (`#tabHandwritten`) card to the sidebar drawer, updated Question Bank drawer badge to `518+`, changed raw `($300\text{ DPI}$)` subtitle text to `(300 DPI)`, and targeted `#rubricStepsList` when typesetting KaTeX in `switchTeacherTab()` / `index.html` so `#btnApproveHandwritten` and Vision AI listeners are preserved.
  - Added inline SVG favicon handler in `frontend/server.js` (`/favicon.ico` returning HTTP `200 image/svg+xml`) and `<link rel="icon">` in `frontend/index.html` and `frontend/whiteboard.html`.
- **Modal Stacking, Student & Smart Report Math & Director/Student Role Sync (`frontend/css/styles.css`, `frontend/js/app.js`):**
  - Elevated `#whatsAppModal` to `z-index: 10025 !important` above `#modalStudentIndividualReport` (`10006`).
  - Fixed double-escaped LaTeX strings (`\times`, `\frac`, `\theta`, `\tau`) and rendered `B_{\text{end}}` through `renderLatexString()` in student diagnostic and weekly Smart Reports.
  - Preserved `'director'` role view visibility and `"Dr. Anita Chandel"` header state across drawer tab switches, `applyTeacherProfile()`, and `updateTeacherClassScopeUI()`, and guarded `selectDrawerStream()` so Student/Director header chips are never overwritten by drawer exam-track selection.
- **Board Paper Studio CRUD & Bilingual Headers (`frontend/js/app.js`, `backend/src/services/boardPaperGeneratorService.js`):**
  - Renamed Board Paper `openSwapQuestionModal()` -> `openBoardSwapQuestionModal()` to eliminate collision with Unit Test swap, preventing `undefined Marks` and cross-subject candidates.
  - Fixed `openAddCustomQuestionModal()`, `submitAddCustomQuestion()`, `openEditQuestionModal()`, `submitEditPaperQuestion()`, and `addCustomQuestionToPaper()` so 1-Mark subjective questions remain optionless (`options_latex: []`, `correct_answer: null`) unless options are entered, and custom question `id` is synchronized with backend `inMemoryStore` so `PUT /update-question` and `DELETE /delete-question` return HTTP `200`.
  - Replaced hardcoded Hindi Physics header label with a subject-accurate map in `renderBoardPaperStudio()` so HPBOSE Chemistry renders `(रसायन विज्ञान - सैद्धांतिक)`.
- **CBSE Non-Negative UI & Context-Aware Physics Formula Remedial (`frontend/js/app.js`, `frontend/index.html`):**
  - Added `#examMarkingSchemeBadge` (`+4 / 0 (NO NEG)`) and `#examPaletteStandardSubtitle` (`CBSE Board Standard (No Negative)`) and hid `-1M` tags on CBSE review cards.
  - Passed full question/topic/subject context from `"Practice Formula"` into `openPersonalizedRemedialModal(questionCtx)` so Physics wrong answers open Physics/Optics drills instead of defaulting to Biology.
- **Voice Tutor / Smartboard Dipole Accuracy (`backend/src/services/aiVoiceTutorService.js`, `backend/src/routes/voiceTutor.js`, `frontend/js/app.js`, `frontend/whiteboard.html`):**
  - Preserved letter `match.correct_answer` (`A`–`D`) over `correct_answer_latex` in `solve-and-sync`, excluded electrostatics/optics/circuit terms from `rolling_incline`, added a dedicated Electrostatics/Dipole template before `'circuit'`, increased Groq fetch timeout to `6000ms` (`['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']`), prevented duplicate concurrent `solve-and-sync` requests via `voiceTutorState.inFlightSync`, and fixed `drawFallbackDiagram` fallback type in `whiteboard.html`.
- **Mobile `360x800` Overflow Remediation (`frontend/css/styles.css`, `frontend/index.html`, `frontend/js/app.js`):**
  - Enabled `#studentPortalNav` (`display: flex; flex-wrap: wrap;`), added `.two-col-form-grid` and `.report-two-col-grid`, collapsed multi-column report/form/graph grids to `1fr`, wrapped `.progress-subtabs-strip` and `#modalStudentIndividualReport .modal-card`, and cleared fixed `min-width` constraints under `@media (max-width: 768px)`.

### Verification Results (Post-Final Edit)
- **Live Chrome End-to-End QA (`http://localhost:3008` + `http://localhost:5050`):**
  - Initial boot & full session reported `0` console errors, `0` uncaught exceptions, `0` `window.alert()` dialogs, and HTTP `200` on `/favicon.ico`.
  - Verified HPBOSE bilingual instructions (upright text, zero KaTeX italic corruption), Board Swap (`1 Mark` badges), 1M subjective Custom Q Add/Edit/Delete (`POST 201`, `PUT 200`, `DELETE 200`), `#tabHandwritten` rubric KaTeX + `#btnApproveHandwritten` fixed toast, `snr_p12_c01_011` single `solve-and-sync` (`200`, `GROQ_OPENAI/GPT-OSS-120B`, Electric Dipole `[Option A]`), Inject AI Preview (`34` KaTeX spans), `#whatsAppModal` (`z-index: 10025`) stacked above `#modalStudentIndividualReport` (`z-index: 10006`), `B_{\text{end}}` & `50` KaTeX spans with `0` `.katex-error`, Director header preservation, Student `#studentPortalNav` desktop visibility, CBSE `+4 / 0` scoring & zero `-1M` badges, `"Practice Formula"` Physics drill, and Student `"Board"` drawer track preserving Student header.
  - Mobile `360x800` measured `documentElement.scrollWidth === 360 <= 360` across all 6 tested views (`Create Test & Paper`, `Class Progress`, `Test 01 Diagnostic Report`, `#modalStudentIndividualReport`, `#studentPortalNav` with internal `326/326`, and `#ntaExamContainer`).
- **Backend Automated Suites (`cd backend`):** `test_evaluator.js` (8/8), `test_board_paper_generator.js` (6/6), `test_latex_rendering_and_options.js` (2,524 options + 4 assessments), `test_personalized_remedial_flow.js`, `test_question_bank_solution_studio.js`, `test_real_whatsapp_dispatch.js`, `test_voice_tutor_hinglish.js` (including Edge TTS MP3 & Gemini Live WebSocket handshake), `test_end_to_end_assignment_flow.js`, `test_math_question_bank.js`, `test_subject_isolation_and_teacher_workflow.js`, and `test_subject_remedial_pipeline.js` (`27/27`) all exited `0`.
- **Frontend Automated Suites (`cd frontend`):** `test_latex_formatter.js`, `test_latex_rendering.js`, `test_intuitive_solution_card.js`, `test_screenshot_case.js`, `test_buttons.js` (`186/186` static buttons + 6 dynamic selectors), and `test_quiz_creation_and_modal_display.js` (`32/32`) all exited `0`.

---

## [2026-11-12 11:15] Live Gemini/Groq Model Optimization & Chrome End-to-End QA

### Live AI Fixes Applied
- **Gemini Model Order & Timeout (`backend/src/services/llmQuestionEngine.js`):** Replaced `['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest']` (`4000ms` timeout causing aborts) with `['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-2.5-flash']` (`8500ms` timeout). Verified live HTTP `201` via `/api/questions/generate-llm` (`Google Gemini (gemini-flash-lite-latest)` / `gemini-3.5-flash-lite`).
- **Gemini Multimodal Order (`backend/src/services/questionInjectionService.js`):** Updated `callGeminiMultimodal()` model order to `['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-2.5-flash']` (removing 404 `gemini-2.5-flash-lite` and slow timing-out models).
- **Provider Metadata (`backend/src/routes/questions.js`):** Updated `/api/questions/providers` status labels to `qwen/qwen3.8-27b` (Groq) and `gemini-flash-lite-latest` (Google Gemini Flash).

### Chrome End-to-End QA Results (`http://localhost:3008` + `http://localhost:5050`)
- **Verified Working Live:** Theme toggle, Role Gateway, `/api/questions/providers` (`200`), Groq & Gemini `/api/questions/generate-llm` (`201`), Unit Test draft (`201`) + Swap, CBSE 80M & HPBOSE 60M Board Papers (`katexErrors: 0`), Question Bank 4-filter narrowing (`518 -> 390 -> 3`), Solution Studio KaTeX, AI Extraction `/inject/preview` (`200`), Class Progress Chart.js + Roster, Student CBSE non-negative scoring (`4/12`), `/whiteboard` `tldraw` canvas (`0` console errors), `/api/voice-tutor/gemini-live-token` (`200` + live WebSocket handshake), `/solve-and-sync` (`200`), `/interrupt` (`200`), `/audio` (`200`), and `/explain` (`200` direct).
- **Remaining Bugs Discovered During Chrome QA (Pending Fix Confirmation):**
  1. **SVG `<path>` `<br/>` Corruption:** KaTeX `\sqrt` `<svg><path d="...">` has newlines converted to `<br/>` (`44` bad paths in CBSE 80M, `38` in HPBOSE 60M), throwing `<path> attribute d` console errors.
  2. **Board Paper Swap & Edit Bugs:** Swap modal on Q1 (`c10_m_pyq_003`) displays `undefined Marks` and cross-subject Physics bank filter; saving a 1M subjective question without options appends empty `(A)-(D)` options with `Answer: A`.
  3. **Student Performance Modal KaTeX/JS Escaping & z-index:** `#modalStudentIndividualReport` shows `8` KaTeX errors plus corrupted JS escapes (`\t/\f/\v/\c`), and clicking `#btnDrilldownSendWhatsApp` opens `#whatsAppModal` (`z-index: 1000`) hidden behind `#modalStudentIndividualReport` (`z-index: 10006`).
  4. **Director Role View/Header Sync:** Switching to Question Bank leaves `#directorView` visible over hidden `#teacherView`; clicking Board view resets header name/subtitle to Faculty Physics while keeping `#directorView` active.
  5. **Student Portal Desktop Nav, Remaining `alert()` Calls & Wrong Formula Drill:** `#studentPortalNav` still computes `display: none` at `1440px`; `Load Assigned Test`, Smart Report `"Practice 3 Questions"`, `"Launch 5-Min Remedial Drill"`, and `#tabHandwritten` `"Run Vision AI Evaluation"` still fire `alert()`; CBSE test header/review badges still display `"+4.0 / -1.0"` & `"-1 Mark"` despite `4/12` non-negative total; `"Practice Formula"` on Physics Q2 opens a Biology (`Verhulst-Pearl`) drill; Smart Report shows raw `"B_{end}"` braces.
  6. **Handwritten Tab Visibility & Raw Math; Minor 404/Wiring:** `#tabBtnHandwritten` sits inside hidden `#teacherSubTabs` and renders 4 raw `$...$` strings; `GET /favicon.ico` returns `404`; legacy `#btnGenerateQuestion` does not exist in DOM; `/api/voice-tutor/explain` has no frontend UI caller.
  7. **Mobile `360x800` Overflows:** Horizontal overflow measured on Teacher Create Test (`scrollWidth: 378`), Class Progress (`scrollWidth: 378`, table `792px`), Test 01 Diagnostic Report (`scrollWidth: 731`), and `#modalStudentGraphsGrid` (`scrollWidth: 731`, grid `622.6px`). Remaining two 360px checks (`#studentPortalNav`, `#ntaExamContainer`) were interrupted by `chrome_devtools` 1m timeout.

---

## [2026-11-12 10:42] Live LLM Key Configuration & Browser Check Status

- **Environment Configuration (`backend/.env`):** Configured `GEMINI_API_KEY` and `GROQ_API_KEY` (kept untracked inside `.gitignore`-protected `backend/.env`).
- **Live Key Verification Results:**
  - `GROQ_API_KEY`: Verified working against Groq Cloud (`generateLlmQuestion` -> `Groq LPU (qwen/qwen3.8-27b)`, `generateHinglishAudioBrief` -> `GROQ_OPENAI/GPT-OSS-120B`, and `processQuestionExtraction` via Groq LPU).
  - `GEMINI_API_KEY`: Verified returning HTTP `200` on `gemini-2.5-flash:generateContent` and issuing live ephemeral tokens via `@google/genai` `authTokens.create(...)`.
  - **Identified Pending Issue:** `backend/src/services/llmQuestionEngine.js` (`callGeminiApi`) and `backend/src/services/questionInjectionService.js` (`callGeminiMultimodal`) currently prioritize `['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest']` (`llmQuestionEngine.js` with a 4s `AbortController`), causing Gemini-direct generation to abort and fall back to the NCERT PYQ bank instead of routing directly to `gemini-2.5-flash`.
- **Browser QA Block:** Both live servers (`backend` on `:5050` and `frontend` on `:3008`) were started, but automated Chrome inspection could not attach because Chrome remote debugging (`DevToolsActivePort`) is not yet enabled on the host.

---

## [2026-11-12 10:30] Full-Stack Bugfix, CBSE/JEE Scoring Fix & UI/WCAG Remediation

Resolved all backend data/scoring issues and frontend runtime, navigation, responsive, and WCAG 2.2 AA accessibility defects discovered during the Nov 11 audit across both `backend/` (`:5050`) and `frontend/` (`:3008`).

### Backend Fixes (`backend/`)
- **Custom Chemistry Question Bank (`backend/src/database/custom_injected_questions.json`):** Completed Nernst equation options (`A` `$1.13\,\text{V}$` through `D` `$1.16\,\text{V}$` with `distractor_trap` explanations) on persisted custom question `snr_c_inj_1793801747344_553` in both `options_latex` and `options`. `node scripts/test_latex_rendering_and_options.js` now passes 100% across all 2,528 options and 4 pre-seeded assessments.
- **Board-Aware Assessment Scoring (`backend/src/routes/assessments.js`):** Replaced hardcoded JEE `+4 / -1` scoring in `POST /api/assessments/:id/submit` with board-aware calculation (`isCompetitiveExam = examBoard.includes('JEE') || examBoard.includes('NEET')`, default `negativePenalty` of `1.0` only for JEE/NEET or explicit `negative_marks`, `defaultMarksPerQ = totalMarks / assessment.questions.length`, clamped `totalScore = Math.max(0, ...)`). Verified CBSE submission `asgn_10_sci_01` returns `4/12` (previously `3/12`).
- **Safe `dotenv` Initialization (`backend/src/services/aiVoiceTutorService.js`, `llmQuestionEngine.js`, `questionInjectionService.js`):** Guarded `require('dotenv').config()` in `try/catch` so standalone service scripts load cleanly even in minimal environments.

### Frontend Fixes (`frontend/`)
- **Runtime Startup & Defensive Guards (`frontend/js/app.js`):** Added null guards in `updateTopicsForGrade()` (`if (!selectTopic) return;`) and `renderCurrentQuestionInPreview()` (`if (!qTextEl || !optListEl || !solTextEl) return;`) eliminating the `DOMContentLoaded` `TypeError` on `#renderQuestionText`.
- **Teacher / Director Portal Navigation (`frontend/js/app.js`):** Updated `switchTeacherTab()` to preserve `'director'` role instead of demoting Director back to Teacher, and normalized legacy targets `tabGenerator` -> `tabTeacherCreateTestAndPaper` (`unit_test`) and `tabStudents`/`tabSmartReports` -> `tabTeacherClasses` (`roster` subview + `loadAndRenderSmartReport()`).
- **Drilldown Modal, Smart Report & WhatsApp Dispatch (`frontend/index.html`, `frontend/js/app.js`):** Updated `handleGoToSmartReport()` to route cleanly to Student Smart Report (`tabStudentSmartReport`); updated `openStudentDrilldown()` to populate `#modalStudentIndividualReport` (scores, Chart.js subtopic/radar graphs, KaTeX, `_currentStudentRemedialPlan`) when `#modalStudentDrilldown` is absent; renamed `#btnDispatchWhatsAppModal` -> `#btnDrilldownSendWhatsApp` and wired its click handler to the active student report state.
- **Student Portal Actions, Desktop Nav & Question Bank Filters (`frontend/index.html`, `frontend/js/app.js`):** Removed `display:none !important;` from `#studentPortalNav`; replaced all 6 hardcoded `onclick="alert(...)"` buttons with `window.openPreviousTestReview(...)` and `window.launchRemedialDrillSheet(...)`; added Question Bank filter controls (`#selectQbSource`, `#selectQbDifficulty`, `#selectQbFormat`, `#inputQbSearch`) with explicit labels; routed printable exam handouts (`generatePrintablePaperHtml()`) to local vendored `vendor/katex/` assets instead of external CDN.
- **Responsive Layout, Design Tokens & WCAG 2.2 AA (`frontend/css/styles.css`, `frontend/index.html`, `frontend/js/app.js`):** Added missing CSS tokens `--bg-surface`, `--accent-red`, and `--font-mono` (plus dark theme overrides); added `@media (max-width: 768px)` rules collapsing `#ntaExamContainer` and `.responsive-2col-grid` to `1fr`, wrapping `#studentPortalNav`, and resetting input `min-width: 0`; updated `#modalStudentGraphsGrid` to `minmax(min(100%, 340px), 1fr)`; added keyboard `role="button"`/`tabindex="0"`/`aria-label`/Enter+Space handling to `.palette-btn`; added `aria-label`/`<label for>`/`btn-icon` classes to all icon buttons and inputs plus `verifyInteractiveControlAccessibility()`.

### Verification Results (Post-Final Edit)
- **Backend (`cd backend`):** `npm test` (`test_evaluator.js`), `test_board_paper_generator.js`, `test_latex_rendering_and_options.js`, `test_question_bank_solution_studio.js`, `test_personalized_remedial_flow.js`, and `test_real_whatsapp_dispatch.js` all exited `0` and passed (with live localhost `fetch` check inside `test_real_whatsapp_dispatch.js` skipped offline cleanly).
- **Frontend (`cd frontend`):** `test_buttons.js` (`185/185` static buttons + 6 dynamic selectors bound), `test_intuitive_solution_card.js`, `test_latex_formatter.js`, `test_latex_rendering.js`, and `test_screenshot_case.js` all exited `0` and passed 100%.
- **Integrated Audits:** `audit_ui_dom.js` reported 0 unhandled buttons, 0 unlabelled inputs/selects/textareas, and 0 unlabelled icon buttons; `audit_frontend_runtime.js` passed all 8 runtime checks with all 17 `fetch()` calls targeting `http://localhost:5050`; in-process `audit_all_features.js` passed `13/13` checks (`0` failures).
- **Documentation Sync:** Updated `log.md`, `TASKS.md` (`TASK-16`), and `INTERN_ONBOARDING_GUIDE.md` across both `backend/` and `frontend/`.

---

## [2026-11-11 22:30] Full Function & Feature Verification Audit

Executed automated backend test scripts, in-process Express API verification across all routers, frontend script checks, and a DOM runtime harness for `frontend/js/app.js` + `frontend/js/config.js`.

### Working Backend Features (Verified HTTP 200/201/204/403)
- **Gateway & Cross-Port CORS (`backend/src/server.js`):** `GET /` (`200`), `GET /api/health` (`200 HEALTHY`), and CORS preflight `OPTIONS` allowing `http://localhost:3008` (`204`) all work.
- **Faculty Auth & Curriculum Isolation (`backend/src/routes/curriculum.js`):** 6-faculty directory, mobile phone lookup (`9816010010`, `9816010001`), teacher login, 14-chapter Class 10 Math taxonomy, `POST /classes`, `POST /students` (`name`/`rollNumber`), `POST /generate-test`, and `POST /simulate-attempts` all pass.
- **Question Banks, Subject Lock & Extraction (`backend/src/routes/questions.js`):** Providers, Class 10 PYQ, 438-question Class 10 Math bank, LLM generation fallback (`201`), cross-subject lock enforcement (`403` when Physics teacher targets Chemistry), and authorized text preview (`200`) all pass.
- **Paper Studio, Remedial & DOCX Export (`backend/src/routes/assessments.js`):** Unit test draft + publish, CBSE 80M & HPBOSE 60M Board Paper generation + alternatives lookup, pattern blueprints, personalized remedial generation + formula write-in validation (`1/f = 1/v + 1/u`), and binary `.docx` ZIP export all pass.
- **Analytics, Telemetry, Vision & Notifications:** Class dashboard, individual drilldown API, pilot overview, telemetry recording/events, handwritten submissions/evaluate, uploaded handwritten sheet Vision OCR, weekly report card generation, and WhatsApp `wa.me` link dispatch all pass.
- **Voice Tutor & Whiteboard APIs (`backend/src/routes/voiceTutor.js`):** `/explain`, `/solve-and-sync`, `/interrupt`, and `/whiteboard-logs` (`GET`/`POST`) pass (`200`). Correction to prior Nov 9 note: `POST/GET /api/voice-tutor/gemini-live-token` **does exist** via `router.all('/gemini-live-token')` (`voiceTutor.js:18`) and returns HTTP `500` `"GEMINI_API_KEY is not configured on server"` when `.env` lacks a live key (external TTS/Gemini live streaming require valid API keys and outbound internet).

### Working Frontend Infrastructure
- **Cross-Port Wiring & Static Server (`frontend/js/config.js`, `frontend/server.js`):** `getHapsApiBaseUrl()` / `getHapsWsBaseUrl()` resolve `localhost:3008` -> `http://localhost:5050` / `ws://localhost:5050`, all 18 runtime boot `fetch()` calls target `http://localhost:5050`, zero bare relative `fetch('/api/...')` calls remain in `app.js`, `whiteboard.html`, or the `tldraw` bundle, and all 4 LaTeX / Intuitive Solution Card suites pass.

### Failing / Broken Features Confirmed During Audit
1. **Persisted Chemistry Bank Invalid Option Count (`backend/src/database/custom_injected_questions.json`):** Custom injected question `snr_c_inj_1793801747344_553` has only **2** options (`A`, `B`) instead of 4, causing `backend/scripts/test_latex_rendering_and_options.js` to fail (`2 !== 4`) once `dotenv` is installed and hydration succeeds.
2. **CBSE Scoring Formula Hardcoded (`backend/src/routes/assessments.js:226`):** `POST /api/assessments/asgn_10_sci_01/submit` applies JEE `+4/-1` marking (`score = 3/12` for 1 right + 1 wrong) to CBSE Class 10 assessments and ignores `q.marks`.
3. **Startup Null Exception (`frontend/js/app.js:8697`):** `initApp()` -> `renderInitialQuestion()` -> `renderCurrentQuestionInPreview()` throws `TypeError: Cannot set properties of null (setting 'innerHTML')` because `#renderQuestionText` does not exist in `index.html`.
4. **Teacher Navigation Blank Tabs & Traps (`frontend/index.html`, `frontend/js/app.js`):** `#tabSmartReports` and `#tabStudents` are empty `display:none !important` divs; `#tabGenerator` traps navigation; clicking drawer tabs demotes Director role back to Teacher (`app.js:1237`).
5. **Broken Drilldown & Missing QB Filter Inputs (`frontend/js/app.js`):** `openStudentDrilldown()` queries non-existent `#modalStudentDrilldown` (modern modal is `#modalStudentIndividualReport`); `filterQuestionBankCards()` queries missing `#selectQbSource`, `#selectQbDifficulty`, `#selectQbFormat`, and `#inputQbSearch`.
6. **Student Portal Placeholders & Hidden Desktop Nav (`frontend/index.html`):** `#studentPortalNav` has `display:none !important;` and 6 Previous Tests / Remedial buttons execute hardcoded `onclick="alert(...)"` popups instead of modals.
7. **Responsive, Accessibility & Legacy Test Gaps:** `#ntaExamContainer` (`2.2fr 1fr`) and `#modalStudentGraphsGrid` (`minmax(380px, 1fr)`) overflow 360px mobile viewports; missing `--font-mono`; 53 unlabelled form inputs & 5 unlabelled close buttons; `backend/scripts/test_real_whatsapp_dispatch.js` fails on removed `#btnDrilldownSendWhatsApp`.

- Also synced updated audit notes into `frontend/INTERN_ONBOARDING_GUIDE.md` & `backend/INTERN_ONBOARDING_GUIDE.md`.

---

## [2026-11-11 22:21] Documentation Restoration & Full Rewrite (`frontend/` & `backend/`)

### Restored & Updated Docs Inside Both Standalone Folders
Restored `ARCHITECTURE_EXCALIDRAW_MERMAID.md`, `INTERN_ONBOARDING_GUIDE.md`, and `TASKS.md` from `HEAD` (`dbb835d`) cleanly into **both** `frontend/` and `backend/` (keeping root clean with only `backend/`, `frontend/`, `.gitignore`, `README.md`, `log.md`), and fully rewrote them for the decoupled architecture:
- **`ARCHITECTURE_EXCALIDRAW_MERMAID.md` (in `frontend/` & `backend/`):**
  - Updated Master System Diagram, Teacher Question Bank Diagram, Assessment Evaluation Diagram, and Deployment Flow Diagram to reflect standalone `frontend/` (`:3008`, `server.js`, `js/config.js`, `tldraw` whiteboard) communicating cross-port with pure-API `backend/` (`:5050`, `CORS_ORIGIN`, `backend/database/` + `backend/src/database/`).
  - Replaced hardcoded `/Users/ajaymokta2002/...` absolute file paths and obsolete monolithic Vercel pipeline links with accurate repo paths.
- **`INTERN_ONBOARDING_GUIDE.md` (v3.0.0 — in `frontend/` & `backend/`):**
  - Updated Stack Table, Backend LLD diagram, Database Paths (`backend/database/*.sql`), Frontend Sections (`js/config.js`, `whiteboard.html`, `geminiLiveVoiceTutor.js`, `.agents/rules/design_principles.md`), Cross-Port Setup (`:5050` & `:3008`), local Kafka `ECONNREFUSED` fallback note, separated `backend/scripts/` + `frontend/scripts/` test commands, and separate-repo Git workflow + `log.md` rules.
- **`TASKS.md` (in `frontend/` & `backend/`):**
  - Updated `TASK-01`, `TASK-08`, `TASK-09`, and `TASK-14` file paths and status notes (`backend/database/`, standalone Dockerfiles, removed root monolith configs) and added **`TASK-15: Dual-Repo Separation, Cross-Port Architecture & Workspace Consolidation`**.
- **Synced Secondary Markdown Files:**
  - Updated `README.md`, `frontend/README.md`, `backend/README.md`, `frontend/AGENTS.md`, `frontend/GEMINI.md`, `backend/AGENTS.md`, and `backend/GEMINI.md` to reference all restored guides and enforce continuous `.md` + `log.md` synchronization.

---

## [2026-11-11 22:10] Workspace Consolidation & Root Cleanup

### Investigation Findings
- **Duplicate `school_student_system-SSS-/` folder:** Verified via timestamps and Git metadata that `c:\unisole\school_student_system-SSS-\school_student_system-SSS-` was created on `2026-11-09 20:19:11` when `git clone https://github.com/UnisoleSchool2026/school_student_system-SSS-` was run while already inside the root folder. It pointed to the same remote at identical HEAD commit `dbb835d` with no uncommitted changes.
- **Kafka startup messages on `backend` (`npm start`):** Verified in `backend/src/kafka/producer.js` and `backend/src/kafka/consumer.js` that when `KAFKA_BROKERS=localhost:9092` is set in `backend/.env` without a local Kafka broker running, `kafkajs` logs `ECONNREFUSED` retry errors before automatically falling back to the resilient in-memory event bus while the server stays active on port `5050`.

### Structural Changes
- **Root Folders Consolidated (Strictly `backend/` and `frontend/`):**
  - Removed duplicate nested clone `school_student_system-SSS-/`.
  - Moved `.agents/` -> `frontend/.agents/` (preserving UI/UX rule binding to `frontend/DESIGN_PRINCIPLES.md`).
  - Moved `scripts/verify_staging.js` -> `backend/scripts/verify_staging.js`.
  - Removed monolithic/unused root directories: `k8s/`, `.github/`, and `scripts/` (including `scripts/dev.sh`).
- **Root Files Consolidated:**
  - Created `log.md` at workspace root.
  - Rewrote root `README.md` cleanly for the decoupled `backend/` + `frontend/` architecture.
  - Retained `.gitignore` at workspace root.
  - Removed obsolete/redundant root files no longer needed at root: `AGENTS.md`, `GEMINI.md`, `DESIGN_PRINCIPLES.md` (already stored inside both `frontend/` and `backend/`), `ARCHITECTURE_EXCALIDRAW_MERMAID.md`, `INTERN_ONBOARDING_GUIDE.md`, `TASKS.md`, `docker-compose.yml`, `docker-compose.prod.yml`, and `BUG_AUDIT_REPORT.pdf`.
- **Documentation Sync:**
  - Updated `frontend/README.md`, `backend/README.md`, `frontend/AGENTS.md`, `frontend/GEMINI.md`, `backend/AGENTS.md`, and `backend/GEMINI.md`.

---

## [2026-11-11 18:52] Architectural Split: Standalone `frontend/` & `backend/` Repositories

### Database & Backend (`backend/` — Port `5050`)
- Moved root `database/` (`schema.sql`, `seed_data.sql`) -> `backend/database/`. Kept `backend/src/database/` intact.
- Updated `backend/package.json` with missing runtime dependencies previously declared only at root (`@google/genai`, `docx`, `msedge-tts`) and updated all `scripts` commands to target `scripts/*.js`.
- Removed out-of-sync `backend/package-lock.json` and updated `backend/Dockerfile` to fall back gracefully between `npm ci --omit=dev` and `npm install --omit=dev`.
- Updated `backend/src/server.js`:
  - Removed static serving of `../../frontend` and SPA HTML fallback.
  - Added JSON info route at `GET /`.
  - Configured CORS with `CORS_ORIGIN` / `FRONTEND_URL` environment support plus automatic localhost dev allowance (`localhost:3008`, `localhost:3000`, `localhost:5173`).
- Updated `backend/src/services/questionInjectionService.js` to resolve `pdf-parse` worker dynamically via `require.resolve('pdf-parse/package.json')` instead of hardcoded `../../../node_modules/...`.
- Updated `backend/.env.example` with `PORT=5050`, `FRONTEND_URL=http://localhost:3008`, `CORS_ORIGIN`, and optional WhatsApp gateway variables.
- Moved 23 backend tests and Python bank generators from root `scripts/` -> `backend/scripts/` and fixed internal relative paths.
- Added standalone `backend/README.md`, `backend/AGENTS.md`, `backend/GEMINI.md`, `backend/DESIGN_PRINCIPLES.md`, and `backend/.gitignore`.

### Frontend (`frontend/` — Port `3008`)
- Created `frontend/server.js` (zero-dependency standalone Node static/SPA server on port `3008` with `/whiteboard` clean URL support and path traversal protection).
- Created `frontend/package.json` with `start`, `dev`, `build:whiteboard`, and test scripts plus `katex`, `react`, `react-dom`, `tldraw`, and `esbuild`.
- Created `frontend/.env.example` (`PORT=3008`, `BACKEND_URL=http://localhost:5050`).
- Created `frontend/js/config.js` providing centralized runtime resolution (`getHapsApiBaseUrl()`, `getHapsWsBaseUrl()`, `setHapsBackendUrl()`).
- Loaded `js/config.js` in both `frontend/index.html` and `frontend/whiteboard.html`.
- Updated `frontend/js/app.js`, `frontend/js/geminiLiveVoiceTutor.js`, `frontend/whiteboard.html`, `frontend/src_whiteboard/index.jsx`, and `frontend/vendor/tldraw/tldraw-standalone.bundle.js` so all `/api/*` requests and WebSocket connections resolve via the backend base URL instead of bare relative paths.
- Moved 8 frontend test scripts into `frontend/scripts/` and updated relative paths.
- Added standalone `frontend/README.md`, `frontend/AGENTS.md`, `frontend/GEMINI.md`, `frontend/DESIGN_PRINCIPLES.md`, and `frontend/.gitignore`.

### Monolithic Root Removal
- Removed root `package.json`, `package-lock.json`, empty `node_modules/`, `api/index.js`, `vercel.json`, `scripts/frontend_server.js`, `scripts/deploy_vercel.sh`, and `scripts/promote_to_production.sh`.

---

## [2026-11-09] Initial Read-Only Bug Audit
- Audited frontend DOM, JS state/navigation handlers, CSS responsive tokens, WCAG 2.2 AA accessibility, and backend scoring/voice routes.
- Identified 18 issues (navigation dead tabs, `openStudentDrilldown` missing modal, director role reset, hidden student desktop nav, hardcoded `alert()` placeholders, missing `/gemini-live-token` route, 360px layout overflows, 53 unlabelled form inputs, +4/-1 CBSE scoring bug, unguarded `dotenv` imports) without modifying source code.

---

## [2026-11-13] Student AI Whiteboard Viewport Auto-Scaling & Fullscreen Theater Mode
- Fixed canvas truncation on the right and bottom where solution cards were sliced in half inside the student workspace iframe.
- Added responsive dynamic viewport coordinate scaling in `frontend/whiteboard.html` (`drawFallbackSmartboardSolution`) with virtual boundaries (1260 x 580) computing `scale = Math.min(availW / VIRTUAL_W, availH / VIRTUAL_H)` and centered offset translation, guaranteeing 100% visibility of all 5 sections (Question Statement, Visual Schematic, Governing Principles, Derivation, and Evaluated Solution) on any display size.
- Added embedded mode stylesheet (`.embedded-mode`) in `frontend/whiteboard.html` to suppress redundant pacing HUD buttons and prevent status badge overlap/truncation when rendered within the student iframe.
- Added working Full Screen Theater Mode with dedicated buttons (`#btnStudentWbFullscreen`, `#btnStudentWbBannerFullscreen`) and keyboard shortcut (Escape) / fullscreenchange listeners in `frontend/js/app.js`, `frontend/index.html`, and `frontend/css/styles.css`.
- Increased default student whiteboard iframe wrap height from 540px to 600px and widened grid column ratio.
- Verified live in Chrome (1440x900 viewport) via browser QA automation: verified Class 10 Science 'Chemical Reactions and Equations', confirmed 0 console errors, confirmed all 5 cards visible with 0 clipping, confirmed smooth entry and exit into Full Screen mode.


