import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from 'express-session';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { exec } from 'child_process';
import path from 'path';
import fsPromises from 'fs/promises';

dotenv.config();

// --- Global unhandled rejection/exception safety nets ---
process.on('unhandledRejection', (reason: any) => {
    console.error('❌ Unhandled Promise Rejection:', reason?.message || reason);
    // Don't crash the server for unhandled rejections in background tasks
});
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    // Log but don't crash – express will keep serving
});

// --- STARTUP GUARD: Ensure all environment variables are present ---
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
// ------------------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Passport & Session
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

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user: any, done) => done(null, user));
passport.deserializeUser((obj: any, done) => done(null, obj));

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackURL: `${process.env.BACKEND_URL}/auth/github/callback`,
    scope: ['user:email', 'repo']
}, (accessToken: string, refreshToken: string, profile: any, done: any) => {
    profile.accessToken = accessToken;
    return done(null, profile);
}));

const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'https://ai-quality-assurance-engineer.vercel.app'
].filter(Boolean) as string[];

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

app.use(express.json());

// Auth Routes
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email', 'repo'] }));

app.get('/auth/github/callback', 
    passport.authenticate('github', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed` }),
    (req, res) => {
        res.redirect(`${process.env.FRONTEND_URL}?auth=success`);
    }
);

app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect(`${process.env.FRONTEND_URL}`);
    });
});

app.get('/api/user', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    res.json(req.user);
});

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

import { analyzeRepository } from './services/repoAnalyzer';
import { generateTests, analyzeErrorSnippet } from './services/testGenerator';
import { runPlaywrightTest, prepareEnvironment } from './services/testRunner';
import { initDb, createAnalysis, updateAnalysis, getAnalyses, deleteAnalysis } from './services/database';
import { fixFailedTest } from './services/agenticFixer';

// --- IN-MEMORY ACTIVE JOBS & SSE STREAM REGISTRIES ---
interface ActiveJob {
    abortController?: AbortController;
    serverProcess?: any;
}
const activeJobs = new Map<string, ActiveJob>();
const sseClients = new Map<string, Response[]>();

// Broadcasts real-time events to all SSE listeners
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

// Root health check / welcome route
app.get('/', (req, res) => {
    res.send(
        '<h1>AI QA Engineer API is Running</h1>' +
        '<p>The dashboard is usually at <a href="https://ai-quality-assurance-engineer-b8zy0fibe-kk-87aaab38.vercel.app">Open Dashboard</a></p>'
    );
});

// Get all previous analyses (filtered by clientId)
app.get('/api/analyses', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { clientId } = req.query;
        const history = await getAnalyses(clientId as string);
        res.json(history);
    } catch (error) {
        next(error);
    }
});

// SSE Streaming Connection Endpoint
app.get('/api/analyses/:id/stream', (req: Request, res: Response) => {
    const id = req.params.id as string;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!sseClients.has(id)) {
        sseClients.set(id, []);
    }
    sseClients.get(id)!.push(res);

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

// Cancel Analysis Endpoint
app.post('/api/analyses/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params.id as string;
    console.log(`🛑 User requested cancellation for job ${id}`);
    
    try {
        const job = activeJobs.get(id);
        if (job) {
            if (job.abortController) {
                job.abortController.abort();
            }
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

        await updateAnalysis(id, {
            status: 'FAILED',
            playwright_output: 'Analysis was cancelled by the user.'
        });

        broadcastProgress(id, 'FAILED', 100, 'Analysis was cancelled by the user.');

        res.json({ message: 'Analysis cancelled successfully', id });
    } catch (error) {
        next(error);
    }
});

// Run a new repository analysis and test generation (Asynchronous Local Execution)
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

        // Non-blocking background worker
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

                // Stage 2: Run AI Analysis
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

        (async () => {
            try {
                const aiExplanation = await analyzeErrorSnippet(code);

                await updateAnalysis(analysisId, {
                    status: 'COMPLETED',
                    test_code: code,
                    playwright_output: aiExplanation
                });
            } catch (asyncError: any) {
                console.error(`Async Error during snippet analysis ${analysisId}:`, asyncError);
                await updateAnalysis(analysisId, {
                    status: 'FAILED',
                    playwright_output: asyncError.message
                });
            }
        })();

    } catch (err) {
        next(err);
    }
});

// Delete an analysis
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

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled Backend Error:", err);
    res.status(500).json({
        error: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Start Server & Initialize DB
app.listen(PORT, async () => {
    try {
        await initDb();
        console.log(`AI QA Engineer Backend running on http://localhost:${PORT}`);
    } catch (error) {
        console.error("Failed to start backend server:", error);
        process.exit(1);
    }
});
