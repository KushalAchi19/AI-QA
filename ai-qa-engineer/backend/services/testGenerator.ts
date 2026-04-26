import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { promises as fs } from 'fs';
import fsSync from 'fs';

const getModel = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing! Please add it to backend/.env");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    // Using gemini-2.5-flash as requested by the user
    return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
};

/**
 * Sanitizes AI-generated code by removing markdown block wrappers.
 */
function sanitizeCode(code: string): string {
    return code
        .replace(/^\`\`\`(javascript|typescript|js|ts)?\n/, '')
        .replace(/\n\`\`\`$/, '')
        .trim();
}

/**
 * Extracts the first code block from a markdown string.
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

/**
 * Generates tests based on code context using Gemini 2.5 Flash
 */
export async function generateTests(repoUrl: string, repoFiles: {name: string, content: string}[], cloneFolder: string, isHeadless: boolean, framework: string = 'playwright') {
    const model = getModel();

    const filesContext = repoFiles.map(f => `--- FILE: ${f.name} ---\n${f.content}\n`).join('\n');

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

    const prompt = `
You are a Senior AI QA Engineer and Principal Developer. I need a comprehensive E2E testing brief, code audit, and ${framework} test suite for this repository: ${repoUrl}.

### ACTUAL REPOSITORY FILES (Perform a deep audit for logic bugs and security flaws!)
${filesContext}
${headlessPrompt}

Please provide your response in these exact sections:

### 🧩 Framework Signature
[Provide a short 2-3 word identifier of the primary tech stack, e.g., 'React / Vite', 'Java / Maven', 'Node / Express'.]

### 🛠️ Corrected Solution
[If you find logic bugs, provide the FULLY FIXED source code for the primary file here. If no bugs, suggest 1 major performance enhancement with code.]

### 📋 1. EXECUTIVE SUMMARY
[Write 2-3 professional prose paragraphs summarizing: what this application does, its overall architecture (frontend framework, data layer, key patterns), and a high-level quality assessment — strengths, risks, and notable characteristics. Do NOT use bullet points here; write in clear, authoritative engineering prose.]

### ⚙️ 2. TESTING STRATEGY
[Provide a structured smoke-test plan. Start with a single sentence: "Components/Routes Prioritized for Smoke Test:" then list each key feature or route as a bold subheading (e.g., **Note Addition (Create):**). Under each subheading include exactly two bullet points: "- **Rationale:** [why this is critical to test]" and "- **Scenario:** [concrete step-by-step test scenario]". Close with 1-2 sentences on what broader testing would follow after smoke tests pass.]

### 🚀 3. ${framework.charAt(0).toUpperCase() + framework.slice(1)} Test Suite
[Provide a complete ${framework} test suite in a single markdown code block. 
- MUST Use 'http://localhost:3030' as the base URL.
- DO NOT hallucinate CSS selectors; use only elements found in the ACTUAL REPOSITORY FILES.]

### 🔄 4. CI/CD Pipeline Configuration
[Provide a complete \`.github/workflows/ai-qa.yml\` file in a single markdown code block. This workflow should install dependencies and run the tests you just generated above.]

### 💡 5. Best Practices & Roadmap
[Suggest 2-3 enterprise-grade QA patterns to improve this repository's long-term quality.]
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const fullReport = response.text();
        
        // Extract Framework Signature specifically
        const frameworkSection = fullReport.match(/### 🧩 Framework Signature\n+([^\n#]+)/i);
        const frameworkSignature = frameworkSection ? frameworkSection[1].trim() : 'Unknown';

        // Find the "Test Suite" section
        const testSectionMatch = fullReport.match(/### 🚀 3\. (?:Playwright|Cypress|Jest) Test Suite\n+```(?:javascript|typescript|js|ts)?\n([\s\S]*?)```/i);
        const testCode = testSectionMatch && testSectionMatch[1] ? testSectionMatch[1].trim() : extractCodeBlock(fullReport.split(/### 🚀 3\./i)[1] || fullReport);

        // Find the "CI/CD Pipeline" section
        const cicdSectionMatch = fullReport.match(/### 🔄 4\. CI\/CD Pipeline Configuration\n+```(?:yaml|yml)?\n([\s\S]*?)```/i);
        const cicdCode = cicdSectionMatch && cicdSectionMatch[1] ? cicdSectionMatch[1].trim() : '';

        const testDir = path.join(__dirname, '..', 'tests-generated');
        if (!fsSync.existsSync(testDir)) {
            await fs.mkdir(testDir, { recursive: true });
        }

        const extension = framework === 'jest' ? 'test.js' : (framework === 'cypress' ? 'cy.js' : 'spec.ts');
        const fileName = `generated-${Date.now()}.${extension}`;
        const filePath = path.join(testDir, fileName);
        await fs.writeFile(filePath, testCode, 'utf8');

        return { fileName, filePath, code: testCode, cicdCode, fullReport, frameworkSignature };
    } catch (error: any) {
        console.error("Error generating test UI:", error);
        throw new Error(`Failed to generate tests via AI: ${error.message}`);
    }
}

export async function analyzeErrorSnippet(code: string) {
    const model = getModel();

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
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text() || 'No explanation generated.';
    } catch (error: any) {
        console.error("Error analyzing snippet via AI:", error);
        throw new Error(`Failed to analyze snippet via AI: ${error.message}`);
    }
}
