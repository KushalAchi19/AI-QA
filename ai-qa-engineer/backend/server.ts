import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json());


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
    const { repoUrl, clientId, framework = 'playwright' } = req.body;
    if (!repoUrl) {
        return res.status(400).json({ error: 'repoUrl is required' });
    }
    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required' });
    }

    try {
        const startTime = Date.now();
        // 1. Initialize Record
        const analysisId = await createAnalysis(repoUrl, clientId);

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
                    generateTests(repoUrl, files, cloneFolder, isHeadless, framework),
                    prepareEnvironment(cloneFolder, isHeadless)
                ]);

                const { fileName, code, cicdCode, fullReport, frameworkSignature } = aiResult;
                const { serverProcess, executionLog, error: envError } = envResult;

                if (envError) throw new Error(envError);

                await updateAnalysis(analysisId, {
                    status: 'TESTS_GENERATED',
                    test_file: fileName,
                    test_code: code,
                    cicd_code: cicdCode,
                    playwright_output: fullReport,
                    framework_signature: frameworkSignature,
                    total_duration: (Date.now() - startTime) / 1000
                });

                // 4. Run the generated test natively (against the already-booted server)
                if (framework === 'playwright') {
                    await updateAnalysis(analysisId, { status: 'RUNNING_TESTS' });
                    try {
                        let testResult = await runPlaywrightTest(fileName, executionLog);

                        // --- AGENTIC LOOP: AUTO-RETRY IF FAILED ---
                        const hasFailures = testResult.suites?.some((s: any) => s.specs?.some((sp: any) => sp.tests?.some((t: any) => t.results?.some((r: any) => r.status !== 'passed'))));
                        
                        if (hasFailures || testResult.error) {
                            console.log(`Test failed for ${analysisId}. Triggering Agentic Fixer...`);
                            await updateAnalysis(analysisId, { status: 'ANALYSING' }); // Show fixing status
                            
                            const errorSummary = testResult.error || "Test execution failed. See logs for details.";
                            const fixedCode = await fixFailedTest(repoUrl, code, errorSummary + "\n" + executionLog, framework);
                            
                            // Save fixed code and retry
                            const fixedFileName = `fixed-${Date.now()}.spec.ts`;
                            const fixedFilePath = require('path').join(__dirname, 'tests-generated', fixedFileName);
                            require('fs').writeFileSync(fixedFilePath, fixedCode, 'utf8');
                            
                            await updateAnalysis(analysisId, { status: 'RUNNING_TESTS', test_code: fixedCode, test_file: fixedFileName });
                            testResult = await runPlaywrightTest(fixedFileName, executionLog);
                        }

                        // 5. Store Final Results
                        await updateAnalysis(analysisId, {
                            status: 'COMPLETED',
                            playwright_output: fullReport,
                            total_duration: (Date.now() - startTime) / 1000
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
                } else {
                    // For non-playwright frameworks, we just complete after generation
                    await updateAnalysis(analysisId, {
                        status: 'COMPLETED',
                        playwright_output: fullReport + "\n\n> **Notice**: Native test execution is currently optimized for Playwright. Your " + framework.charAt(0).toUpperCase() + framework.slice(1) + " suite has been generated above for manual review.",
                        total_duration: (Date.now() - startTime) / 1000
                    });
                    // Still cleanup server process if it was started
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

import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

import { generateAnalysisPDF } from './services/pdfService';

app.post('/api/export-pdf', async (req: Request, res: Response, next: NextFunction) => {
    const { html, id } = req.body;
    
    // NEW: If ID is provided, generate PDF from database record (supports any length)
    if (id) {
        try {
            const run = await getAnalysisById(id);
            if (!run) return res.status(404).json({ error: "Analysis record not found" });
            
            const pdfBuffer = await generateAnalysisPDF(run);
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="AI-Diagnostic-Report.pdf"',
                'Content-Length': pdfBuffer.length
            });
            return res.send(pdfBuffer);
        } catch (err: any) {
            console.error("Database-backed PDF generation failed:", err);
            return res.status(500).json({ 
                error: "Failed to generate PDF from database.",
                details: err.message 
            });
        }
    }

    if (!html) {
        return res.status(400).json({ error: 'HTML content or Analysis ID is required' });
    }

    let browser;
    try {
        console.log(`Starting PDF generation for HTML of length: ${html.length}`);
        const chromiumAny = chromium as any;
        
        // Launch browser with optimized settings for serverless
        browser = await puppeteer.launch({
            args: [...(chromiumAny.args || []), '--hide-scrollbars', '--disable-web-security', '--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: chromiumAny.defaultViewport,
            executablePath: await chromiumAny.executablePath(),
            headless: chromiumAny.headless === true ? true : 'new',
        } as any);

        const page = await browser.newPage();
        
        // Use 'domcontentloaded' for maximum speed in serverless environments
        await page.setContent(html, { 
            waitUntil: 'domcontentloaded',
            timeout: 20000 
        });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
            timeout: 20000
        });
        
        console.log("PDF generation successful.");
        await browser.close();
        browser = null;

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="AI-Diagnostic-Report.pdf"',
            'Content-Length': pdfBuffer.length
        });
        
        res.send(pdfBuffer);
    } catch (err: any) {
        console.error("Puppeteer PDF generation failed:", err);
        if (browser) await (browser as any).close();
        res.status(500).json({ 
            error: "Failed to generate PDF on server. This is often due to the report size exceeding serverless execution limits.",
            details: err.message 
        });
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
