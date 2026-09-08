// ============================================================================
// SERVICE: WORKER ENTRY POINT (STANDALONE CI/CD & BACKGROUND RUNNER)
// This script acts as an autonomous CLI entry-point for background workers.
// It is specifically designed to run inside GitHub Actions workflows
// (defined in `.github/workflows/ai-worker.yml`) or containerized workers.
// It executes the complete QA lifecycle:
// 1. Clones/fetches the target repository.
// 2. Analyzes architecture and prompts Gemini for tests & CI/CD workflows.
// 3. Prepares the environment and executes Playwright tests.
// 4. Triggers the Agentic Fixer loop if tests fail.
// 5. Updates the database and exits cleanly.
// ============================================================================

// Import dotenv to load environment variables from the `.env` file into process.env.
import dotenv from 'dotenv';
// Execute dotenv configuration immediately before reading any environment variables.
dotenv.config();

// Import repository analysis service to clone and scan files.
import { analyzeRepository } from './repoAnalyzer';
// Import test generation service to prompt Gemini AI.
import { generateTests } from './testGenerator';
// Import environment bootstrapper and Playwright runner.
import { prepareEnvironment, runPlaywrightTest } from './testRunner';
// Import database methods to record progress and persist results.
import { updateAnalysis, getAnalysisById } from './database';
// Import self-healing agentic fixer to repair broken tests.
import { fixFailedTest } from './agenticFixer';
// Import path utility for file resolution.
import path from 'path';
// Import file system module for directory creation and file writing.
import fs from 'fs';

// ----------------------------------------------------------------------------
// WORKER EXECUTION PIPELINE
// ----------------------------------------------------------------------------

/**
 * Main worker pipeline execution function.
 * WHAT: Reads input parameters from environment variables, coordinates repository cloning,
 *       AI test generation, local server bootstrapping, Playwright test execution,
 *       and self-healing test repair.
 * WHY: Enables headless, asynchronous execution in background jobs or CI/CD runners without blocking HTTP servers.
 * HOW: Triggered automatically by calling `runWorker()` at the bottom of the script.
 */
async function runWorker() {
  // Read target analysis ID passed by the caller or CI runner.
  const analysisId = process.env.ANALYSIS_ID;
  // Read target GitHub repository URL.
  const repoUrl = process.env.REPO_URL;
  // Read requested testing framework (defaults to Playwright).
  const framework = process.env.FRAMEWORK || 'playwright';
  // Read optional strategic focus area (e.g. 'Authentication').
  const focusArea = process.env.FOCUS_AREA || '';
  // Read optional GitHub personal access token for private repositories.
  const githubToken = process.env.TARGET_GITHUB_TOKEN || '';

  // Validate that required job parameters are provided.
  if (!analysisId || !repoUrl) {
    console.error("Missing ANALYSIS_ID or REPO_URL");
    process.exit(1);
  }

  console.log(`🚀 Starting Worker for Analysis: ${analysisId}`);
  console.log(`📂 Target Repo: ${repoUrl}`);

  try {
    // Record starting timestamp to calculate total execution duration.
    const startTime = Date.now();

    // ------------------------------------------------------------------------
    // STEP 1: FETCH REPO METADATA & CLONE
    // ------------------------------------------------------------------------
    // Clone repo, filter meaningful source files, and detect tech stack skills.
    const { files, cloneFolder, isHeadless, skillProfile } = await analyzeRepository(repoUrl, analysisId, githubToken);

    // ------------------------------------------------------------------------
    // STEP 2: RUN AI DIAGNOSTIC ANALYSIS & TEST GENERATION
    // ------------------------------------------------------------------------
    // Send codebase context, detected skills, and prompts to Gemini 2.5 Flash.
    const aiResult = await generateTests(repoUrl, files, cloneFolder, isHeadless, framework, focusArea, skillProfile);
    const { fileName, code, cicdCode, fullReport, frameworkSignature } = aiResult;

    // ------------------------------------------------------------------------
    // STEP 3: STORE INTERMEDIATE RESULTS IN DATABASE
    // ------------------------------------------------------------------------
    // Save generated test code, CI/CD pipeline, and AI report with 'TESTS_GENERATED' status.
    await updateAnalysis(analysisId, {
      status: 'TESTS_GENERATED',
      test_file: fileName,
      test_code: code,
      cicd_code: cicdCode,
      playwright_output: fullReport,
      framework_signature: frameworkSignature,
      total_duration: (Date.now() - startTime) / 1000
    });

    // ------------------------------------------------------------------------
    // STEP 4: PREPARE ENVIRONMENT & RUN TESTS
    // ------------------------------------------------------------------------
    let serverProcess;
    try {
      // Boot dev server or static server on port 3030.
      const envResult = await prepareEnvironment(cloneFolder, isHeadless);
      serverProcess = envResult.serverProcess;
      const { executionLog, error: envError } = envResult;

      // Fail worker if environment could not be booted.
      if (envError) {
        throw new Error(`Environment setup failed: ${envError}`);
      }

      // If Playwright framework is selected, execute the test suite.
      if (framework === 'playwright') {
        // Update database to reflect active test execution.
        await updateAnalysis(analysisId, { status: 'RUNNING_TESTS' });
        // Execute Playwright test suite and capture JSON output.
        let testResult = await runPlaywrightTest(fileName, executionLog);

        // --------------------------------------------------------------------
        // AGENTIC LOOP: AUTONOMOUS SELF-HEALING IF TESTS FAIL
        // --------------------------------------------------------------------
        // Inspect test suites to detect any failed assertions or timeouts.
        const hasFailures = testResult.suites?.some((s: any) => s.specs?.some((sp: any) => sp.tests?.some((t: any) => t.results?.some((r: any) => r.status !== 'passed'))));
        
        // If failures detected, engage the Agentic Fixer loop.
        if (hasFailures || testResult.error) {
          console.log(`Test failed. Triggering Agentic Fixer...`);
          // Temporarily set status to ANALYSING while the AI fixes the code.
          await updateAnalysis(analysisId, { status: 'ANALYSING' });
          
          // Summarize the error from test results.
          const errorSummary = testResult.error || "Test execution failed. See logs for details.";
          // Send broken code and terminal error log to Gemini for autonomous repair.
          const fixedCode = await fixFailedTest(repoUrl, code, errorSummary + "\n" + executionLog, framework);
          
          // Generate a new timestamped file name for the repaired test.
          const fixedFileName = `fixed-${Date.now()}.spec.ts`;
          const fixedFilePath = path.join(__dirname, '..', 'tests-generated', fixedFileName);
          // Ensure directory exists and save the repaired code.
          if (!fs.existsSync(path.dirname(fixedFilePath))) fs.mkdirSync(path.dirname(fixedFilePath), { recursive: true });
          fs.writeFileSync(fixedFilePath, fixedCode, 'utf8');
          
          // Update database with fixed test file and re-run test.
          await updateAnalysis(analysisId, { status: 'RUNNING_TESTS', test_code: fixedCode, test_file: fixedFileName });
          testResult = await runPlaywrightTest(fixedFileName, executionLog);
        }

        // Store Final Results with COMPLETED status.
        await updateAnalysis(analysisId, {
          status: 'COMPLETED',
          playwright_output: fullReport,
          total_duration: (Date.now() - startTime) / 1000
        });
      } else {
        // For non-Playwright frameworks (Jest/Cypress), mark complete with notice.
        await updateAnalysis(analysisId, {
          status: 'COMPLETED',
          playwright_output: fullReport + "\n\n> **Notice**: Native test execution is optimized for Playwright.",
          total_duration: (Date.now() - startTime) / 1000
        });
      }
    } finally {
      // Clean up the server process in the worker environment.
      if (serverProcess) {
        if (process.platform === 'win32' && serverProcess.pid) {
          require('child_process').exec(`taskkill /pid ${serverProcess.pid} /t /f`);
        } else {
          serverProcess.kill('SIGINT');
        }
      }
    }

    console.log(`✅ Worker Task Completed for ${analysisId}`);
    // Exit process with success status code (0).
    process.exit(0);

  } catch (err: any) {
    console.error(`❌ Worker Failed for ${analysisId}:`, err);
    // Record FAILED status and error message in the database.
    await updateAnalysis(analysisId, {
      status: 'FAILED',
      playwright_output: `Worker Error: ${err.message}`
    });
    // Exit process with failure status code (1).
    process.exit(1);
  }
}

// ----------------------------------------------------------------------------
// SCRIPT INVOCATION
// ----------------------------------------------------------------------------
// Execute the worker pipeline when the script is invoked.
runWorker();
