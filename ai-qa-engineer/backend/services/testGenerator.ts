import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';

const getAI = () => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing! Please add it to backend/.env");
    }
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

/**
 * Uses Gemini 2.5 Flash to generate Playwright tests based on code context
 */
export async function generateTests(repoUrl: string, repoFiles: any[]) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing! Please add it to backend/.env");
    }

    // For the MVP, we will generate a basic E2E smoke test for the given repo
    // In a real scenario, we would download the code files and send them as context.
    const prompt = `
You are an AI QA Engineer. I need you to write a complete Playwright test suite for a web application based on this repository: ${repoUrl}.
Since this is an E2E test, write a general smoke test that navigates to a hypothetical deployed version of this app (use 'http://localhost:3000' as a placeholder URL) and checks for basic presence of UI elements.

Return ONLY pure JavaScript Playwright code without markdown block wrappers or explanations. The file will be saved as a .spec.ts file.
Example structure:
import { test, expect } from '@playwright/test';
test('basic test', async ({ page }) => { ... });
`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        let testCode = response.text || '';

        // Clean up markdown block if the model accidentally includes it
        if (testCode.startsWith('\`\`\`')) {
            testCode = testCode.replace(/^\`\`\`(javascript|typescript|js|ts)?\n/, '').replace(/\n\`\`\`$/, '');
        }

        // Save the test to disk so Playwright can execute it
        const testDir = path.join(__dirname, '..', 'tests-generated');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        const fileName = `generated-${Date.now()}.spec.ts`;
        const filePath = path.join(testDir, fileName);
        fs.writeFileSync(filePath, testCode, 'utf8');

        return { fileName, filePath, code: testCode };
    } catch (error: any) {
        console.error("Error generating test UI:", error);
        throw new Error("Failed to generate tests via AI.");
    }
}

export async function analyzeErrorSnippet(code: string) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing! Please add it to backend/.env");
    }

    const prompt = `You are a Senior Principal Engineer and QA Specialist reviewing a file uploaded by a developer.
Your task is to exhaustively analyze the file content below.

File Content:
\`\`\`
${code}
\`\`\`

Strictly adhere to this response format:
### 1. Root Cause & Edge Cases
Identify any logic bugs, syntax errors, or anti-patterns in the code. Describe what happens when typical or extreme edge cases are run against it.

### 2. Corrected Source Code
Provide the fully fixed, optimized, and ready-to-run code in a single, properly formatted markdown code block. Do not just leave comments; write out the complete file solution.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text || 'No explanation generated.';
    } catch (error: any) {
        console.error("Error analyzing snippet via AI:", error);
        throw new Error("Failed to analyze snippet via AI: " + error.message);
    }
}
