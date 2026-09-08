# AI QA Engineer — Project Architecture & Viva Preparation Guide

---

## 1. Project Overview

### What the Project Does
**AI QA Engineer** is an autonomous, AI-powered Quality Assurance platform. It analyzes full software repositories (from public or private GitHub URLs) and standalone code snippets, detects logic bugs and security flaws, writes end-to-end automated test suites (in Playwright, Jest, or Cypress), spins up local dev servers to run those tests, and autonomously repairs tests that fail using an **Agentic Self-Healing Loop**.

### What Problem It Solves
1. **Manual Test Writing is Slow and Expensive**: Writing end-to-end (E2E) integration tests and GitHub Actions CI/CD workflows takes developers hours or days.
2. **Flaky and Broken Test Maintenance**: When tests break due to UI or timing changes, developers waste time debugging test code rather than shipping features. This platform autonomously diagnoses test failures and fixes them.
3. **Multi-Stack Complexity**: Modern codebases combine frontend frameworks, backend APIs, and databases. Developers need a tool that can statically detect the exact tech stack in milliseconds and produce tailored tests without hallucinating APIs or DOM selectors.
4. **Single-File Logic Bugs**: Students and engineers frequently encounter runtime bugs (e.g., division by zero, null pointer dereferences, async race conditions). The platform's **Snippet Diagnostics** mode provides instant bug explanations, exact line numbers, and production-ready fixed code.

### Who Would Use It
- **Software Developers & QA Engineers**: To automatically generate Playwright/Cypress test suites and GitHub Actions workflows for their repositories.
- **Engineering Teams**: To audit repositories for security and architectural flaws during pull requests.
- **Students & Beginners**: To inspect buggy code snippets in Java, Python, JavaScript, etc., understand why bugs occur, and learn industry-standard best practices.

### Main Purpose of the AI QA System
To bridge the gap between static code analysis and dynamic testing by using **Google Gemini 2.5 Flash** as an intelligent reasoning engine that understands repository architecture, generates verified test suites, and autonomously corrects broken code.

---

## 2. Technologies Used

### Frontend Stack
| Technology | Where It Is Used | Why It Is Used in This Project |
| :--- | :--- | :--- |
| **React 19** | `frontend/src/` (`App.tsx`, `main.tsx`) | Core UI library for reactive component rendering, hooks (`useState`, `useEffect`, `useMemo`), and high-performance concurrent rendering. |
| **Vite 8** | `frontend/vite.config.ts` | Next-generation frontend build tool providing ultra-fast Hot Module Replacement (HMR) and optimized production bundling. |
| **TypeScript** | Throughout frontend (`.tsx`, `.ts`) | Enforces strict compile-time type safety for API requests, analysis records, and component state. |
| **Tailwind CSS v4** | `frontend/src/index.css` | Utility-first CSS framework used for responsive layout, glassmorphic panels (`backdrop-blur-md`), gradients, and dark-mode styling. |
| **Framer Motion** | `frontend/src/App.tsx` | Declarative animation library powering smooth transitions, progress bars, modal popups, and audit history animations. |
| **Lucide React** | `frontend/src/App.tsx`, `ErrorBoundary.tsx` | Clean, modern vector SVG icons for terminal badges, status indicators, and buttons. |
| **React Markdown** | `frontend/src/App.tsx` | Parses and renders AI markdown output safely into structured HTML headers, bullet lists, and paragraphs. |
| **React Syntax Highlighter (Prism)** | `frontend/src/App.tsx` | Provides VS Code-like syntax color highlighting for generated Playwright tests and fixed code blocks. |
| **html2canvas** | `frontend/src/pdfService.ts` | Screenshots off-screen HTML report templates into high-resolution canvas buffers directly inside the browser. |
| **jsPDF** | `frontend/src/pdfService.ts` | Compiles canvas images into multi-page, downloadable A4 PDF audit reports without server-side headless browsers. |

### Backend Stack
| Technology | Where It Is Used | Why It Is Used in This Project |
| :--- | :--- | :--- |
| **Node.js (>=20)** | Runtime environment | Cross-platform JavaScript runtime capable of executing asynchronous operations, spawning subprocesses, and managing networking. |
| **Express** | `backend/server.ts` | Minimalist web framework for building HTTP REST endpoints, middleware pipelines, and Server-Sent Events (SSE). |
| **TypeScript & ts-node** | Backend codebase | Ensures type safety on request payloads, analysis records, and child process configurations. |
| **Passport.js & passport-github2** | `backend/server.ts` | Handles GitHub OAuth 2.0 authentication so users can log in and select private/public repositories. |
| **express-session** | `backend/server.ts` | Manages server-side sessions with signed HTTP-only cookies to keep users logged in. |
| **Google Generative AI SDK (`@google/generative-ai`)** | `backend/services/testGenerator.ts` | Official Google SDK used to connect to Gemini 2.5 Flash and 1.5 Flash models with prompt engineering. |
| **Playwright (`@playwright/test`)** | `backend/services/testRunner.ts` | End-to-end browser automation engine that executes generated test specs against local dev servers and outputs JSON test results. |
| **Axios** | `backend/services/repoAnalyzer.ts` | HTTP client for selective GitHub REST API fetches and repository ZIP downloads. |
| **UUID (v4)** | `backend/services/database.ts` | Generates collision-proof unique identifiers for every analysis session. |
| **Local File Database (`ai-qa.json`)** | `backend/services/database.ts` | Lightweight, zero-config JSON file storage equipped with a sequential promise-lock queue (`runLocked`) for atomic persistence. |

---

## 3. Project Architecture

The application follows a decoupled **Client-Server Architecture** with **Asynchronous Background Processing** and **Real-Time Event Streaming**:

```text
                                  ┌─────────────────────────────────────────┐
                                  │           BROWSER / CLIENT              │
                                  │      React 19 Dashboard (Vite)          │
                                  └────────────────────┬────────────────────┘
                                                       │
                           HTTP Requests (POST / GET)  │  Server-Sent Events (SSE)
                           /api/analyze, /auth/github   │  /api/analyses/:id/stream
                                                       │
                                                       ▼
                                  ┌─────────────────────────────────────────┐
                                  │             BACKEND API                 │
                                  │         Express + TypeScript            │
                                  │                                         │
                                  │  • Passport.js GitHub OAuth             │
                                  │  • CORS Whitelist & Session Security    │
                                  │  • Active Jobs & AbortController Map    │
                                  │  • Atomic JSON DB Queue (runLocked)     │
                                  └───────┬────────────┬────────────┬───────┘
                                          │            │            │
                         Cloning & AST    │            │            │  Persistence
                                          ▼            │            ▼
                       ┌─────────────────────┐         │    ┌──────────────────┐
                       │ Repository Analyzer │         │    │  ai-qa.json      │
                       │ • API Selective     │         │    │  (Local Atomic   │
                       │ • Shallow Git Clone │         │    │   Database)      │
                       │ • Static Skills     │         │    └──────────────────┘
                       │ • Token Compressor  │         │
                       └──────────┬──────────┘         │
                                  │                    │
                        Context & │                    │
                        Skills    ▼                    ▼
                       ┌─────────────────────────────────────────┐
                       │         GOOGLE GEMINI 2.5 FLASH         │
                       │  • Primary Model: gemini-2.5-flash      │
                       │  • Fallback Model: gemini-1.5-flash     │
                       │  • Exponential Backoff (429/503 retry)  │
                       │  • Generates Playwright + CI/CD YAML    │
                       └──────────────────┬──────────────────────┘
                                          │
                         Executable Test  │
                         Suite Generated  ▼
                       ┌─────────────────────────────────────────┐
                       │          TEST RUNNER ENGINE             │
                       │  • Frees Port 3030 (taskkill / kill)    │
                       │  • CLI Web Shell / Dev Server Boot      │
                       │  • Runs Playwright Test (--reporter=json)│
                       └──────────────────┬──────────────────────┘
                                          │
                                ┌─────────┴─────────┐
                         Passed │                   │ Failed
                                ▼                   ▼
                       ┌─────────────────┐ ┌─────────────────────────────────┐
                       │ Status: COMPLETE│ │       AGENTIC FIXER LOOP        │
                       │ Full Report +   │ │ • Sends Broken Code + Logs back │
                       │ Execution Stats │ │   to Gemini for Auto-Repair     │
                       └────────┬────────┘ │ • Rewrites fixed-*.spec.ts      │
                                │          │ • Re-runs Playwright Test       │
                                │          └────────────────┬────────────────┘
                                │                           │
                                └─────────────┬─────────────┘
                                              │
                                              ▼
                                 [SSE Stream: 100% Progress]
                                              │
                                              ▼
                               [Frontend Dashboard & PDF Export]
```

---

## 4. Folder and File Structure

```text
ai-qa-engineer/
├── README.md                      → Project documentation, quick-start guide, and setup instructions
├── render.yaml                    → Cloud deployment configuration for Render (Web Service build & run commands)
├── .github/
│   └── workflows/
│       └── ai-worker.yml          → GitHub Actions workflow for autonomous background worker execution
├── backend/                       → Express & Node.js Backend API
│   ├── server.ts                  → Express entry-point, OAuth routes, SSE streaming, and API endpoints
│   ├── tsconfig.json              → TypeScript compiler configuration (CommonJS, ES2022 target, strict mode)
│   ├── package.json               → Backend dependencies (Express, Gemini SDK, Playwright, Passport, etc.)
│   ├── ai-qa.json                 → Local JSON file database storing all analysis sessions and test records
│   ├── services/                  → Modular backend business logic services
│   │   ├── database.ts            → Local JSON database CRUD with atomic promise-locking queue (`runLocked`)
│   │   ├── repoAnalyzer.ts        → Repository fetching (API / Shallow clone), static skills detection, token budget compressor
│   │   ├── testGenerator.ts       → Google Gemini SDK client, prompt engineering, retry backoff, test suite generation
│   │   ├── testRunner.ts          → Port 3030 management, CLI web shell emulator, dev server boot, Playwright runner
│   │   ├── agenticFixer.ts        → Autonomous self-healing loop repairing broken tests via Gemini
│   │   └── worker-entry.ts        → Headless CLI worker script invoked by GitHub Actions CI/CD
│   └── tests-generated/           → Directory where generated Playwright specs and cloned repos are temporarily stored
└── frontend/                      → React 19 + Vite Frontend Application
    ├── index.html                 → Main HTML shell with `#root` container and Google Fonts (Inter, JetBrains Mono)
    ├── vite.config.ts             → Vite configuration with React and Tailwind CSS v4 plugins
    ├── package.json               → Frontend dependencies (React 19, Framer Motion, marked, html2canvas, jsPDF, Lucide)
    ├── vercel.json                → Vercel deployment routing (SPA fallback rewriting all paths to /index.html)
    ├── eslint.config.js           → ESLint configuration for React and TypeScript
    └── src/
        ├── main.tsx               → React entry-point mounting root into DOM with StrictMode & ErrorBoundary
        ├── App.tsx                → Main dashboard component (Mode toggle, SSE listener, history, markdown rendering)
        ├── App.css                → Auxiliary CSS classes
        ├── index.css              → Tailwind CSS v4 directives, glassmorphic styles, custom scrollbars, animations
        ├── ErrorBoundary.tsx      → React class error boundary displaying glassmorphic crash recovery card
        ├── pdfService.ts          → Client-side PDF generation service using marked, html2canvas, and jsPDF
        └── pdfTemplate.ts         → Printable high-definition HTML template generator with @page print CSS
```

---

## 5. Complete Data Flow

### Workflow A: Repository Analysis & Autonomous Test Generation
1. **User Action**: The user selects or pastes a GitHub repository URL (e.g., `https://github.com/owner/repo`), optionally picks a framework (Playwright/Jest/Cypress) and focus area (e.g., "Authentication"), and clicks **Run Engine**.
2. **Frontend Request**: `App.tsx` sends an HTTP `POST` request to `/api/analyze` with `{ repoUrl, clientId, framework, focusArea, githubToken }`.
3. **Immediate Server Response**: `server.ts` creates an analysis record in `ai-qa.json` with status `STARTED`, returns `{ message: "Analysis initiated", analysisId, status: "STARTED" }` instantly (<100ms), and spawns an asynchronous background worker.
4. **SSE Connection**: The frontend immediately opens an EventSource connection to `/api/analyses/:id/stream` to receive live progress events.
5. **Phase 1 — Repository Ingestion (`repoAnalyzer.ts`)**:
   - Tries selective GitHub REST API fetching first for instant scanning (<2s).
   - If repo is large or private without API access, performs an ultra-shallow clone (`git clone --depth 1 --filter=blob:none`) into `tests-generated/site-{analysisId}` with ZIP fallback.
   - Broadcasts progress: `15% -> Fetching Repository`.
6. **Phase 2 — Static Skills Detection (`repoAnalyzer.ts`)**:
   - `detectSkills()` scans file extensions, package manifests (`package.json`, `requirements.txt`, `go.mod`, etc.), and code keywords in under 5ms.
   - Detects languages, frameworks (React, Express, FastAPI, etc.), ORMs, auth mechanisms, and devops tools.
   - Detects if the app is **headless** (CLI application without HTML/JSX/Vue files).
   - `compressPromptContext()` prioritizes HIGH priority files (auth, routes, schemas) to stay within the 120,000 character token budget.
   - Broadcasts progress: `50% -> Static Analysis`.
7. **Phase 3 — AI Test Generation (`testGenerator.ts`)**:
   - Assembles a structured prompt containing the repository code, detected tech stack, focus area, and headless DOM emulator instructions.
   - Calls `generateContentWithRetry()` using **Gemini 2.5 Flash** (with exponential backoff on 429/503 errors and fallback to Gemini 1.5 Flash).
   - Extracts the Framework Signature, Executive Summary, Testing Strategy, executable Test Suite, and CI/CD workflow YAML.
   - Writes the test file to `backend/tests-generated/generated-{timestamp}.spec.ts`.
   - Broadcasts progress: `85% -> Tests Generated`.
8. **Phase 4 — Execution & Environment Setup (`testRunner.ts`)**:
   - Frees up port 3030 by forcibly killing any lingering processes (`taskkill` on Windows, `kill -9` on Unix).
   - If headless CLI: Injects a web shell wrapper (`ai-qa-shell.html` + `ai-qa-server.js`) on port 3030 so Playwright can test terminal I/O via DOM selectors (`#cli-output`, `#cli-input`).
   - If modern web app: Starts framework dev server (`npm run dev` or `start`) on port 3030.
   - If static site: Boots `sirv-cli` on port 3030.
   - Polls `http://localhost:3030` until server is healthy.
9. **Phase 5 — Test Execution & Agentic Fixer Loop (`testRunner.ts` & `agenticFixer.ts`)**:
   - Runs `npx playwright test --reporter=json`.
   - **If all tests pass**: Appends execution results to the final report.
   - **If tests fail**: Triggers the **Agentic Fixer**. Sends broken test code and terminal logs back to Gemini. Gemini identifies the root cause (bad selector, race condition), generates a corrected test spec (`fixed-{timestamp}.spec.ts`), and re-executes Playwright.
10. **Completion**: Updates database record with status `COMPLETED`, total duration, and report. Broadcasts `COMPLETED` (100%) over SSE. The frontend dashboard renders the interactive report, and the user can click **Export PDF**.

---

### Workflow B: Single File Code Snippet Diagnostics
1. **User Action**: The user switches to **Snippet Diagnostics** mode, selects or drops a source file (e.g., `Calculator.java`), and clicks **Diagnose Code**.
2. **Frontend Request**: `App.tsx` reads file text and sends `POST /api/analyze-snippet` with `{ code, clientId, fileName }`.
3. **Database & Stream**: Backend generates an `analysisId`, updates status to `ANALYSING` (30%), and triggers `analyzeErrorSnippet(code)`.
4. **AI Analysis (`testGenerator.ts`)**: Gemini analyzes the code for logic bugs, runtime exceptions, syntax errors, and edge cases. Returns structured output:
   - `### 1. Corrected Solution`
   - `### 2. Error Identification` (Error Type, Line Number, Summary)
   - `### 3. Diagnostic Analysis & Edge Cases`
   - `### 4. Corrected Source Code`
   - `### 5. Best Practices & Optimization`
5. **Display & Vault**: Backend marks status `COMPLETED` (100%). Frontend renders the flaw card, line number card, status card, and syntax-highlighted corrected code block with copy-to-clipboard functionality. The record is saved in the browser's `localStorage` vault.

---

## 6. Important Files Breakdown

---

### File: `backend/server.ts`

**Purpose:**
The primary HTTP server and API routing hub for the backend application.

**Why is it needed?**
Exposes REST endpoints, configures GitHub OAuth authentication, establishes Server-Sent Events (SSE) streaming connections, and coordinates background analysis pipelines.

**Important functions/classes/endpoints:**
- `process.on('unhandledRejection')` & `process.on('uncaughtException')`: Safety nets preventing server crashes.
- `REQUIRED_VARS.forEach(...)`: Startup environment validation guard.
- `passport.use(new GitHubStrategy(...))`: Authenticates users with GitHub.
- `broadcastProgress(analysisId, stage, percent, details)`: Sends real-time SSE progress events to connected clients.
- `POST /api/analyze`: Main endpoint initiating asynchronous repository QA analysis.
- `POST /api/analyze-snippet`: Endpoint for single-file code debugging.
- `GET /api/analyses/:id/stream`: SSE route establishing persistent real-time streams.
- `POST /api/analyses/:id/cancel`: Kills background processes and cancels active jobs.

**Dependencies:**
`express`, `cors`, `passport`, `passport-github2`, `express-session`, `./services/repoAnalyzer`, `./services/testGenerator`, `./services/testRunner`, `./services/database`, `./services/agenticFixer`.

**Used by:**
Frontend client (`App.tsx`) makes all HTTP requests and SSE connections to this file.

**Execution flow:**
Starts when `npm run dev` or `node dist/server.js` is run. Validates environment variables, configures middleware, registers routes, initializes the local database via `initDb()`, and begins listening on `PORT` (default 5000).

**Professor may ask:**
> *"Why did you separate the `/api/analyze` response from the actual analysis execution?"*

**How I can answer:**
> *"Cloning a repository and generating AI tests takes 10 to 30 seconds. If we kept the HTTP request waiting, the browser connection would time out. Instead, we immediately return an `analysisId` so the UI remains instant, and we stream real-time progress using Server-Sent Events (SSE) as the background pipeline runs."*

---

### File: `backend/services/database.ts`

**Purpose:**
A lightweight, concurrency-safe, file-based JSON database service (`ai-qa.json`).

**Why is it needed?**
Stores analysis session records (repository URL, status, generated test code, CI/CD YAML, AI report, duration) without requiring an external database server like PostgreSQL or MongoDB.

**Important functions/interfaces:**
- `AnalysisRecord`: TypeScript interface defining the schema of an analysis job.
- `runLocked<T>(op)`: Sequential promise-chain locking mechanism that guarantees atomic file read-modify-write operations, preventing file corruption under concurrent requests.
- `initDb()`: Creates `ai-qa.json` with an empty array if it doesn't already exist.
- `createAnalysis(repoUrl, clientId)`: Appends a new analysis record with UUID v4 and returns the ID.
- `updateAnalysis(id, updates)`: Merges partial updates (e.g., status, test code) into an existing record.
- `getAnalyses(clientId)`: Returns history sorted with newest records first.
- `deleteAnalysis(id)`: Removes a record by ID.

**Dependencies:**
`fs` (Node promises and sync), `path`, `uuid` (`v4`).

**Used by:**
`server.ts` and `worker-entry.ts` for all persistence operations.

**Professor may ask:**
> *"What happens if two users run an analysis at the exact same millisecond? Won't `ai-qa.json` get corrupted?"*

**How I can answer:**
> *"No, because I implemented a promise-lock queue called `runLocked`. Every read and write operation is chained sequentially onto an in-memory promise (`dbPromise`). Even if multiple requests arrive simultaneously, each file operation waits for the previous one to complete before reading or writing to disk."*

---

### File: `backend/services/repoAnalyzer.ts`

**Purpose:**
Codebase ingestion, static tech-stack detection, directory filtering, and token-budget prompt compression.

**Why is it needed?**
Raw repositories contain images, binaries, lock files, and thousands of lines of non-critical code. This service extracts only meaningful source code, detects technologies in milliseconds, and fits the codebase into Gemini's context window.

**Important functions/interfaces:**
- `detectSkills(files)`: In-memory static analysis engine (<5ms) that scans file extensions, `package.json`, `requirements.txt`, `go.mod`, `pom.xml`, and code patterns to detect 20+ languages, frameworks, ORMs, and testing libraries.
- `getStackAwareRoots(files)`: Discovers language-specific source folders (e.g. `app/controllers` in Ruby, `src/main/java` in Spring Boot) for Phase 2 API fetching.
- `analyzeRepository(...)`: Primary coordinator that attempts selective GitHub API fetching first, falls back to ultra-shallow git cloning (`--depth 1 --filter=blob:none`), or ZIP archive download.
- `compressPromptContext(files)`: Dynamic token-budget compressor. Prioritizes HIGH priority files (auth, routes, controllers, schemas) and abstracts remaining files into structural metadata summaries to stay under 120,000 characters.

**Dependencies:**
`child_process` (`exec`), `axios`, `fs`, `path`, `util`.

**Used by:**
`server.ts` and `worker-entry.ts` at Stage 1 of repository analysis.

**Professor may ask:**
> *"How do you prevent exceeding the AI model's context window when analyzing large repositories?"*

**How I can answer:**
> *"I built a priority-based compression function called `compressPromptContext`. It assigns priorities: HIGH for routes, controllers, authentication, and database schemas, MEDIUM for utility components, and LOW for styling. HIGH priority files retain full source code, while lower-priority files that exceed our 120,000 character budget are abstracted into structural summaries containing their paths and signatures."*

---

### File: `backend/services/testGenerator.ts`

**Purpose:**
Handles all prompt engineering, API resilience, and communication with the Google Gemini AI models.

**Why is it needed?**
Acts as the bridge between raw codebase context and the generative intelligence of Gemini 2.5 Flash to create comprehensive E2E tests, CI/CD pipelines, and snippet bug diagnostics.

**Important functions:**
- `getGenAIInstance()`: Validates `GEMINI_API_KEY` and returns an authenticated GoogleGenerativeAI client.
- `generateContentWithRetry(prompt, primaryModel, fallbackModel)`: Resilient wrapper that retries on rate limits (429) or service outages (503) using exponential backoff, and automatically falls back from `gemini-2.5-flash` to `gemini-1.5-flash`.
- `generateTests(...)`: Formats repository context, detected tech stack, focus areas, and headless DOM selectors into a dense prompt, prompts Gemini, and extracts the test code, CI/CD YAML, and framework signature.
- `analyzeErrorSnippet(code)`: Sends a single code snippet to Gemini with a strict 5-part diagnostic prompt.

**Dependencies:**
`@google/generative-ai`, `fs`, `path`, `./repoAnalyzer` (`SkillProfile`).

**Used by:**
`server.ts`, `agenticFixer.ts`, and `worker-entry.ts`.

**Professor may ask:**
> *"What happens if the Gemini API rate-limits you or goes down temporarily during a test run?"*

**How I can answer:**
> *"I implemented `generateContentWithRetry` which has two levels of resilience: first, it retries up to 3 times with exponential backoff (doubling the delay between attempts) if it receives a 429 rate limit or 503 service unavailable error. Second, if the primary model (`gemini-2.5-flash`) remains exhausted, it automatically switches to our fallback model (`gemini-1.5-flash`) so the user's task never fails."*

---

### File: `backend/services/testRunner.ts`

**Purpose:**
Environment bootstrapping, local dev server management on port 3030, and Playwright test suite execution.

**Why is it needed?**
Automated tests cannot run in a vacuum; they need a live application server running on `http://localhost:3030` to test against.

**Important functions:**
- `prepareEnvironment(cloneFolder, isHeadless)`: Clears port 3030 of dangling processes (`netstat`/`taskkill` on Windows, `lsof` on Unix), installs minimal dependencies, and starts the appropriate server:
  - **Headless Node CLI**: Injects a custom web terminal emulator (`ai-qa-shell.html` and `ai-qa-server.js`) exposing `#cli-output` and `#cli-input` selectors.
  - **Modern Web App**: Starts `npm run dev` or `npm start`.
  - **Static Site**: Boots `sirv-cli`.
- `waitForServer(url, timeoutMs)`: Polls the server until it returns a valid HTTP response (<500).
- `runPlaywrightTest(testFileName, executionLog)`: Spawns `npx playwright test --reporter=json` and captures structured pass/fail metrics.

**Dependencies:**
`child_process` (`spawn`, `exec`), `fs`, `path`, `util`.

**Used by:**
`server.ts` and `worker-entry.ts`.

**Professor may ask:**
> *"How do you test a command-line Node.js application with Playwright if Playwright is a browser automation tool?"*

**How I can answer:**
> *"When our static analyzer detects that a project is a headless CLI application, `prepareEnvironment` dynamically injects a lightweight Web Shell Wrapper: an HTML page and micro-server that binds the CLI's standard input and output to DOM elements (`#cli-input` and `#cli-output`). Playwright can then type commands into the DOM input and assert against the terminal output in the browser."*

---

### File: `backend/services/agenticFixer.ts`

**Purpose:**
Autonomous self-healing test loop that fixes failing tests without human intervention.

**Why is it needed?**
AI-generated tests can occasionally fail on the first run due to timing race conditions, dynamic DOM IDs, or subtle selector mismatches. The Agentic Fixer loop detects these failures, diagnoses the root cause, and repairs the test.

**Important functions:**
- `fixFailedTest(repoUrl, brokenCode, errorLog, framework)`: Constructs a targeted prompt containing the failed test code and the exact terminal execution log (stack traces, timeout errors). Prompts Gemini to fix the code and returns verified, corrected test source code.

**Dependencies:**
`./testGenerator` (`generateContentWithRetry`).

**Used by:**
`server.ts` and `worker-entry.ts` when Playwright execution reports test failures.

**Professor may ask:**
> *"What makes this project 'Agentic' rather than just a standard script?"*

**How I can answer:**
> *"A standard script simply generates code and stops. An agentic system observes the environment, inspects its own results, and takes corrective action. In our project, if Playwright fails, our Agentic Fixer captures the error log, feeds both the broken code and terminal trace back into Gemini, generates a corrected test spec, and automatically re-executes the test until it passes or reports the root cause."*

---

### File: `backend/services/worker-entry.ts`

**Purpose:**
Standalone command-line runner script for executing analyses inside background containers or CI/CD pipelines.

**Why is it needed?**
Enables running full QA audits inside GitHub Actions runners (`.github/workflows/ai-worker.yml`) via `workflow_dispatch`.

**Important functions:**
- `runWorker()`: Reads `ANALYSIS_ID`, `REPO_URL`, `FRAMEWORK`, `FOCUS_AREA`, and `TARGET_GITHUB_TOKEN` from environment variables, runs the entire analysis and testing pipeline, and exits with code 0 on success or code 1 on failure.

**Dependencies:**
`dotenv`, `repoAnalyzer`, `testGenerator`, `testRunner`, `database`, `agenticFixer`.

---

### File: `frontend/src/main.tsx`

**Purpose:**
The client-side entry-point that mounts the React application into the browser DOM.

**Why is it needed?**
Initializes React 19 concurrent root rendering, applies global CSS, and wraps the application in an ErrorBoundary.

**Important code:**
- `createRoot(document.getElementById('root')!).render(...)`: Mounts React into `#root`.
- `<StrictMode>`: Enables React development safety checks.
- `<ErrorBoundary>`: Catches top-level rendering exceptions.

---

### File: `frontend/src/ErrorBoundary.tsx`

**Purpose:**
React class component error boundary providing crash resilience.

**Why is it needed?**
If a component throws a runtime error while rendering (e.g. malformed markdown), standard React unmounts the entire app. ErrorBoundary catches the error and displays a friendly recovery card with "Reload" and "Home" actions.

**Important methods:**
- `getDerivedStateFromError(error)`: Updates state to `hasError: true`.
- `componentDidCatch(error, errorInfo)`: Logs the component stack trace.
- `handleReset()`: Clears error and reloads the window.

---

### File: `frontend/src/App.tsx`

**Purpose:**
The central dashboard component handling all user interaction, state management, API requests, SSE streaming, and diagnostic rendering.

**Why is it needed?**
Provides the single-page application interface where users switch modes, input repos, view live progress, inspect reports, copy code, and export PDFs.

**Important state & functions:**
- `getClientId()`: Retrieves or generates persistent client ID in localStorage.
- `getReportTitle(run)`: Autonomously names reports based on identified bugs.
- `fetchHistory()`: Synchronizes backend analyses with the local storage vault (`ai-qa-local-vault`).
- `useEffect` for SSE: Connects to `/api/analyses/:id/stream` via `EventSource` to receive live progress percentages (0% -> 100%).
- `handleStart()`: Submits GitHub repository or snippet upload requests.
- `cancelAnalysis()`: Calls the cancel endpoint and aborts running subprocesses.
- `ReactMarkdown` & `SyntaxHighlighter`: Custom renderers for markdown reports and code blocks.

---

### File: `frontend/src/pdfService.ts` & `frontend/src/pdfTemplate.ts`

**Purpose:**
Client-side PDF report compilation and export.

**Why is it needed?**
Allows users to download polished, printable audit reports with metric cards, test suites, and CI/CD pipelines without sending sensitive code to third-party PDF services.

**Important functions:**
- `generateClientPDF(run)`: Parses markdown with `marked`, compiles metrics, renders template into off-screen DOM, rasterizes with `html2canvas` (2x scale), and compiles pages with `jsPDF`.
- `generatePremiumPDFHtml(...)`: Generates high-definition HTML with embedded `@page` print CSS rules.

---

## 7. Professor Viva Questions & Answers

### Category 1: Project Overview & Objectives

#### Q1: What is the main objective of your project?
**Answer:**
> *"The objective of AI QA Engineer is to provide an autonomous Quality Assurance platform that inspects software repositories or code snippets, detects logic bugs, generates end-to-end Playwright tests and CI/CD pipelines using Gemini 2.5 Flash, runs those tests on local dev servers, and self-heals broken tests through an agentic loop."*

#### Q2: What problem does this project solve for real-world software teams?
**Answer:**
> *"Writing and maintaining end-to-end tests is one of the most time-consuming parts of software engineering. When UI selectors or APIs change, tests break. Our platform automates test creation from scratch and features an autonomous repair loop that diagnoses why a test failed and fixes it automatically."*

#### Q3: What are the two operational modes in your platform?
**Answer:**
> *"First is **Repository Engine**, where users provide a GitHub URL to generate complete Playwright test suites and CI/CD pipelines. Second is **Snippet Diagnostics**, where users upload or paste a single code file (in Java, Python, JS, etc.) to receive an immediate bug diagnostic, exact line numbers, and corrected code."*

---

### Category 2: Frontend Architecture

#### Q4: Why did you choose React 19 and Vite instead of traditional Create React App?
**Answer:**
> *"Vite uses native ES modules during development, giving instantaneous server boot and sub-second Hot Module Replacement compared to Webpack. React 19 provides modern concurrent rendering features, improved hook performance, and seamless state transitions."*

#### Q5: How does the frontend track background analysis progress without freezing?
**Answer:**
> *"We use **Server-Sent Events (SSE)**. When an analysis starts, the frontend subscribes to `/api/analyses/:id/stream` using the browser's native `EventSource` API. The backend pushes live percentage updates (0% to 100%) and stage descriptions over a single HTTP connection, completely eliminating inefficient polling loops."*

#### Q6: How does session isolation work without requiring user registration?
**Answer:**
> *"In `App.tsx`, we have a utility called `getClientId()`. It checks `localStorage` for an existing client ID; if none exists, it generates a unique random string (e.g. `cli-abc123-timestamp`). Every API call passes this ID so users only see their own analysis history."*

#### Q7: Why did you implement an `ai-qa-local-vault` in localStorage?
**Answer:**
> *"To ensure offline resilience and fast loading. When the dashboard mounts, it immediately displays previously completed runs from the local vault without waiting for backend network requests. When new runs complete, the vault synchronizes automatically."*

---

### Category 3: Backend Architecture & Storage

#### Q8: Why did you use Express and TypeScript for the backend?
**Answer:**
> *"Express provides a lightweight, highly extensible middleware architecture that makes handling CORS, sessions, and SSE streaming straightforward. TypeScript adds compile-time type safety across our data models and prevents runtime undefined errors."*

#### Q9: How is the database implemented, and why didn't you use PostgreSQL or MongoDB?
**Answer:**
> *"For a standalone QA tool, managing an external database server adds operational complexity. Instead, we built a file-based JSON database in `database.ts` using `ai-qa.json`. To prevent concurrent write corruption, we implemented an in-memory promise queue called `runLocked` that serializes all read/write operations atomically."*

#### Q10: What is middleware in Express and where did you use it?
**Answer:**
> *"Middleware functions execute during the lifecycle of an HTTP request before route handlers. In `server.ts`, we use `cors()` to restrict origins, `express.json()` to parse request bodies, `session()` to manage cookies, `passport.initialize()` for authentication, and a global error-handling middleware at the bottom to catch unhandled errors."*

#### Q11: How does the server cancel an analysis job if the user clicks 'Cancel Execution'?
**Answer:**
> *"When an analysis starts, we create an `AbortController` and store it in an `activeJobs` Map. When the user posts to `/api/analyses/:id/cancel`, we call `abortController.abort()` to stop background tasks, retrieve the child process PID of the running dev server, and execute `taskkill /pid PID /t /f` on Windows (or `kill -9` on Linux) to immediately free system resources."*

---

### Category 4: AI & Gemini Integration

#### Q12: Which Gemini model are you using, and why?
**Answer:**
> *"We use **Gemini 2.5 Flash** as our primary model because it offers high reasoning capabilities, large context windows, and low latency for code generation. We also configure **Gemini 1.5 Flash** as an automatic fallback model in case of capacity constraints."*

#### Q13: What information is sent to Gemini when generating tests for a repository?
**Answer:**
> *"We send: 1) The repository URL, 2) The statically detected tech stack (languages, frameworks, ORMs, auth), 3) The prioritized code context (routes, schemas, controllers), 4) Any user-defined strategic focus area, and 5) Headless DOM emulator instructions if the project is a CLI tool."*

#### Q14: How do you prevent Gemini from hallucinating non-existent selectors or libraries?
**Answer:**
> *"Through our in-memory Static Skills Detection Engine (`detectSkills`). Before calling Gemini, we scan `package.json`, imports, and configs. We explicitly inject: 'Detected: React, Express, Prisma, JWT'. The prompt strictly instructs Gemini not to hallucinate selectors or libraries inconsistent with this verified stack."*

#### Q15: Why are AI requests made from the backend rather than directly from the frontend?
**Answer:**
> *"Security. If API calls were made from the frontend, our `GEMINI_API_KEY` would be exposed in the browser's network tab and source code, allowing anyone to steal our API quota. Calling Gemini from the backend keeps all secrets secure."*

---

### Category 5: QA & Agentic Self-Healing Loop

#### Q16: How does the Agentic Fixer loop work?
**Answer:**
> *"When Playwright runs the generated test suite, it outputs structured JSON. If `hasFailures` is detected, the backend captures the failed test spec and the terminal stack trace, and passes them to `fixFailedTest()`. Gemini diagnoses the runtime failure (e.g. element not visible, wrong timeout), rewrites the test file, and re-executes Playwright to verify the fix."*

#### Q17: How do you handle port conflicts during test execution?
**Answer:**
> *"In `testRunner.ts`, before booting any server, `prepareEnvironment` executes `netstat -ano` (on Windows) or `lsof` (on Unix) to identify any existing processes listening on port 3030 and forcibly kills them. This ensures tests always have a clean, dedicated port."*

---

## 8. 5-Minute Project Explanation (Viva Presentation Script)

> *"Good morning, Professor. Today I am presenting my project: **AI QA Engineer** — an autonomous Quality Assurance platform powered by Google Gemini 2.5 Flash.*
>
> *In modern software development, writing comprehensive end-to-end integration tests and setting up CI/CD pipelines is time-consuming. Furthermore, when tests fail due to minor UI or timing changes, developers spend hours debugging the test scripts themselves rather than working on business logic.*
>
> *To solve this, I designed a fullstack autonomous QA platform comprising a **React 19 Vite dashboard** on the frontend and an **Express TypeScript engine** on the backend.*
>
> *The system operates in two core modes:*
> *First, **Repository Engine**: A developer provides any public or private GitHub repository. Our backend performs a high-speed selective API fetch or shallow git clone. Before making any AI calls, our in-memory **Static Skills Engine** inspects manifests like `package.json`, `requirements.txt`, or `pom.xml` in under 5 milliseconds to detect the exact stack — including languages, frameworks, ORMs, and authentication methods.*
>
> *Next, our **Token Budget Compressor** sorts files by priority — keeping full source code for high-impact routes, schemas, and controllers while summarizing lower-priority styling files to fit safely within our 120,000 character limit.*
>
> *We then prompt **Gemini 2.5 Flash** using a resilient wrapper with exponential backoff and model fallback to Gemini 1.5 Flash. Gemini returns a structured diagnostic report, an executable Playwright test suite, and a GitHub Actions CI/CD workflow.*
>
> *What makes our platform truly agentic is the **Verification and Self-Healing Phase**: our backend boots a local server on port 3030 and executes Playwright against it. If the project is a headless CLI tool without a web UI, our system dynamically injects a web terminal emulator with `#cli-input` and `#cli-output` DOM selectors so Playwright can test terminal I/O in the browser.*
>
> *If any test assertion fails, our **Agentic Fixer Loop** takes the broken test and the terminal error logs, sends them back to Gemini for automated root-cause repair, generates a corrected test file, and re-runs the suite.*
>
> *Throughout this execution, progress is streamed to the frontend in real time using **Server-Sent Events (SSE)**, updating our progress bar from 0% to 100% without polling.*
>
> *Finally, our second mode, **Snippet Diagnostics**, allows students and developers to upload or paste a single buggy code snippet in Java, Python, or JavaScript. Gemini identifies the exact error type, line number, and edge cases, and provides verified, production-ready corrected code.*
>
> *All results can be exported as a professional multi-page PDF audit report generated entirely on the client side using `html2canvas` and `jsPDF`.*
>
> *In summary, this project demonstrates end-to-end software engineering: reactive UI design, asynchronous background processing, API security, automated browser testing, and resilient AI integration. Thank you, and I am ready for your questions."*

---

## 9. 1-Minute Project Explanation (Elevator Pitch)

> *"Professor, **AI QA Engineer** is an autonomous quality assurance platform that uses **Gemini 2.5 Flash** to analyze full GitHub repositories and code snippets.*
>
> *Instead of developers manually writing E2E tests, our backend statically detects the project's tech stack, prompts Gemini to generate a complete **Playwright test suite** and **GitHub Actions CI/CD workflow**, and runs the tests on a local server.*
>
> *If a test fails, our **Agentic Self-Healing Loop** automatically captures the terminal error log, asks Gemini to fix the broken selectors or timing issues, and re-verifies the test.*
>
> *The frontend is built with **React 19, Tailwind CSS, and Vite**, featuring real-time **Server-Sent Events (SSE)** progress streaming and one-click client-side **PDF audit export**. It bridges static code analysis with autonomous dynamic testing."*
