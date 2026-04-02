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
 * Generates Playwright tests based on code context using Gemini 2.5 Flash
 */
export async function generateTests(repoUrl: string, repoFiles: {name: string, content: string}[], cloneFolder: string, isHeadless: boolean) {
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
You are a Senior AI QA Engineer and Principal Developer. I need a comprehensive E2E testing brief, code audit, and Playwright test suite for this repository: ${repoUrl}.

### ACTUAL REPOSITORY FILES (Perform a deep audit for logic bugs and security flaws!)
${filesContext}
${headlessPrompt}

Please provide your response in these exact sections:

### 🧩 Framework Signature
[Provide a short 2-3 word identifier of the primary tech stack, e.g., 'React / Vite', 'Java / Maven', 'Node / Express'.]

### 🛠️ Corrected Solution
[If you find logic bugs, provide the FULLY FIXED source code for the primary file here. If no bugs, suggest 1 major performance enhancement with code.]

### 🚩 1. Error Identification
[List specific logic bugs, security flaws, or syntax errors found during the file audit.]

### 🔍 2. Diagnostic Analysis & Edge Cases
[Deep dive into why these issues occur and what production edge cases might trigger them.]

### 🚀 3. Playwright Test Suite
[Provide a complete Playwright test suite in a single markdown code block. 
- MUST Use 'http://localhost:3030' as the base URL.
- DO NOT hallucinate CSS selectors; use only elements found in the ACTUAL REPOSITORY FILES.
- Include the CORRECTED SOURCE CODE from section 1 again below the tests for full context.]

### 💡 4. Best Practices & Roadmap
[Suggest 2-3 enterprise-grade QA patterns to improve this repository's long-term quality.]
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const fullReport = response.text();
        
        // Extract Framework Signature specifically
        const frameworkSection = fullReport.match(/### 🧩 Framework Signature\n+([^\n#]+)/i);
        const frameworkSignature = frameworkSection ? frameworkSection[1].trim() : 'Unknown';

        // Find the "Playwright Test Suite" section specifically to avoid extracting source code by accident
        const playwrightSection = fullReport.split(/### 🚀 3\. Playwright Test Suite/i)[1] || fullReport;
        const testCode = extractCodeBlock(playwrightSection);

        const testDir = path.join(__dirname, '..', 'tests-generated');
        if (!fsSync.existsSync(testDir)) {
            await fs.mkdir(testDir, { recursive: true });
        }

        const fileName = `generated-${Date.now()}.spec.ts`;
        const filePath = path.join(testDir, fileName);
        await fs.writeFile(filePath, testCode, 'utf8');

        return { fileName, filePath, code: testCode, fullReport, frameworkSignature };
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
