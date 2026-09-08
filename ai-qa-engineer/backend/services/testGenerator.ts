// ============================================================================
// SERVICE: TEST GENERATOR (GOOGLE GEMINI AI INTEGRATION)
// This service manages all communication with Google Generative AI (Gemini).
// It handles:
// 1. Initializing the Google Generative AI SDK with the GEMINI_API_KEY.
// 2. Resilience via exponential backoff retries and fallback models.
// 3. Constructing dense, contextual prompts for repository-level QA analysis.
// 4. Generating end-to-end Playwright/Jest/Cypress test suites.
// 5. Generating GitHub Actions CI/CD workflows.
// 6. Analyzing isolated code snippets for logic bugs and edge cases.
// ============================================================================

// Import official Google Generative AI SDK to interface with Gemini models.
// WHAT: Provides classes and types to call Gemini models (e.g. gemini-2.5-flash).
// WHY: Core AI engine that powers automated diagnostics and code generation.
// HOW: Instantiated inside `getGenAIInstance()`.
import { GoogleGenerativeAI } from '@google/generative-ai';
// Import Node.js path module to safely handle cross-platform file paths.
import path from 'path';
// Import promise-based file system utilities to write generated test files to disk.
import { promises as fs } from 'fs';
// Import synchronous file system methods for fast existence checking of output folders.
import fsSync from 'fs';
// Import the SkillProfile type detected by the repoAnalyzer service.
import { SkillProfile } from './repoAnalyzer';

// ----------------------------------------------------------------------------
// GEMINI SDK CLIENT INITIALIZATION
// ----------------------------------------------------------------------------

// Helper function to create and configure an authenticated Gemini client.
// WHAT: Reads GEMINI_API_KEY from environment variables and returns a GoogleGenerativeAI instance.
// WHY: Centralizes API key validation in one place so missing credentials produce clear error messages.
// HOW: Called at the start of every AI generation request in `generateContentWithRetry`.
const getGenAIInstance = () => {
    // Read the API key from environment variables.
    const apiKey = process.env.GEMINI_API_KEY;
    // Guard clause: Fail fast if the API key is not configured.
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing! Please add it to backend/.env");
    }
    // Return an authenticated instance of the Google Generative AI SDK.
    return new GoogleGenerativeAI(apiKey);
};

// ----------------------------------------------------------------------------
// RESILIENT AI CALL WRAPPER (RETRY & MODEL FALLBACK)
// ----------------------------------------------------------------------------

/**
 * Resilient content generator featuring exponential backoff and model fallback.
 * WHAT: Attempts generation with `primaryModel` (gemini-2.5-flash). If rate-limited (429) or
 *       temporarily unavailable (503), it retries with exponential backoff before falling back
 *       to `fallbackModel` (gemini-1.5-flash).
 * WHY: AI cloud APIs face burst traffic; retries and model fallbacks guarantee zero downtime during vivas/demos.
 * HOW: Used by `generateTests`, `analyzeErrorSnippet`, and `fixFailedTest`.
 */
export async function generateContentWithRetry(prompt: string, primaryModel = "gemini-2.5-flash", fallbackModel = "gemini-1.5-flash", retries = 3, initialDelay = 1000) {
    // Obtain authenticated SDK instance.
    const genAI = getGenAIInstance();
    // Load the primary generative model (Gemini 2.5 Flash).
    let model = genAI.getGenerativeModel({ model: primaryModel });
    // Initialize the backoff delay in milliseconds.
    let delay = initialDelay;

    // Retry loop for transient failures.
    for (let i = 0; i < retries; i++) {
        try {
            // Attempt to generate text content using the configured prompt.
            return await model.generateContent(prompt);
        } catch (error: any) {
            const errorMsg = error.message || '';
            // Check if error is a rate-limit (429) or service unavailable (503).
            const is503or429 = errorMsg.includes('503') || errorMsg.includes('429') || error.status === 503 || error.status === 429;
            
            // If retry limit not reached, wait with exponential backoff and retry primary model.
            if (is503or429 && i < retries - 1) {
                console.warn(`⚠️ Gemini API (${primaryModel}) returned 503/429. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
                // Asynchronously sleep for the backoff duration.
                await new Promise(res => setTimeout(res, delay));
                // Double the delay for the next iteration (exponential backoff).
                delay *= 2;
                continue;
            }
            
            // If primary model retries are exhausted, switch to the fallback model (Gemini 1.5 Flash).
            if (is503or429 && fallbackModel) {
                console.warn(`⚠️ Gemini API (${primaryModel}) exhausted retries. Falling back to ${fallbackModel}...`);
                try {
                    const fallback = genAI.getGenerativeModel({ model: fallbackModel });
                    return await fallback.generateContent(prompt);
                } catch (fallbackError) {
                    console.error(`❌ Fallback model ${fallbackModel} also failed:`, fallbackError);
                    throw error;
                }
            }
            // For non-transient errors (e.g. invalid key), throw immediately without retrying.
            throw error;
        }
    }
    throw new Error("Failed to generate content: Unknown error");
}

// ----------------------------------------------------------------------------
// OUTPUT PARSING & CODE CLEANUP HELPERS
// ----------------------------------------------------------------------------

/**
 * Sanitizes AI-generated code by removing markdown block wrappers.
 * WHAT: Strips leading ```typescript, ```javascript, and trailing ``` tokens.
 * WHY: AI models return markdown blocks which cause syntax errors if saved directly as executable .ts files.
 * HOW: Used as a fallback if regex block extraction fails.
 */
function sanitizeCode(code: string): string {
    return code
        .replace(/^\`\`\`(javascript|typescript|js|ts)?\n/, '')
        .replace(/\n\`\`\`$/, '')
        .trim();
}

/**
 * Extracts the first code block from a markdown string.
 * WHAT: Uses a regular expression to match and extract code between triple backticks.
 * WHY: Isolate clean executable code from surrounding markdown explanation.
 * HOW: Called when parsing the generated Playwright test block from Gemini's response.
 */
function extractCodeBlock(markdown: string): string {
    const regex = /```(?:javascript|typescript|js|ts)?\n([\s\S]*?)```/i;
    const match = markdown.match(regex);
    if (match && match[1]) {
        return match[1].trim();
    }
    // Fallback: if no code block found, sanitize the whole string
    return sanitizeCode(markdown);
}

// ----------------------------------------------------------------------------
// REPOSITORY-LEVEL TEST GENERATION & AUDIT
// ----------------------------------------------------------------------------

/**
 * Generates tests based on code context using Gemini 2.5 Flash.
 * WHAT: Assembles full codebase context, detected tech stack, user focus area, and headless CLI instructions
 *       into a comprehensive prompt; sends it to Gemini, extracts the test suite, CI/CD YAML, and full report,
 *       and saves the generated test script to `backend/tests-generated/`.
 * WHY: Automates the entire QA engineering workflow: code understanding, test writing, and CI/CD integration.
 * HOW: Called in `server.ts` (/api/analyze) and `worker-entry.ts`.
 */
export async function generateTests(repoUrl: string, repoFiles: {name: string, content: string}[], cloneFolder: string, isHeadless: boolean, framework: string = 'playwright', focusArea: string = '', skillProfile?: SkillProfile) {
    // Format all repository files into a unified context string for the AI prompt.
    const filesContext = repoFiles.map(f => `--- FILE: ${f.name} ---\n${f.content}\n`).join('\n');

    // Add prioritized instructions if the user specified a strategic focus area (e.g. 'Authentication', 'Checkout flow').
    const focusPrompt = focusArea ? `
### 🎯 STRATEGIC FOCUS: ${focusArea}
The user has requested a prioritized analysis and testing for the area described above. 
You MUST give extra attention to files, logic, and edge cases related to this specific intent.
` : '';

    // Inject detected tech-stack skills so AI generates framework-accurate tests.
    // WHAT: Statically detected languages, frameworks, ORMs, and auth methods passed into the prompt.
    // WHY: Prevents the AI from hallucinating incorrect selectors, libraries, or APIs.
    const skillsPrompt = skillProfile && skillProfile.allSkills.length > 0 ? `
### 🧠 Detected Skills & Tech Stack
This repository was statically analyzed. The following technologies were detected with high confidence:
- **Languages**: ${skillProfile.languages.join(', ') || 'N/A'}
- **Frameworks**: ${skillProfile.frameworks.join(', ') || 'N/A'}
- **Databases**: ${skillProfile.databases.join(', ') || 'N/A'}
- **Auth**: ${skillProfile.auth.join(', ') || 'N/A'}
- **Testing Tools**: ${skillProfile.testing.join(', ') || 'N/A'}
- **Patterns**: ${skillProfile.patterns.join(', ') || 'N/A'}
- **DevOps**: ${skillProfile.devops.join(', ') || 'N/A'}
- **Package Manager**: ${skillProfile.packageManager}

You MUST use this context to write tests that are accurate for this specific stack.
Do NOT hallucinate dependencies, selectors, or APIs not consistent with the above stack.
` : '';

    // Specialized instructions if the project is a headless Node.js CLI tool without a frontend web UI.
    let headlessPrompt = '';
    if (isHeadless) {
        headlessPrompt = `
### 🚨 CRITICAL INSTRUCTION: Headless Node CLI App Detected 🚨
The user repository does not contain a frontend UI. However, we have natively wrapped their CLI application inside a DOM emulator at 'http://localhost:3030'.
You MUST use these explicit selectors to test their CLI application over the DOM:
- \`page.locator('#cli-output')\` to read the stdout terminal history.
- \`page.locator('#cli-input')\` to type commands into the terminal.
- \`page.locator('#cli-submit')\` to send the typed command to the sub-process.
- ALWAYS wait for the output string to appear using \`await expect(page.locator('#cli-output')).toContainText('expected output', { timeout: 10000 })\`.
`;
    }

    // Master prompt instructing Gemini to act as a Senior AI QA Engineer and return a structured report.
    const prompt = `
You are a Senior AI QA Engineer. Analyze this repository: ${repoUrl}.
${skillsPrompt}
${focusPrompt}
${headlessPrompt}

### REPOSITORY CONTEXT
${filesContext}

### RESPONSE REQUIREMENTS (BE CONCISE, HIGH DENSITY)

### 🧩 Framework Signature
[2-3 words tech stack]

### 🛠️ Corrected Solution
[Provide FULLY FIXED code for the most critical file only if bugs exist. Otherwise, provide 1 high-impact performance fix.]

### 📋 1. EXECUTIVE SUMMARY
[2 paragraphs of technical prose. Architecture, patterns, and quality assessment.]

### ⚙️ 2. TESTING STRATEGY
[Bullet points for key features. Each must have: **Feature Name**, **Rationale**, and **Scenario**.]

### 🚀 3. ${framework.charAt(0).toUpperCase() + framework.slice(1)} Test Suite
[Complete E2E test suite in one block. Use http://localhost:3030. No hallucinated selectors.]

### 🔄 4. CI/CD Pipeline Configuration
[One block for .github/workflows/ai-qa.yml]

### 💡 5. Best Practices & Roadmap
[3 bullet points for long-term quality improvement.]
`;

    try {
        // Send prompt to Gemini with automatic retry logic.
        const result = await generateContentWithRetry(prompt);
        const response = await result.response;
        // Complete raw markdown report returned by Gemini.
        const fullReport = response.text();
        
        // Extract Framework Signature (e.g. 'React, Express') using regex.
        const frameworkSection = fullReport.match(/### 🧩 Framework Signature\n+([^\n#]+)/i);
        const frameworkSignature = frameworkSection ? frameworkSection[1].trim() : 'Unknown';

        // Extract the test suite code block from Section 3.
        const testSectionMatch = fullReport.match(/### 🚀 3\. (?:Playwright|Cypress|Jest) Test Suite\n+```(?:javascript|typescript|js|ts)?\n([\s\S]*?)```/i);
        const testCode = testSectionMatch && testSectionMatch[1] ? testSectionMatch[1].trim() : extractCodeBlock(fullReport.split(/### 🚀 3\./i)[1] || fullReport);

        // Extract the CI/CD Pipeline YAML block from Section 4.
        const cicdSectionMatch = fullReport.match(/### 🔄 4\. CI\/CD Pipeline Configuration\n+```(?:yaml|yml)?\n([\s\S]*?)```/i);
        const cicdCode = cicdSectionMatch && cicdSectionMatch[1] ? cicdSectionMatch[1].trim() : '';

        // Ensure the generated tests output directory exists.
        const testDir = path.join(__dirname, '..', 'tests-generated');
        if (!fsSync.existsSync(testDir)) {
            await fs.mkdir(testDir, { recursive: true });
        }

        // Determine correct file extension based on requested framework.
        const extension = framework === 'jest' ? 'test.js' : (framework === 'cypress' ? 'cy.js' : 'spec.ts');
        const fileName = `generated-${Date.now()}.${extension}`;
        const filePath = path.join(testDir, fileName);
        // Persist the executable test code to disk.
        await fs.writeFile(filePath, testCode, 'utf8');

        // Return all extracted components to the caller.
        return { fileName, filePath, code: testCode, cicdCode, fullReport, frameworkSignature };
    } catch (error: any) {
        console.error("Error generating test UI:", error);
        throw new Error(`Failed to generate tests via AI: ${error.message}`);
    }
}

// ----------------------------------------------------------------------------
// SINGLE CODE SNIPPET LOGIC BUG DIAGNOSTIC
// ----------------------------------------------------------------------------

/**
 * Analyzes an uploaded or pasted code snippet for bugs, errors, and edge cases.
 * WHAT: Sends the code snippet to Gemini with strict output formatting headers:
 *       1. Corrected Solution
 *       2. Error Identification (Error Type, Line Number, Summary)
 *       3. Diagnostic Analysis & Edge Cases
 *       4. Corrected Source Code
 *       5. Best Practices & Optimization
 * WHY: Provides students and developers with instant, detailed debugging feedback for single files (Java, Python, JS, etc.).
 * HOW: Called by `app.post('/api/analyze-snippet')` in `server.ts`.
 */
export async function analyzeErrorSnippet(code: string) {
    const prompt = `You are a Senior Principal Engineer and QA Specialist.
Analyze the following code for logic bugs, syntax errors, and edge cases.

File Content:
\`\`\`
${code}
\`\`\`

Strictly adhere to this response format with these headers:

### 1. Corrected Solution
[The fully fixed, optimized, and ready-to-run code in a single markdown code block with the correct language identifier.]

### 2. Error Identification
- **Error Type**: [e.g., NullPointerException, Logic Bug, Syntax Error]
- **Line Number**: [The exact line where the issue starts]
- **Summary**: [Brief description of the impact]

### 3. Diagnostic Analysis & Edge Cases
[Deep dive into why the error occurs and what edge cases trigger it. Use bullet points for readability.]

### 4. Corrected Source Code
[Provide the same corrected code as in section 1 here for continuity in the technical flow.]

### 5. Best Practices & Optimization
[Suggest 1-2 professional patterns to avoid this error in the future.]`;

    try {
        // Send snippet prompt to Gemini with retries.
        const result = await generateContentWithRetry(prompt);
        const response = await result.response;
        // Return full diagnostic report text.
        return response.text() || 'No explanation generated.';
    } catch (error: any) {
        console.error("Error analyzing snippet via AI:", error);
        throw new Error(`Failed to analyze snippet via AI: ${error.message}`);
    }
}
