// ============================================================================
// SERVICE: AGENTIC FIXER (AUTONOMOUS SELF-HEALING TEST LOOP)
// This service implements an agentic self-healing loop for broken test suites.
// When an autonomously generated Playwright/Jest/Cypress test fails during execution,
// this module sends the broken test code together with the terminal error logs back
// to Google Gemini AI to diagnose the failure, fix selectors or timing issues,
// and return working, corrected test code.
// ============================================================================

// Import the Gemini API generation helper that includes automatic retry logic and fallback models.
// WHAT: Imports `generateContentWithRetry` from the testGenerator service.
// WHY: Ensures API calls to Gemini are resilient against transient rate limits (429) or server errors (503).
// HOW: Used below to prompt the AI model with the broken code and error logs.
import { generateContentWithRetry } from './testGenerator';

// ----------------------------------------------------------------------------
// AGENTIC TEST REPAIR FUNCTION
// ----------------------------------------------------------------------------

// Diagnoses and repairs a failed test script using Gemini AI.
// WHAT: Accepts repository URL, failed test code, terminal error log, and framework name; prompts Gemini to repair the code.
// WHY: Test generation can occasionally produce outdated selectors or timing race conditions; this loop autonomously fixes them without human intervention.
// HOW: Called inside `server.ts` and `worker-entry.ts` when `testResult.suites` reports failed tests or execution errors.
export async function fixFailedTest(repoUrl: string, brokenCode: string, errorLog: string, framework: string) {
    // Construct a specialized prompt that presents both the broken code and terminal error log to Gemini.
    // WHAT: Multi-line template string instructing the AI persona to act as a Principal QA Engineer.
    // WHY: Grounding the AI with exact runtime logs (stack traces, missing DOM selectors) enables precise, deterministic code fixes.
    // HOW: Passed directly into `generateContentWithRetry(prompt)`.
    const prompt = `
You are a Senior Principal QA Engineer. An autonomously generated ${framework} test suite has failed. 
Your task is to analyze the broken code and the terminal error logs, and provide a corrected, working version of the test suite.

### REPOSITORY URL
${repoUrl}

### BROKEN TEST CODE
\`\`\`${framework === 'jest' ? 'javascript' : 'typescript'}
${brokenCode}
\`\`\`

### TERMINAL ERROR LOGS
\`\`\`
${errorLog}
\`\`\`

### INSTRUCTIONS
1. Analyze the error logs to identify the root cause (e.g., incorrect selector, timing issue, missing setup).
2. Fix the broken code. Use only valid ${framework} syntax and existing selectors.
3. Return ONLY the corrected code in a single markdown code block. Do not include any explanations.
`;

    try {
        // Send the diagnostic repair prompt to the Gemini API with automatic retries.
        // WHAT: Calls `generateContentWithRetry` which invokes Gemini 2.5 Flash (falling back to 1.5 Flash if needed).
        // WHY: Guarantees high availability even during peak API traffic.
        // HOW: Awaits the Gemini response object.
        const result = await generateContentWithRetry(prompt);
        // Extract the response payload from the Gemini API result.
        const response = await result.response;
        // Convert the model response into raw string text.
        const text = response.text();
        
        // Regular expression to isolate the code block from any surrounding markdown formatting.
        // WHAT: Matches ```[optional language tag] [code content] ```.
        // WHY: LLMs wrap code in markdown backticks; we need the clean, executable source code to write to disk.
        // HOW: Extracts group 1 containing the inner code.
        const regex = /```(?:javascript|typescript|js|ts)?\n([\s\S]*?)```/i;
        // Execute regex match against the model output text.
        const match = text.match(regex);
        // Return clean code block content if matched, otherwise fallback to trimmed raw text.
        return match && match[1] ? match[1].trim() : text.trim();
    } catch (error: any) {
        // Log the failure in the agentic repair process to the backend console.
        console.error("Error in Agentic Fixer:", error);
        // Throw a formatted error so caller can update analysis status to FAILED.
        throw new Error(`Agentic Fixer failed: ${error.message}`);
    }
}
