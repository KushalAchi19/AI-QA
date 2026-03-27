import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { analyzeRepository } from './services/repoAnalyzer';
import { generateTests, analyzeErrorSnippet } from './services/testGenerator';
import { runGeneratedTest } from './services/testRunner';
import { initDb, createAnalysis, updateAnalysis, getAnalyses } from './services/database';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Get all previous analyses
app.get('/api/analyses', async (req, res) => {
    try {
        const history = await getAnalyses();
        res.json(history);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Run a new repository analysis and test generation
app.post('/api/analyze', async (req, res) => {
  const { repoUrl, taskType } = req.body;
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required' });
  }

  try {
    // 1. Initialize Record
    const analysisId = await createAnalysis(repoUrl);
    
    // Send immediate response so frontend doesn't hang
    res.json({ message: 'Analysis started', analysisId, status: 'GENERATING_TESTS' });

    // Continue processing asynchronously
    try {
        // 2. Fetch repo metadata
        const files = await analyzeRepository(repoUrl);
        
        // 3. Generate Playwright Test with Gemini
        const { fileName, code } = await generateTests(repoUrl, files);
        
        await updateAnalysis(analysisId!, { 
            status: 'TESTS_GENERATED', 
            test_file: fileName, 
            test_code: code 
        });

        // 4. Run the generated test natively
        await updateAnalysis(analysisId!, { status: 'RUNNING_TESTS' });
        const testResult = await runGeneratedTest(fileName);
        
        // 5. Store Final Results
        await updateAnalysis(analysisId!, { 
            status: 'COMPLETED',
            playwright_output: JSON.stringify(testResult)
        });

    } catch (asyncError: any) {
        console.error("Async Error during processing:", asyncError);
        await updateAnalysis(analysisId!, { 
            status: 'FAILED',
            playwright_output: asyncError.message
        });
    }

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/analyze-snippet', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'code snippet is required' });
  }

  try {
    const analysisId = await createAnalysis('Code Snippet Debugging');
    res.json({ message: 'Analysis started', analysisId, status: 'ANALYZING' });

    try {
        const aiExplanation = await analyzeErrorSnippet(code);
        
        await updateAnalysis(analysisId!, { 
            status: 'COMPLETED',
            test_code: code,
            playwright_output: aiExplanation
        });
    } catch (asyncError: any) {
        await updateAnalysis(analysisId!, { 
            status: 'FAILED',
            playwright_output: asyncError.message
        });
    }

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server & Initialize DB
app.listen(PORT, async () => {
  await initDb();
  console.log(`AI QA Engineer Backend running on http://localhost:${PORT}`);
});
