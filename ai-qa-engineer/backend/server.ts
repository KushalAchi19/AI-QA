// ============================================================================
// BACKEND SERVER ENTRY POINT: server.ts
// This is the main server file for the AI QA Engineer backend application.
// It initializes Express, configures security middleware, sets up Passport
// GitHub OAuth authentication, handles Server-Sent Events (SSE) streaming,
// and exposes API routes for repository QA analysis and snippet debugging.
// ============================================================================

// Import Express framework and essential HTTP type definitions from express.
// WHAT: Express is the core Node.js web application framework used to build HTTP REST APIs.
// WHY: Provides routing, middleware pipeline, request parsing, and response handling.
// HOW: Used to create the central `app` instance.
import express, { Request, Response, NextFunction } from "express";

// Import CORS (Cross-Origin Resource Sharing) middleware.
// WHAT: Handles HTTP headers that allow browsers to request resources from a different domain/port.
// WHY: The frontend runs on port 5173 (or Vercel) while backend runs on port 5000; CORS permits this communication.
// HOW: Registered on the Express application via `app.use(cors(...))`.
import cors from "cors";

// Import dotenv to read variables from the local `.env` file into process.env.
// WHAT: Loads key-value pairs (e.g. GEMINI_API_KEY, PORT) into the Node.js runtime.
// WHY: Keeps sensitive credentials and configurable settings out of the source code.
// HOW: Executed immediately via `dotenv.config()`.
import dotenv from "dotenv";

// Import express-session to manage user login sessions with cookies.
// WHAT: Stores session data on the server and assigns an encrypted session cookie to the browser.
// WHY: Required by Passport to keep users authenticated across multiple HTTP requests.
// HOW: Registered on the Express application via `app.use(session(...))`.
import session from 'express-session';

// Import Passport authentication middleware for Node.js.
// WHAT: Comprehensive authentication framework supporting various strategies.
// WHY: Simplifies OAuth 2.0 integration with external providers like GitHub.
// HOW: Initialized via `app.use(passport.initialize())` and `app.use(passport.session())`.
import passport from 'passport';

// Import GitHub authentication strategy for Passport.
// WHAT: Strategy plugin that implements GitHub's OAuth 2.0 authentication flow.
// WHY: Allows users to log in with GitHub to access their private and public repositories.
// HOW: Configured via `passport.use(new GitHubStrategy(...))`.
import { Strategy as GitHubStrategy } from 'passport-github2';

// Import child_process exec to run shell commands (like killing processes or cloning).
import { exec } from 'child_process';

// Import path utility to manipulate file paths safely across Windows and Linux.
import path from 'path';

// Import promise-based file system utilities for writing test files.
import fsPromises from 'fs/promises';

// ----------------------------------------------------------------------------
// ENVIRONMENT CONFIGURATION & GLOBAL SAFETY NETS
// ----------------------------------------------------------------------------

// Load environment variables from `.env` file into `process.env`.
dotenv.config();

// Global safety net for unhandled asynchronous promise rejections.
// WHAT: Catches any rejected Promise that did not have a `.catch()` block attached.
// WHY: Prevents the Node.js server process from abruptly crashing during background tasks.
// HOW: Listens on Node's global `process` object.
process.on('unhandledRejection', (reason: any) => {
    console.error('❌ Unhandled Promise Rejection:', reason?.message || reason);
    // Don't crash the server for unhandled rejections in background tasks
});

// Global safety net for uncaught synchronous exceptions.
// WHAT: Catches unexpected runtime errors thrown outside Express route handlers.
// WHY: Keeps the Express server alive and serving other incoming user requests.
// HOW: Logs the error details to standard error output.
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    // Log but don't crash – express will keep serving
});

// Startup guard verifying required environment variables.
// WHAT: Array of required environment variable keys needed for backend operation.
// WHY: Prevents starting the server in a half-broken state where API calls would fail later.
// HOW: Loops through each variable name and exits with code 1 if any are missing.
const REQUIRED_VARS = [
    'GEMINI_API_KEY',
    'GITHUB_WORKER_TOKEN',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'FRONTEND_URL',
    'BACKEND_URL'
];

REQUIRED_VARS.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`❌ CRITICAL ERROR: Missing environment variable ${varName}`);
        process.exit(1); 
    }
});

// ----------------------------------------------------------------------------
// EXPRESS APP INITIALIZATION
// ----------------------------------------------------------------------------

// Create the main Express application instance.
// WHAT: Root application object that coordinates routing, middleware, and request handling.
// WHY: Serves as the central backbone of the backend server.
// HOW: Instantiated by calling `express()`.
const app = express();

// Determine port from environment or fallback to 5000 for local development.
const PORT = process.env.PORT || 5000;

// ----------------------------------------------------------------------------
// SESSION & AUTHENTICATION MIDDLEWARE
// ----------------------------------------------------------------------------

// Configure Express Session middleware.
// WHAT: Sets session secret, expiration, and cookie security flags.
// WHY: Maintains persistent login state between requests.
// HOW: Handled via `app.use(session(...))` before Passport middleware.
app.use(session({
    secret: process.env.SESSION_SECRET || (() => {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('SESSION_SECRET env variable must be set in production');
        }
        console.warn('⚠️  SESSION_SECRET not set — using insecure default (development only)');
        return 'ai-qa-secret-dev-only';
    })(),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));

// Initialize Passport authentication middleware.
app.use(passport.initialize());
// Enable persistent login sessions in Passport.
app.use(passport.session());

// Passport user serialization: determines what user data should be stored in the session cookie.
passport.serializeUser((user: any, done) => done(null, user));
// Passport user deserialization: restores the user object from the session on subsequent requests.
passport.deserializeUser((obj: any, done) => done(null, obj));

// Configure Passport with the GitHub OAuth 2.0 Strategy.
// WHAT: Provides client credentials, callback URL, and requested OAuth scopes.
// WHY: Grants access to the user's email and repositories upon successful authorization.
// HOW: Attaches the access token to the profile object for GitHub API calls.
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackURL: `${process.env.BACKEND_URL}/auth/github/callback`,
    scope: ['user:email', 'repo']
}, (accessToken: string, refreshToken: string, profile: any, done: any) => {
    profile.accessToken = accessToken;
    return done(null, profile);
}));

// ----------------------------------------------------------------------------
// CORS & BODY PARSER MIDDLEWARE
// ----------------------------------------------------------------------------

// List of allowed origins permitted to connect to this API.
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'https://ai-quality-assurance-engineer.vercel.app'
].filter(Boolean) as string[];

// Configure CORS middleware with origin whitelist and credential support.
// WHAT: Checks incoming `Origin` header against allowed URLs, vercel subdomains, or localhost.
// WHY: Prevents unauthorized websites from sending cross-site requests while permitting our frontend.
// HOW: Passes `credentials: true` to allow cookies across domains.
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
            allowedOrigins.indexOf(origin) !== -1 ||
            origin.endsWith('.vercel.app') ||
            origin.startsWith('http://localhost:')
        ) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Parse incoming requests with JSON payloads.
// WHAT: Reads raw HTTP request bodies and parses JSON into `req.body`.
// WHY: Required for POST endpoints like `/api/analyze` and `/api/analyze-snippet`.
// HOW: Built-in Express middleware.
app.use(express.json());

// ----------------------------------------------------------------------------
// GITHUB OAUTH ROUTES
// ----------------------------------------------------------------------------

// Endpoint: Initiates the GitHub OAuth login flow.
// WHAT: Redirects the user's browser to GitHub to request permission.
// WHY: First step in authenticating users with their GitHub account.
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email', 'repo'] }));

// Endpoint: GitHub OAuth callback route.
// WHAT: GitHub redirects back to this URL with an authorization code after user approves login.
// WHY: Exchanges the code for an access token and redirects the user back to the frontend.
app.get('/auth/github/callback', 
    passport.authenticate('github', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed` }),
    (req, res) => {
        res.redirect(`${process.env.FRONTEND_URL}?auth=success`);
    }
);

// Endpoint: Logs out the current user session.
// WHAT: Clears the session cookie and redirects to the frontend homepage.
app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect(`${process.env.FRONTEND_URL}`);
    });
});

// Endpoint: Returns current authenticated user information.
// WHAT: Returns user profile JSON if authenticated, or 401 Unauthorized if not.
// WHY: Used by frontend to display user name and avatar.
app.get('/api/user', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    res.json(req.user);
});

// Endpoint: Fetches list of repositories belonging to the authenticated user.
// WHAT: Calls GitHub's REST API using the user's OAuth access token.
// WHY: Allows the user to select one of their repositories directly from a dropdown in the UI.
app.get('/api/user/repos', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    
    const user = req.user as any;
    try {
        const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
            headers: {
                'Authorization': `token ${user.accessToken}`,
                'User-Agent': 'AI-QA-Engineer-App'
            }
        });
        
        if (!response.ok) {
            const errBody = await response.text();
            console.error(`GitHub API Error: ${errBody}`);
            throw new Error('Failed to fetch repos from GitHub');
        }
        const repos = await response.json();
        res.json(repos);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------------------------------
// CORE SERVICES IMPORTS
// ----------------------------------------------------------------------------
import { analyzeRepository } from './services/repoAnalyzer';
import { generateTests, analyzeErrorSnippet } from './services/testGenerator';
import { runPlaywrightTest, prepareEnvironment } from './services/testRunner';
import { initDb, createAnalysis, updateAnalysis, getAnalyses, deleteAnalysis } from './services/database';
import { fixFailedTest } from './services/agenticFixer';

// ----------------------------------------------------------------------------
// IN-MEMORY ACTIVE JOBS & SERVER-SENT EVENTS (SSE) REGISTRIES
// ----------------------------------------------------------------------------

// Interface representing an active, in-flight analysis job.
// WHAT: Tracks the AbortController and spawned child dev server process for a running job.
// WHY: Allows instant cancellation when the user clicks "Cancel Execution" in the UI.
interface ActiveJob {
    abortController?: AbortController;
    serverProcess?: any;
}

// Map of analysis ID to active job metadata.
const activeJobs = new Map<string, ActiveJob>();

// Map of analysis ID to array of open HTTP SSE client response connections.
// WHAT: Stores open HTTP response streams for active browser clients.
// WHY: Enables real-time, one-way event streaming from server to client without polling.
const sseClients = new Map<string, Response[]>();

// Broadcasts real-time events to all SSE listeners connected to an analysis session.
// WHAT: Formats status, percentage, and details as an SSE `data:` line and writes to open responses.
// WHY: Powers the real-time progress bar (0% -> 100%) in the frontend.
// HOW: Also asynchronously updates the status field in the local database.
function broadcastProgress(analysisId: string, stage: string, percent: number, details?: string) {
    const clients = sseClients.get(analysisId);
    if (clients) {
        clients.forEach(res => {
            res.write(`data: ${JSON.stringify({ status: stage, percent, details })}\n\n`);
        });
    }
    // Update db in the background to persist status
    updateAnalysis(analysisId, { status: stage as any }).catch(() => {});
}

// ----------------------------------------------------------------------------
// PUBLIC & HEALTH CHECK ROUTES
// ----------------------------------------------------------------------------

// Root health check / welcome route.
// WHAT: Simple HTML landing page confirming the backend server is online.
app.get('/', (req, res) => {
    res.send(
        '<h1>AI QA Engineer API is Running</h1>' +
        '<p>The dashboard is usually at <a href="https://ai-quality-assurance-engineer-b8zy0fibe-kk-87aaab38.vercel.app">Open Dashboard</a></p>'
    );
});

// Endpoint: Retrieves all previous analyses filtered by clientId.
// WHAT: Reads records from `backend/ai-qa.json` for the given client identifier.
// WHY: Populates the "Audit History" sidebar in the frontend.
app.get('/api/analyses', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { clientId } = req.query;
        const history = await getAnalyses(clientId as string);
        res.json(history);
    } catch (error) {
        next(error);
    }
});

// Endpoint: Server-Sent Events (SSE) streaming connection route.
// WHAT: Keeps an HTTP connection open with `text/event-stream` headers.
// WHY: Delivers real-time progress notifications to the frontend without polling loops.
// HOW: Removes client from `sseClients` map when connection is closed.
app.get('/api/analyses/:id/stream', (req: Request, res: Response) => {
    const id = req.params.id as string;
    
    // Set headers required for Server-Sent Events.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Register this response connection in the SSE registry.
    if (!sseClients.has(id)) {
        sseClients.set(id, []);
    }
    sseClients.get(id)!.push(res);

    // Clean up registry when client disconnects.
    req.on('close', () => {
        const clients = sseClients.get(id);
        if (clients) {
            sseClients.set(id, clients.filter(c => c !== res));
            if (sseClients.get(id)!.length === 0) {
                sseClients.delete(id);
            }
        }
    });
});

// Endpoint: Cancels an active analysis job.
// WHAT: Aborts the asynchronous pipeline, kills spawned child dev server processes, and marks job as FAILED.
// WHY: Allows users to immediately stop a long-running or misconfigured analysis run.
app.post('/api/analyses/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params.id as string;
    console.log(`🛑 User requested cancellation for job ${id}`);
    
    try {
        const job = activeJobs.get(id);
        if (job) {
            // Signal cancellation via AbortController.
            if (job.abortController) {
                job.abortController.abort();
            }
            // Forcibly terminate the spawned application process if active.
            if (job.serverProcess) {
                const pid = job.serverProcess.pid;
                if (pid) {
                    if (process.platform === 'win32') {
                        exec(`taskkill /pid ${pid} /t /f`);
                    } else {
                        exec(`kill -9 ${pid}`);
                    }
                }
            }
            activeJobs.delete(id);
        }

        // Update database record to FAILED status.
        await updateAnalysis(id, {
            status: 'FAILED',
            playwright_output: 'Analysis was cancelled by the user.'
        });

        // Broadcast failure progress to UI over SSE stream.
        broadcastProgress(id, 'FAILED', 100, 'Analysis was cancelled by the user.');

        res.json({ message: 'Analysis cancelled successfully', id });
    } catch (error) {
        next(error);
    }
});

// ----------------------------------------------------------------------------
// CORE ANALYSIS ROUTE (GITHUB REPOSITORY PIPELINE)
// ----------------------------------------------------------------------------

// Endpoint: Initiates a new GitHub repository analysis and test generation pipeline.
// WHAT: Creates a new database record, returns an analysisId immediately, and starts background execution.
// WHY: Asynchronous pattern provides instantaneous UI feedback while heavy AI and cloning work runs in background.
// HOW: Uses SSE to stream progress stages (STARTED -> GENERATING_TESTS -> TESTS_GENERATED -> RUNNING_TESTS -> COMPLETED).
app.post('/api/analyze', async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl, clientId, framework = 'playwright', githubToken, focusArea = '' } = req.body;
    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }
    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required' });
    }

    try {
        // 1. Initialize Record in DB
        const analysisId = await createAnalysis(repoUrl, clientId);

        // Send immediate response so frontend is instant
        res.json({ 
            message: 'Analysis initiated', 
            analysisId, 
            status: 'STARTED' 
        });

        // 2. Start Asynchronous Local Pipeline Run
        const abortController = new AbortController();
        activeJobs.set(analysisId, { abortController });

        // Non-blocking background worker self-executing function.
        (async () => {
            const onProgress = (stage: string, percent: number) => {
                broadcastProgress(analysisId, stage, percent);
            };

            try {
                const startTime = Date.now();
                onProgress('STARTED', 5);

                // Stage 1: Fetch Repository & Filter Files
                const { files, cloneFolder, isHeadless, skillProfile } = await analyzeRepository(
                    repoUrl,
                    analysisId,
                    githubToken,
                    onProgress
                );

                if (abortController.signal.aborted) {
                    throw new Error("Analysis aborted by user");
                }

                // Stage 2: Run AI Analysis with Gemini 2.5 Flash
                onProgress('GENERATING_TESTS', 65);
                const aiResult = await generateTests(repoUrl, files, cloneFolder, isHeadless, framework, focusArea, skillProfile);
                const { fileName, code, cicdCode, fullReport, frameworkSignature } = aiResult;

                if (abortController.signal.aborted) {
                    throw new Error("Analysis aborted by user");
                }

                // Stage 3: Store AI generated report details & Mark COMPLETE
                onProgress('TESTS_GENERATED', 85);
                // Persist allSkills alongside the human-readable framework signature
                const skillsTag = skillProfile?.allSkills?.length
                    ? `${frameworkSignature} | ${skillProfile.allSkills.slice(0, 8).join(', ')}`
                    : frameworkSignature;
                await updateAnalysis(analysisId, {
                    test_file: fileName,
                    test_code: code,
                    cicd_code: cicdCode,
                    playwright_output: fullReport,
                    framework_signature: skillsTag,
                    total_duration: (Date.now() - startTime) / 1000,
                    status: 'COMPLETED'
                });

                onProgress('COMPLETED', 100);
                activeJobs.delete(analysisId);

                // --- Background Playwright Verification (Path A - Optional & Asynchronous) ---
                (async () => {
                    let serverProcess: any = null;
                    try {
                        const envResult = await prepareEnvironment(cloneFolder, isHeadless);
                        serverProcess = envResult.serverProcess;

                        // Keep track of subprocess for cancel triggers
                        const job = activeJobs.get(analysisId);
                        if (job) {
                            job.serverProcess = serverProcess;
                        }

                        const { executionLog, error: envError } = envResult;
                        if (envError) throw new Error(envError);

                        if (framework === 'playwright') {
                            let testResult = await runPlaywrightTest(fileName, executionLog);
                            
                            // Check for failures to trigger the agentic loop
                            const hasFailures = testResult.suites?.some((s: any) => 
                                s.specs?.some((sp: any) => sp.tests?.some((t: any) => 
                                    t.results?.some((r: any) => r.status !== 'passed')
                                ))
                            );

                            // Trigger autonomous self-healing if failures were found
                            if (hasFailures || testResult.error) {
                                console.log(`Verification failed for ${analysisId}. Retrying with Agentic Fixer...`);
                                const errorSummary = testResult.error || "Execution checks failed.";
                                const fixedCode = await fixFailedTest(repoUrl, code, errorSummary + "\n" + executionLog, framework);
                                
                                const fixedFileName = `fixed-${Date.now()}.spec.ts`;
                                const fixedFilePath = path.join(__dirname, 'tests-generated', fixedFileName);
                                
                                await fsPromises.writeFile(fixedFilePath, fixedCode, 'utf8');
                                testResult = await runPlaywrightTest(fixedFileName, executionLog);

                                await updateAnalysis(analysisId, {
                                    test_code: fixedCode,
                                    test_file: fixedFileName
                                });
                            }

                            // Append Execution Results to output
                            const finalOutput = `${fullReport}\n\n### 🖥️ 5. Execution Results\n\`\`\`json\n${JSON.stringify(testResult, null, 2)}\n\`\`\``;
                            await updateAnalysis(analysisId, { playwright_output: finalOutput });
                        }
                    } catch (e: any) {
                        console.warn(`[Background Verification Error] for ${analysisId}: ${e.message}`);
                    } finally {
                        // Ensure background server is terminated cleanly
                        if (serverProcess) {
                            const pid = serverProcess.pid;
                            if (pid) {
                                if (process.platform === 'win32') {
                                    try { exec(`taskkill /pid ${pid} /t /f`); } catch (e) {}
                                } else {
                                    try { exec(`kill -9 ${pid}`); } catch (e) {}
                                }
                            }
                        }
                    }
                })();

            } catch (err: any) {
                console.error(`❌ Local Worker Failed for ${analysisId}:`, err);
                await updateAnalysis(analysisId, {
                    status: 'FAILED',
                    playwright_output: `Analysis Failed: ${err.message}`
                });
                broadcastProgress(analysisId, 'FAILED', 100, err.message);
                activeJobs.delete(analysisId);
            }
        })();

    } catch (err) {
        next(err);
    }
});

// ----------------------------------------------------------------------------
// CODE SNIPPET DIAGNOSTIC ROUTE
// ----------------------------------------------------------------------------

// Endpoint: Analyzes an uploaded or pasted code snippet for bugs.
// WHAT: Creates a record under 'Code Snippet Debugging' and calls `analyzeErrorSnippet(code)`.
// WHY: Enables fast file-level debugging for single Java, Python, or JavaScript files.
// HOW: Streams progress to the UI and saves the AI explanation to `playwright_output`.
app.post('/api/analyze-snippet', async (req: Request, res: Response, next: NextFunction) => {
    const { code, clientId, fileName } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'code snippet is required' });
    }
    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required for session isolation' });
    }

    try {
        const analysisId = await createAnalysis('Code Snippet Debugging', clientId);
        if (fileName) {
            await updateAnalysis(analysisId, { test_file: fileName });
        }
        res.json({ message: 'Analysis started', analysisId, status: 'ANALYSING' });

        // Run snippet analysis in non-blocking background closure.
        (async () => {
            try {
                broadcastProgress(analysisId, 'ANALYSING', 30, 'Analyzing snippet...');
                const aiExplanation = await analyzeErrorSnippet(code);

                await updateAnalysis(analysisId, {
                    test_code: code,
                    playwright_output: aiExplanation
                });
                broadcastProgress(analysisId, 'COMPLETED', 100, 'Analysis completed.');
            } catch (asyncError: any) {
                console.error(`Async Error during snippet analysis ${analysisId}:`, asyncError);
                await updateAnalysis(analysisId, {
                    playwright_output: asyncError.message
                });
                broadcastProgress(analysisId, 'FAILED', 100, asyncError.message);
            }
        })();

    } catch (err) {
        next(err);
    }
});

// ----------------------------------------------------------------------------
// RECORD MANAGEMENT & GLOBAL ERROR HANDLER
// ----------------------------------------------------------------------------

// Endpoint: Deletes an analysis record from the database.
// WHAT: Removes the record with the given ID from `ai-qa.json`.
app.delete('/api/analyses/:id', async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    try {
        await deleteAnalysis(id as string);
        res.json({ message: 'Analysis deleted successfully', id });
    } catch (error: any) {
        if (error.message === "Analysis record not found.") {
            return res.status(404).json({ error: error.message });
        }
        next(error);
    }
});

// Global Express Error Handling Middleware.
// WHAT: Catches any unhandled error thrown in route handlers and formats a standard JSON 500 response.
// WHY: Prevents uncaught HTTP errors from hanging requests or leaking internal stack traces in production.
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled Backend Error:", err);
    res.status(500).json({
        error: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ----------------------------------------------------------------------------
// SERVER STARTUP & DATABASE INITIALIZATION
// ----------------------------------------------------------------------------

// Start Express server and initialize database.
// WHAT: Listens on the configured PORT and initializes the JSON database file (`ai-qa.json`).
// WHY: Final step making the backend ready to accept incoming HTTP and SSE connections.
app.listen(PORT, async () => {
    try {
        await initDb();
        console.log(`AI QA Engineer Backend running on http://localhost:${PORT}`);
    } catch (error) {
        console.error("Failed to start backend server:", error);
        process.exit(1);
    }
});
