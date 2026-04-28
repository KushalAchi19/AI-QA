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
export async function generateTests(repoUrl: string, repoFiles: {name: string, content: string}[], cloneFolder: string, isHeadless: boolean, framework: string = 'playwright', focusArea: string = '') {
    const model = getModel();

    const filesContext = repoFiles.map(f => `--- FILE: ${f.name} ---\n${f.content}\n`).join('\n');

    const focusPrompt = focusArea ? `
### 🎯 STRATEGIC FOCUS: ${focusArea}
The user has requested a prioritized analysis and testing for the area described above. 
You MUST give extra attention to files, logic, and edge cases related to this specific intent.
` : '';

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
You are a Senior AI QA Engineer. Analyze this repository: ${repoUrl}.
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
