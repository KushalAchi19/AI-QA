import dotenv from 'dotenv';
dotenv.config();

import { analyzeRepository } from './repoAnalyzer';
import { generateTests } from './testGenerator';
import { prepareEnvironment, runPlaywrightTest } from './testRunner';
import { updateAnalysis, getAnalysisById } from './database';
import { fixFailedTest } from './agenticFixer';
import path from 'path';
import fs from 'fs';

async function runWorker() {
  const analysisId = process.env.ANALYSIS_ID;
  const repoUrl = process.env.REPO_URL;
  const framework = process.env.FRAMEWORK || 'playwright';
  const focusArea = process.env.FOCUS_AREA || '';
  const githubToken = process.env.TARGET_GITHUB_TOKEN || '';

  if (!analysisId || !repoUrl) {
    console.error("Missing ANALYSIS_ID or REPO_URL");
    process.exit(1);
  }

  console.log(`🚀 Starting Worker for Analysis: ${analysisId}`);
  console.log(`📂 Target Repo: ${repoUrl}`);

  try {
    const startTime = Date.now();

    // 1. Fetch repo metadata and clone
    const { files, cloneFolder, isHeadless } = await analyzeRepository(repoUrl, analysisId, githubToken);

    // 2. Run Diagnostic Analysis (AI Part)
    const aiResult = await generateTests(repoUrl, files, cloneFolder, isHeadless, framework, focusArea);
    const { fileName, code, cicdCode, fullReport, frameworkSignature } = aiResult;

    // 3. Store Intermediate Results
    await updateAnalysis(analysisId, {
      status: 'TESTS_GENERATED',
      test_file: fileName,
      test_code: code,
      cicd_code: cicdCode,
      playwright_output: fullReport,
      framework_signature: frameworkSignature,
      total_duration: (Date.now() - startTime) / 1000
    });

    // 4. Run Environment Prep & Tests
    let serverProcess;
    try {
      const envResult = await prepareEnvironment(cloneFolder, isHeadless);
      serverProcess = envResult.serverProcess;
      const { executionLog, error: envError } = envResult;

      if (envError) {
        throw new Error(`Environment setup failed: ${envError}`);
      }

      if (framework === 'playwright') {
        await updateAnalysis(analysisId, { status: 'RUNNING_TESTS' });
        let testResult = await runPlaywrightTest(fileName, executionLog);

        // --- AGENTIC LOOP: AUTO-RETRY IF FAILED ---
        const hasFailures = testResult.suites?.some((s: any) => s.specs?.some((sp: any) => sp.tests?.some((t: any) => t.results?.some((r: any) => r.status !== 'passed'))));
        
        if (hasFailures || testResult.error) {
          console.log(`Test failed. Triggering Agentic Fixer...`);
          await updateAnalysis(analysisId, { status: 'ANALYSING' });
          
          const errorSummary = testResult.error || "Test execution failed. See logs for details.";
          const fixedCode = await fixFailedTest(repoUrl, code, errorSummary + "\n" + executionLog, framework);
          
          const fixedFileName = `fixed-${Date.now()}.spec.ts`;
          const fixedFilePath = path.join(__dirname, '..', 'tests-generated', fixedFileName);
          if (!fs.existsSync(path.dirname(fixedFilePath))) fs.mkdirSync(path.dirname(fixedFilePath), { recursive: true });
          fs.writeFileSync(fixedFilePath, fixedCode, 'utf8');
          
          await updateAnalysis(analysisId, { status: 'RUNNING_TESTS', test_code: fixedCode, test_file: fixedFileName });
          testResult = await runPlaywrightTest(fixedFileName, executionLog);
        }

        // Store Final Results
        await updateAnalysis(analysisId, {
          status: 'COMPLETED',
          playwright_output: fullReport,
          total_duration: (Date.now() - startTime) / 1000
        });
      } else {
        await updateAnalysis(analysisId, {
          status: 'COMPLETED',
          playwright_output: fullReport + "\n\n> **Notice**: Native test execution is optimized for Playwright.",
          total_duration: (Date.now() - startTime) / 1000
        });
      }
    } finally {
      if (serverProcess) {
        // Kill the server process in the worker environment
        if (process.platform === 'win32' && serverProcess.pid) {
          require('child_process').exec(`taskkill /pid ${serverProcess.pid} /t /f`);
        } else {
          serverProcess.kill('SIGINT');
        }
      }
    }

    console.log(`✅ Worker Task Completed for ${analysisId}`);
    process.exit(0);

  } catch (err: any) {
    console.error(`❌ Worker Failed for ${analysisId}:`, err);
    await updateAnalysis(analysisId, {
      status: 'FAILED',
      playwright_output: `Worker Error: ${err.message}`
    });
    process.exit(1);
  }
}

runWorker();
