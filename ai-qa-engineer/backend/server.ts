import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { analyzeRepository } from './services/repoAnalyzer';
import { generateTests, analyzeErrorSnippet } from './services/testGenerator';
import { runGeneratedTest, prepareEnvironment, runPlaywrightTest } from './services/testRunner';
import { initDb, createAnalysis, updateAnalysis, getAnalyses, deleteAnalysis } from './services/database';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Root health check / welcome route
app.get('/', (req, res) => {
    res.send('<h1>AI QA Engineer API is Running</h1><p>The dashboard is usually at <a href="http://localhost:5173">http://localhost:5173</a></p>');
});

// Get all previous analyses
app.get('/api/analyses', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const history = await getAnalyses();
        res.json(history);
    } catch (error) {
        next(error);
    }
});

// Run a new repository analysis and test generation
app.post('/api/analyze', async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl } = req.body;
    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }

    try {
        // 1. Initialize Record
        const analysisId = await createAnalysis(repoUrl);
        
        // Send immediate response so frontend doesn't hang
        res.json({ message: 'Analysis started', analysisId, status: 'GENERATING_TESTS' });

        // Continue processing asynchronously
        (async () => {
            try {
                // 2. Fetch repo metadata and clone (Shallow)
                const { files, cloneFolder, isHeadless } = await analyzeRepository(repoUrl, analysisId);
                
                // 3. THE SPEED RACE: Generate AI tests AND Prepare the Environment at the same time!
                await updateAnalysis(analysisId, { status: 'GENERATING_TESTS' });
                
                const [aiResult, envResult] = await Promise.all([
                    generateTests(repoUrl, files, cloneFolder, isHeadless),
                    prepareEnvironment(cloneFolder, isHeadless)
                ]);

                const { fileName, code, fullReport } = aiResult;
                const { serverProcess, executionLog, error: envError } = envResult;

                if (envError) throw new Error(envError);

                await updateAnalysis(analysisId, { 
                    status: 'TESTS_GENERATED', 
                    test_file: fileName, 
                    test_code: code,
                    playwright_output: fullReport 
                });

                // 4. Run the generated test natively (against the already-booted server)
                await updateAnalysis(analysisId, { status: 'RUNNING_TESTS' });
                try {
                    const testResult = await runPlaywrightTest(fileName, executionLog);
                    
                    // 5. Store Final Results
                    const reportWithResults = `
${fullReport}

### 🖥️ 5. Execution Results
\`\`\`json
${JSON.stringify(testResult, null, 2)}
\`\`\`
`;
                    await updateAnalysis(analysisId, { 
                        status: 'COMPLETED',
                        playwright_output: reportWithResults 
                    });
                } finally {
                    // Cleanup server process
                    if (serverProcess) {
                        if (process.platform === 'win32' && serverProcess.pid) {
                            require('child_process').exec(`taskkill /pid ${serverProcess.pid} /t /f`);
                        } else {
                            serverProcess.kill('SIGINT');
                        }
                    }
                }

            } catch (asyncError: any) {
                console.error(`Async Error during analysis ${analysisId}:`, asyncError);
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

app.post('/api/analyze-snippet', async (req: Request, res: Response, next: NextFunction) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'code snippet is required' });
    }

    try {
        const analysisId = await createAnalysis('Code Snippet Debugging');
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
