import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from 'express-session';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';

dotenv.config();

// --- STARTUP GUARD: Ensure all environment variables are present ---
const REQUIRED_VARS = [
    'GEMINI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_KEY',
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
    secret: process.env.SESSION_SECRET || 'ai-qa-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // Set secure: true in production
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
        // allow requests with no origin (like mobile apps or curl requests)
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
import { runGeneratedTest, prepareEnvironment, runPlaywrightTest } from './services/testRunner';
import { initDb, createAnalysis, updateAnalysis, getAnalyses, deleteAnalysis, getAnalysisById } from './services/database';
import { fixFailedTest } from './services/agenticFixer';






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

// Run a new repository analysis and test generation
app.post('/api/analyze', async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl, clientId, framework = 'playwright', githubToken, focusArea = '' } = req.body;
    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }
    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required' });
    }

    try {
        // 1. Initialize Record in Supabase
        const analysisId = await createAnalysis(repoUrl, clientId);

        // 2. DISPATCH WORKER (GitHub Actions)
        // This offloads 100% of the compute cost to GitHub
        const GITHUB_TOKEN = process.env.GITHUB_WORKER_TOKEN;
        const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'KushalAchi19'; // Default from user info
        const REPO_NAME = process.env.GITHUB_REPO_NAME || 'ai-qa-engineer';

        if (GITHUB_TOKEN) {
            console.log(`📡 Dispatching Worker for ${analysisId}...`);
            const dispatchResponse = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/ai-worker.yml/dispatches`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'AI-QA-Engineer-API'
                },
                body: JSON.stringify({
                    ref: 'main',
                    inputs: {
                        analysisId,
                        repoUrl,
                        framework,
                        focusArea,
                        githubToken
                    }
                })
            });

            if (!dispatchResponse.ok) {
                const errText = await dispatchResponse.text();
                console.error(`❌ Worker Dispatch Failed: ${errText}`);
                // Fallback to local if dispatch fails? Or just fail?
                // For 50k users, we MUST use workers.
            } else {
                console.log(`✅ Worker Dispatched successfully for ${analysisId}`);
            }
        } else {
            console.warn("⚠️ GITHUB_WORKER_TOKEN missing. Analysis will be recorded but not processed.");
        }

        // Send immediate response so frontend is "Instant"
        res.json({ 
            message: 'Analysis dispatched to global worker pool', 
            analysisId, 
            status: 'STARTED' 
        });

    } catch (err) {
        next(err);
    }
});

app.post('/api/analyze-snippet', async (req: Request, res: Response, next: NextFunction) => {
    const { code, clientId } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'code snippet is required' });
    }
    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required for session isolation' });
    }

    try {
        const analysisId = await createAnalysis('Code Snippet Debugging', clientId);
        res.json({ message: 'Analysis started', analysisId, status: 'ANALYZING' });

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

// PDF Export endpoint moved to client-side for Zero-Cost efficiency
// Endpoint removed to save server resources (Puppeteer/Chromium)


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
