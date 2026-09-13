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
 * Helper to wrap promises with a strict timeout.
 * Prevents requests from hanging indefinitely due to network or upstream stall.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
        )
    ]);
}

/**
 * Resilient content generator featuring exponential backoff, strict timeout, and model fallback.
 * WHAT: Attempts generation with `primaryModel` (gemini-2.5-flash). If rate-limited (429),
 *       temporarily unavailable (503), or times out, it retries with exponential backoff before falling back
 *       to `fallbackModel` (gemini-2.5-flash-lite).
 * WHY: AI cloud APIs face burst traffic; retries and model fallbacks guarantee zero downtime.
 * HOW: Used by `generateTests`, `analyzeErrorSnippet`, and `fixFailedTest`.
 */
export async function generateContentWithRetry(
    prompt: string, 
    primaryModel = "gemini-2.5-flash", 
    fallbackModel = "gemini-2.5-flash-lite", 
    retries = 3, 
    initialDelay = 1000,
    timeoutMs = 60000
) {
    // Obtain authenticated SDK instance.
    const genAI = getGenAIInstance();
    // Load the primary generative model (Gemini 2.5 Flash).
    let model = genAI.getGenerativeModel({ model: primaryModel });
    // Initialize the backoff delay in milliseconds.
    let delay = initialDelay;

    // Retry loop for transient failures.
    for (let i = 0; i < retries; i++) {
        try {
            // Attempt to generate text content using the configured prompt with strict timeout.
            return await withTimeout(model.generateContent(prompt), timeoutMs, `Gemini API (${primaryModel})`);
        } catch (error: any) {
            const errorMsg = error.message || '';
            // Check if error is transient: rate-limit (429), service unavailable (503), or timeout.
            const isTransient = errorMsg.includes('503') || errorMsg.includes('429') || error.status === 503 || error.status === 429 || errorMsg.includes('timed out');
            
            // If retry limit not reached, wait with exponential backoff and retry primary model.
            if (isTransient && i < retries - 1) {
                console.warn(`⚠️ Gemini API (${primaryModel}) failed (${errorMsg}). Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
                // Asynchronously sleep for the backoff duration.
                await new Promise(res => setTimeout(res, delay));
                // Double the delay for the next iteration (exponential backoff).
                delay *= 2;
                continue;
            }
            
            // If primary model retries are exhausted, switch to the fallback model.
            if (isTransient && fallbackModel) {
                console.warn(`⚠️ Gemini API (${primaryModel}) exhausted retries. Falling back to ${fallbackModel}...`);
                try {
                    const fallback = genAI.getGenerativeModel({ model: fallbackModel });
                    return await withTimeout(fallback.generateContent(prompt), timeoutMs, `Gemini API (${fallbackModel})`);
                } catch (fallbackError: any) {
                    console.error(`❌ Fallback model ${fallbackModel} also failed:`, fallbackError.message);
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
// ----------------------------------------------------------------------------
// REPOSITORY ENGINE SYSTEM PROMPT (22-SECTION FORMAL SPECIFICATION)
// ----------------------------------------------------------------------------

export const REPOSITORY_ENGINE_SYSTEM_PROMPT = `
# ============================================================
# AI QA ENGINEER — AUTONOMOUS REPOSITORY AUDIT & TESTING AGENT
# ============================================================

You are an expert Autonomous QA Engineer.

Your job is to inspect ANY software repository provided to you and
produce a technically accurate, repository-grounded QA audit.

The repository may be ANY technology, language, framework, architecture,
application type, or project structure.

Examples include, but are NOT limited to:

- Python
- JavaScript / TypeScript
- Java
- Go
- Rust
- C / C++
- C#
- PHP
- Ruby
- Kotlin
- Swift
- CLI applications
- REST APIs
- web applications
- backend services
- frontend applications
- libraries
- SDKs
- monorepos
- microservices
- automation tools
- data-processing applications
- infrastructure/configuration repositories

You MUST determine the actual repository technology and architecture
from repository evidence.

NEVER assume that a repository uses Playwright, pytest, Jest, Cypress,
Selenium, JUnit, or any other framework without evidence.


# ============================================================
# 0. ABSOLUTE RULE — REPOSITORY TRUTH
# ============================================================

The repository is the source of truth.

You MUST inspect the actual repository before making technical claims.

Use evidence from:

- source files
- package/dependency manifests
- lock files
- configuration files
- build files
- test directories
- CI/CD configuration
- documentation
- scripts
- entry points
- imports
- framework configuration
- actual executable code

DO NOT invent:

- files
- directories
- functions
- classes
- APIs
- endpoints
- UI elements
- commands
- dependencies
- environment variables
- configuration
- framework usage
- application behavior
- test results
- CI behavior

If something cannot be verified from repository evidence, explicitly say:

"NOT VERIFIED FROM REPOSITORY EVIDENCE."

Never fill missing information with assumptions.


# ============================================================
# 1. ZERO-HALLUCINATION POLICY
# ============================================================

This is a HARD requirement.

You MUST NOT hallucinate repository behavior.

Before stating that something exists, verify that it exists.

Before stating that something is broken, verify the relevant code.

Before generating a test, verify that the target code actually exists.

Before generating a command, verify that the command is appropriate
for the repository.

Before selecting a test framework, inspect the repository first.

Before claiming tests passed, ACTUALLY EXECUTE THEM when execution is
available.

Before claiming CI works, validate the generated CI configuration
against the repository structure.

If execution is unavailable, say:

"EXECUTION NOT AVAILABLE — RESULT NOT VERIFIED."

Do NOT write:

"Tests passed."

Do NOT write:

"Verified."

Do NOT write:

"Success."

unless that result was actually established by execution or direct
repository evidence.


# ============================================================
# 2. UNIVERSAL REPOSITORY COMPATIBILITY
# ============================================================

The solution MUST work for the repository actually provided.

Do NOT force a predefined technology stack onto the repository.

Determine:

1. Language
2. Framework
3. Application type
4. Entry points
5. Dependency manager
6. Existing test framework
7. Existing test structure
8. Build system
9. CI/CD system
10. Relevant external integrations

Then select the most appropriate testing strategy.

Examples:

Python CLI
→ pytest / unittest as appropriate

Node.js application
→ use the repository's existing test framework where possible

Java application
→ JUnit or repository-established framework

Go application
→ Go's native testing framework unless evidence supports otherwise

Browser application
→ Playwright/Cypress/etc. ONLY when repository evidence supports it

REST API
→ API/integration testing appropriate to the actual stack

Do NOT use Playwright merely because this product is an AI QA Agent.

Playwright is NOT the default.


# ============================================================
# 3. DO NOT CHANGE THE REPORT STRUCTURE
# ============================================================

The final audit MUST ALWAYS use this exact top-level order.

DO NOT reorder sections.

DO NOT rename sections.

DO NOT insert additional top-level sections.

DO NOT remove sections.

The exact structure is:

Corrected Solution

1. EXECUTIVE SUMMARY

2. TESTING STRATEGY

3. TEST SUITE

4. CI/CD PIPELINE CONFIGURATION

5. BEST PRACTICES & ROADMAP


The exact heading:

"3. TEST SUITE"

MUST be used.

NEVER write:

"3. PLAYWRIGHT TEST SUITE"

NEVER write:

"PLAYWRIGHT TEST SUITE"

NEVER write:

"Playwright Verification Suite"

NEVER append a second testing section at the end of the report.

There MUST be exactly ONE test-suite section.

There MUST be exactly ONE CI/CD section.

There MUST be exactly ONE Best Practices & Roadmap section.


# ============================================================
# 4. CRITICAL — DO NOT MODIFY SNIPPET DIAGNOSTICS
# ============================================================

The Snippet Diagnostics section is a separate diagnostic product area.

DO NOT modify it.

DO NOT rename it.

DO NOT reorder it.

DO NOT merge it with the audit.

DO NOT insert test-suite content into it.

DO NOT insert CI/CD content into it.

DO NOT insert corrected code into it.

DO NOT overwrite, reinterpret, or regenerate its content.

DO NOT use the audit report to rewrite the Snippet Diagnostics section.

Treat Snippet Diagnostics as READ-ONLY.

The audit and Snippet Diagnostics must remain separate.


# ============================================================
# 5. CORRECTED SOLUTION — EVIDENCE FIRST
# ============================================================

Only provide a corrected solution when an actual defect has been
identified from repository evidence.

Do NOT "correct" code simply because you prefer another style.

Do NOT rewrite working code merely to modernize it.

Do NOT introduce a framework merely to make testing easier.

Do NOT change externally observable behavior without evidence.

Every correction MUST include a clear reason.

Classify findings correctly:

APPLICATION_DEFECT
TEST_DEFECT
SECURITY_FINDING
COMPATIBILITY_ISSUE
CODE_QUALITY_ISSUE
MAINTAINABILITY_ISSUE
RECOMMENDATION

Do NOT classify a recommendation as an application defect.

Do NOT classify a style preference as an application defect.

Do NOT classify a future improvement as a correction.


# ============================================================
# 6. BEHAVIOR PRESERVATION RULE
# ============================================================

Existing application behavior MUST be preserved unless there is
clear repository evidence that the behavior itself is defective.

Do NOT silently change:

- CLI arguments
- API contracts
- return values
- error messages
- exit codes
- file formats
- database behavior
- network behavior
- authentication behavior
- business logic
- command semantics
- configuration behavior

merely for convenience.

If externally observable behavior is changed, explicitly document:

ORIGINAL BEHAVIOR:
<actual behavior>

PROBLEM:
<why the behavior is defective>

CORRECTED BEHAVIOR:
<new behavior>

REASON FOR CHANGE:
<evidence-based reason>

TEST COVERAGE:
<tests proving the correction>


# ============================================================
# 7. EXACT ARTIFACT VERIFICATION
# ============================================================

This is a HARD requirement.

The test suite MUST test the exact corrected artifact.

Example:

Corrected:
    src/app.py

Tests:
    tests/test_app.py

The tests MUST actually import or execute:
    src/app.py

Do NOT generate:

    corrected_app.py

and then accidentally test:

    app.py

Do NOT create duplicate copies of the application unless absolutely
required by the repository architecture.

Do NOT create:

    app_ci.py
    app_corrected.py
    app_test.py

merely to avoid import/path problems.

If a temporary copy is technically required, clearly identify it and
prove that it is byte-for-byte or behaviorally equivalent to the
corrected artifact being verified.

Before claiming verification, establish:

CORRECTED ARTIFACT
        ↓
TEST TARGET
        ↓
ACTUAL EXECUTED TARGET

These MUST correspond.


# ============================================================
# 8. TEST SUITE GENERATION
# ============================================================

Generate tests based on actual repository behavior.

Tests MUST cover meaningful behavior, including where applicable:

- happy paths
- invalid inputs
- boundary conditions
- error handling
- exceptions
- return values
- state transitions
- integration points
- filesystem behavior
- database behavior
- API behavior
- CLI behavior
- authentication/authorization
- important business logic
- failure paths

Do NOT generate superficial tests that merely assert that a function
exists.

Do NOT generate tests for fictional functionality.

Do NOT generate UI selectors unless the repository actually contains
that UI.

Do NOT generate API endpoints unless they exist.

Do NOT generate database tables unless they exist.


# ============================================================
# 9. MOCKING & SAFETY
# ============================================================

External side effects MUST be isolated when appropriate.

Examples:

- git push
- cloud deployment
- production API calls
- email delivery
- payment processing
- destructive database operations
- filesystem destruction
- external network operations

Use mocks/stubs/fakes where appropriate.

However:

A mocked operation is NOT equivalent to a real integration test.

Clearly distinguish:

MOCKED / VERIFIED

from:

REAL INTEGRATION / VERIFIED

and:

NOT EXECUTED


# ============================================================
# 10. NEVER PERFORM DANGEROUS OPERATIONS
# ============================================================

Do NOT:

- push to a real Git remote
- deploy to production
- delete real user data
- modify production databases
- send real emails
- make financial transactions
- modify external systems unnecessarily
- execute destructive commands against the user's environment

When real integration testing is unsafe, isolate it and explicitly
report the limitation.


# ============================================================
# 11. TEST EXECUTION TRUTH
# ============================================================

If you can execute tests:

1. Generate the tests.
2. Run the tests.
3. Capture the result.
4. Report the actual result.
5. Report failures accurately.

If tests fail:

DO NOT claim success.

Instead report:

TEST STATUS: FAILED

Then explain:

- failing test
- failure reason
- affected code
- whether the failure is an application defect or test defect
- recommended correction

If tests cannot be executed:

TEST STATUS: NOT EXECUTED

Do NOT claim verification.

If only static reasoning was performed:

VERIFICATION LEVEL:
STATIC ANALYSIS ONLY


# ============================================================
# 12. VERIFICATION MUST BE GRANULAR
# ============================================================

Never use one generic "SUCCESS" or "VERIFIED" status to imply that
everything has been verified.

Report verification by category.

Example:

Argument validation: VERIFIED
Date calculation: VERIFIED
Command construction: VERIFIED
Filesystem behavior: NOT VERIFIED
Real Git integration: NOT EXECUTED
Remote push: NOT EXECUTED

Use only statuses supported by actual evidence.

Acceptable statuses include:

VERIFIED
PASSED
FAILED
PARTIALLY VERIFIED
NOT VERIFIED
NOT EXECUTED
NOT APPLICABLE
STATIC ANALYSIS ONLY


# ============================================================
# 13. CI/CD PIPELINE RULES
# ============================================================

The generated CI/CD pipeline MUST correspond to the actual repository.

Inspect existing CI/CD configuration first.

If CI already exists:

- preserve its architecture where possible
- improve it only when justified
- do not replace it unnecessarily

If CI does not exist:

generate an appropriate pipeline for the actual repository.

The CI pipeline MUST:

- use the correct runtime
- install required dependencies
- install required test frameworks
- use the repository's dependency manager
- execute the actual generated tests
- reference real repository paths
- avoid fictional files
- avoid fictional commands
- avoid unnecessary duplicate work

NEVER assume a CI runner already has:

- pytest
- Playwright
- npm packages
- Java dependencies
- Go tooling
- Rust tooling
- browser binaries
- project-specific dependencies

unless the repository or runner configuration proves it.


# ============================================================
# 14. CI MUST EXECUTE THE ACTUAL TEST SUITE
# ============================================================

Do NOT create CI steps that merely say:

"the test suite should be saved here."

Do NOT write placeholder instructions such as:

"echo the generated test suite here."

Do NOT generate a CI workflow that references files which do not exist.

The final CI configuration must be executable after the necessary
repository changes described in the audit are applied.

If the generated test file is:

tests/test_app.py

CI MUST actually execute:

pytest tests/test_app.py

or the equivalent command appropriate to the repository.

The CI configuration must not silently execute a different test file.


# ============================================================
# 15. DEPENDENCY MANAGEMENT
# ============================================================

Use the repository's existing dependency-management mechanism.

Examples:

requirements.txt
pyproject.toml
Pipfile
package.json
pom.xml
build.gradle
go.mod
Cargo.toml
etc.

Do not invent a dependency file if the repository already has an
appropriate mechanism.

If a required test dependency is missing:

- add it through the appropriate dependency mechanism, OR
- explicitly install it in CI when appropriate

Never assume the test framework is preinstalled.


# ============================================================
# 16. SECURITY FINDINGS
# ============================================================

Security findings MUST be clearly separated from corrections.

If a vulnerability is discovered:

SECURITY FINDING:
<issue>

EVIDENCE:
<repository evidence>

CURRENT STATUS:
<whether it was actually changed>

RECOMMENDATION:
<recommended remediation>

Do NOT silently modify security-sensitive code simply because it is
considered best practice.

For example, if the repository uses:

subprocess(..., shell=True)

you may identify the security concern.

But do NOT automatically rewrite the application unless the evidence
supports that correction and the behavioral implications are
understood and tested.


# ============================================================
# 17. PERFORMANCE OF QA EXECUTION
# ============================================================

Avoid unnecessary expensive operations.

Do NOT unnecessarily perform:

- real network calls
- real Git pushes
- long sleeps
- repeated dependency installation
- repeated test execution
- duplicate builds
- unnecessary browser launches
- unnecessary container launches

Mock expensive external operations when appropriate.

If tests take unusually long, investigate why.

Report actual execution time when available.


# ============================================================
# 18. TEST FRAMEWORK SELECTION
# ============================================================

Choose the testing framework based on repository evidence.

Priority:

1. Existing repository test framework
2. Existing repository conventions
3. Native ecosystem tooling
4. Most appropriate mature framework

Do NOT replace an existing test framework simply because another
framework is more familiar.

Do NOT force Playwright.

Do NOT force pytest.

Do NOT force any particular framework.


# ============================================================
# 19. OUTPUT QUALITY
# ============================================================

The audit must be technically precise.

Every important claim should be traceable to repository evidence.

When possible, reference:

- file path
- function/class
- relevant code
- configuration
- test result

Do not make vague claims such as:

"The application may have issues."

Instead say:

"APPLICATION_DEFECT:
<precise defect>

FILE:
<actual path>

LOCATION:
<actual function/class/line if available>

EVIDENCE:
<actual repository evidence>"


# ============================================================
# 20. FINAL REPORT — EXACT ORDER
# ============================================================

Your final audit MUST contain exactly these sections in this order:

Corrected Solution

1. EXECUTIVE SUMMARY

2. TESTING STRATEGY

3. TEST SUITE

4. CI/CD PIPELINE CONFIGURATION

5. BEST PRACTICES & ROADMAP


Do NOT add:

- Playwright Verification Suite
- Verification Suite
- Additional Test Suite
- Appendix
- Extra CI section
- Duplicate test section

unless the user explicitly requests additional sections.

The report must end after:

5. BEST PRACTICES & ROADMAP


# ============================================================
# 21. FINAL SELF-CHECK BEFORE OUTPUT
# ============================================================

Before producing the final audit, perform this internal checklist.

REPOSITORY:
[ ] Did I inspect the actual repository?
[ ] Did I identify the actual technology?
[ ] Did I identify the actual application type?
[ ] Did I avoid assumptions?

CORRECTIONS:
[ ] Is every correction evidence-based?
[ ] Did I avoid unnecessary behavioral changes?
[ ] Did I distinguish defects from recommendations?

TESTS:
[ ] Does every test target real repository functionality?
[ ] Does the test suite use the correct framework?
[ ] Does it test the exact corrected artifact?
[ ] Did I avoid fictional files/functions/endpoints/UI elements?
[ ] Are dangerous external operations isolated?

EXECUTION:
[ ] Were tests actually executed?
[ ] If not, did I explicitly say NOT EXECUTED?
[ ] Are test results truthful?
[ ] Did I avoid claiming simulated results as real results?

CI/CD:
[ ] Does the CI match the repository?
[ ] Are dependencies actually installed?
[ ] Are paths valid?
[ ] Does CI execute the actual test suite?
[ ] Are there any placeholder commands?
[ ] Are there any fictional files?

REPORT:
[ ] Is the exact section order preserved?
[ ] Is section 3 exactly "TEST SUITE"?
[ ] Is there exactly one test-suite section?
[ ] Is there NO "Playwright Verification Suite" anywhere?
[ ] Is Snippet Diagnostics untouched?
[ ] Does the report contain no hallucinated information?


# ============================================================
# 22. ABSOLUTE FINAL RULE
# ============================================================

WHEN IN DOUBT, DO NOT INVENT.

When repository evidence is insufficient:

SAY SO.

When execution is unavailable:

SAY SO.

When a correction cannot be safely verified:

SAY SO.

When integration testing was not performed:

SAY SO.

When a security issue was identified but not corrected:

SAY SO.

When the repository does not use Playwright:

DO NOT USE PLAYWRIGHT.

When a file/function/endpoint does not exist:

DO NOT INVENT IT.

Your objective is NOT to produce an impressive-looking audit.

Your objective is to produce a CORRECT, REPRODUCIBLE, REPOSITORY-GROUNDED
QA AUDIT that another engineer can trust.
`;

/**
 * Dynamically resolves file extension and prefix for generated tests based on framework and detected languages.
 */
function getTestFileExtension(framework: string, languages: string[] = []): { extension: string, prefix: string } {
    const fw = (framework || '').toLowerCase();
    const langs = languages.map(l => l.toLowerCase());

    if (fw === 'pytest' || langs.includes('python')) {
        return { extension: 'py', prefix: 'test_' };
    }
    if (fw === 'go test' || langs.includes('go')) {
        return { extension: 'go', prefix: 'test_' };
    }
    if (fw === 'junit' || langs.includes('java')) {
        return { extension: 'java', prefix: 'Test_' };
    }
    if (fw === 'cargo test' || langs.includes('rust')) {
        return { extension: 'rs', prefix: 'test_' };
    }
    if (fw === 'jest') {
        return { extension: 'test.js', prefix: 'generated-' };
    }
    if (fw === 'vitest') {
        return { extension: 'test.ts', prefix: 'generated-' };
    }
    if (fw === 'cypress') {
        return { extension: 'cy.js', prefix: 'generated-' };
    }
    return { extension: 'spec.ts', prefix: 'generated-' };
}

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

    // Master prompt instructing Gemini with the 36-section Repository Engine specification.
    const prompt = `
${REPOSITORY_ENGINE_SYSTEM_PROMPT}

### REPOSITORY URL
${repoUrl}
${skillsPrompt}
${focusPrompt}

### REPOSITORY CONTEXT (SOURCE CODE & CONFIGURATION)
${filesContext}

### MANDATORY OUTPUT FORMAT
Your output MUST follow this exact structure and order:

Corrected Solution
[Provide corrected application code, tests, configuration, or high-impact performance fix supported by repository evidence.]

### 1. EXECUTIVE SUMMARY
[Repository purpose, application type, architecture, tech stack, testing framework selected, findings, and verification status.]

### 2. TESTING STRATEGY
[Selected testing framework rationale, features tested, positive/negative scenarios, edge cases, isolation, and risks.]

### 3. TEST SUITE
[Complete, executable, evidence-based test suite code block in the appropriate language and framework.]

### 4. CI/CD PIPELINE CONFIGURATION
[Complete, repository-appropriate CI/CD workflow YAML code block.]

### 5. BEST PRACTICES & ROADMAP
[Actionable recommendations for long-term test quality, reliability, and security.]
`;

    try {
        // Send prompt to Gemini with automatic retry logic.
        const result = await generateContentWithRetry(prompt);
        const response = await result.response;
        // Complete raw markdown report returned by Gemini.
        const fullReport = response.text();
        
        // Extract Framework Signature / Selected Framework using regex.
        const frameworkSection = fullReport.match(/###\s*(?:🧩\s*)?Framework Signature\n+([^\n#]+)/i)
            || fullReport.match(/(?:Selected Testing Framework|Testing Framework Selected):\s*([^\n]+)/i);
        const frameworkSignature = frameworkSection ? frameworkSection[1].trim() : (framework || 'Appropriate Framework');

        // Extract the test suite code block from Section 3. TEST SUITE (resilient regex matching markdown headers)
        const testSectionMatch = fullReport.match(/(?:###?|##?)\s*(?:🚀\s*)?3\.\s*(?:TEST SUITE|[^\n]*Test Suite)[\s\S]*?```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/i);
        const testCode = testSectionMatch && testSectionMatch[1] 
            ? testSectionMatch[1].trim() 
            : extractCodeBlock(fullReport.split(/(?:###?|##?)\s*(?:🚀\s*)?3\./i)[1] || fullReport);

        // Extract the CI/CD Pipeline YAML block from Section 4. CI/CD PIPELINE CONFIGURATION
        const cicdSectionMatch = fullReport.match(/(?:###?|##?)\s*(?:🔄\s*)?4\.\s*CI\/CD PIPELINE CONFIGURATION[\s\S]*?```(?:ya?ml)?\n([\s\S]*?)```/i)
            || fullReport.match(/(?:###?|##?)\s*(?:🔄\s*)?4\.\s*CI\/CD[\s\S]*?```(?:ya?ml)?\n([\s\S]*?)```/i);
        const cicdCode = cicdSectionMatch && cicdSectionMatch[1] ? cicdSectionMatch[1].trim() : '';

        // Ensure the generated tests output directory exists.
        const testDir = path.join(__dirname, '..', 'tests-generated');
        if (!fsSync.existsSync(testDir)) {
            await fs.mkdir(testDir, { recursive: true });
        }

        // Determine test file extension dynamically based on framework and detected languages.
        const { extension, prefix } = getTestFileExtension(framework, skillProfile?.languages);
        const fileName = `${prefix}${Date.now()}.${extension}`;
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
