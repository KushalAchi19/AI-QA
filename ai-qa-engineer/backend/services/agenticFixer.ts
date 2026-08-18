import { generateContentWithRetry } from './testGenerator';

export async function fixFailedTest(repoUrl: string, brokenCode: string, errorLog: string, framework: string) {
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
        const result = await generateContentWithRetry(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Extract code block
        const regex = /```(?:javascript|typescript|js|ts)?\n([\s\S]*?)```/i;
        const match = text.match(regex);
        return match && match[1] ? match[1].trim() : text.trim();
    } catch (error: any) {
        console.error("Error in Agentic Fixer:", error);
        throw new Error(`Agentic Fixer failed: ${error.message}`);
    }
}
