// tests/e2e/dexter.spec.ts
import { test, expect, Page } from '@playwright/test';

// --- Playwright Helpers for TUI Interaction (Hypothetical, as explained) ---
// These functions abstract the interaction with the assumed web wrapper of the CLI.
async function typeIntoCli(page: Page, text: string) {
  // Target the hypothetical input field for CLI commands
  await page.locator('#cli-input').fill(text);
  await page.keyboard.press('Enter');
  // Wait a short moment for the TUI to process and render the new output
  await page.waitForTimeout(200);
}

async function expectCliOutput(page: Page, expectedText: string | RegExp) {
  // Target the hypothetical element containing all TUI output
  const terminalOutput = await page.locator('#terminal-output').textContent();
  expect(terminalOutput).toMatch(expectedText);
}

async function expectCliNotOutput(page: Page, unexpectedText: string | RegExp) {
  const terminalOutput = await page.locator('#terminal-output').textContent();
  expect(terminalOutput).not.toMatch(unexpectedText);
}

async function pressKey(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(100); // Small delay for TUI rendering updates
}

// Helper function adapted from src/components/tool-event.ts for readability
function formatToolNameForDisplay(name: string): string {
  const stripped = name.replace(/^(get)_/, '');
  return stripped
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

test.beforeEach(async ({ page }) => {
  // Navigate to the hypothetical web wrapper of the CLI application.
  // This URL (http://localhost:3030) would be served by a Node.js server
  // that runs the Dexter CLI in a child process and pipes I/O.
  await page.goto('http://localhost:3030');
  // Wait for initial rendering of the TUI intro screen
  await expectCliOutput(page, /Welcome to Dexter/);
});

test.describe('Dexter CLI E2E Tests', () => {

  test('should display the welcome message and default model on startup', async ({ page }) => {
    // Basic verification that the app loads and displays expected initial content.
    await expectCliOutput(page, /Welcome to Dexter v\d+\.\d+\.\d+/); // Check version number (regex for flexibility)
    await expectCliOutput(page, /Your AI assistant for deep financial research\./);
    await expectCliOutput(page, /Model: gpt-5.4\. Type \/model to change\./); // Verifies default model from src/agent/agent.ts
  });

  test('should handle a basic query and display a mocked AI response', async ({ page }) => {
    // Simulate a query and expect the agent to go through its phases (thinking, tool calls, answer).
    // This relies on the backend `Agent` being mocked to produce predictable output.
    const query = 'Tell me about the market today.';
    const mockThinking = 'Thinking about the market...';
    const mockToolStart = formatToolNameForDisplay('get_market_data') + '(query="market today")';
    const mockToolEndSummary = 'Received 5 items in 150ms';
    const mockAnswer = 'Today\'s market saw mixed results...';

    await typeIntoCli(page, query);

    // Assert that the user's query is displayed.
    await expectCliOutput(page, new RegExp(`❯ ${query}`));
    // Assert the 'thinking' message from the mocked agent.
    await expectCliOutput(page, mockThinking);
    // Assert the mocked tool call start and end events.
    await expectCliOutput(page, mockToolStart);
    await expectCliOutput(page, mockToolEndSummary);
    // Assert the final answer.
    await expectCliOutput(page, mockAnswer);
    // Assert the query status is 'complete' and performance stats are displayed.
    await expectCliOutput(page, /complete/);
    await expectCliOutput(page, /✻ \d+s \· \d+ tokens/);
  });

  test('should allow model selection and update the displayed model', async ({ page }) => {
    // Test the interactive model selection flow using keyboard navigation.
    const initialModelRegex = /Model: gpt-5.4\. Type \/model to change\./;
    await expectCliOutput(page, initialModelRegex);

    await typeIntoCli(page, '/model');

    // Expect the provider selection screen.
    await expectCliOutput(page, /Select provider/);
    await expectCliOutput(page, /1\. OpenAI/);
    await expectCliOutput(page, /2\. Anthropic/);

    // Simulate navigating to and selecting 'Anthropic' (assuming it's the second option).
    await pressKey(page, 'j'); // Move down (pi-tui SelectList supports 'j' for down)
    await pressKey(page, 'Enter');

    // Expect the model selection screen for Anthropic.
    await expectCliOutput(page, /Select model for Anthropic/);
    await expectCliOutput(page, /claude-/); // Verify Anthropic models are listed

    // Simulate selecting the first available Anthropic model.
    await pressKey(page, 'Enter');

    // Verify the main screen is back and the model has been updated.
    await expectCliOutput(page, /Model: claude-sonnet-4-20250514\. Type \/model to change\./); // Assuming this is the default Anthropic fast model
    await expectCliNotOutput(page, initialModelRegex); // Ensure old model text is gone
  });

  test('should handle tool approval for sensitive actions (e.g., write_file)', async ({ page }) => {
    // Test the tool approval flow, where a sensitive tool requires user permission.
    // The agent needs to be mocked to *attempt* a 'write_file' operation.
    const query = 'Please summarize today\'s news and save it to daily_digest.md';
    const toolName = 'write_file';
    const path = 'daily_digest.md';
    const mockThinking = 'Preparing to write the daily digest...';
    const mockApprovalPrompt = new RegExp(`Permission required\\n${formatToolNameForDisplay(toolName)} ${path}\\nDo you want to allow this?`);

    await typeIntoCli(page, query);

    await expectCliOutput(page, mockThinking);
    // Assert that the approval prompt is displayed.
    await expectCliOutput(page, mockApprovalPrompt);

    // Simulate the user selecting '1. Yes' (allow-once).
    await pressKey(page, '1'); // Or 'j', then 'Enter' for the first option
    await pressKey(page, 'Enter');

    // Verify that the tool execution proceeds and the approval decision is noted.
    await expectCliOutput(page, new RegExp(`⏺ ${formatToolNameForDisplay(toolName)}`)); // Tool start message
    await expectCliOutput(page, /Approved/); // Confirmation of approval
    await expectCliOutput(page, /File written successfully/); // Mocked tool end result
    await expectCliOutput(page, /complete/);
  });

  test('should allow canceling a running agent query using Escape key', async ({ page }) => {
    // Test that a user can interrupt an ongoing agent process.
    // The agent needs to be mocked to enter a prolonged 'thinking' state.
    const query = 'Perform an in-depth analysis of Q3 earnings reports for major tech companies.';
    const mockThinking = 'Analyzing earnings reports...';

    await typeIntoCli(page, query);

    await expectCliOutput(page, mockThinking);

    // Press Escape to cancel the operation.
    await pressKey(page, 'Escape');

    // Verify that an interruption message appears and the agent returns to an idle state.
    await expectCliOutput(page, /Interrupted · What should Dexter do instead\?/);
    await expectCliNotOutput(page, mockThinking); // Ensure thinking message is no longer present
  });

  test('should allow canceling a running agent query using Ctrl+C', async ({ page }) => {
    // Similar to the Escape key test, but using Ctrl+C.
    const query = 'Research the history of decentralized finance.';
    const mockThinking = 'Researching DeFi history...';

    await typeIntoCli(page, query);

    await expectCliOutput(page, mockThinking);

    // Press Ctrl+C to cancel the operation.
    await page.keyboard.press('Control+c');

    // Verify interruption message.
    await expectCliOutput(page, /Interrupted · What should Dexter do instead\?/);
    await expectCliNotOutput(page, mockThinking);
  });

  test('should navigate through input history with arrow keys', async ({ page }) => {
    // Test the input history feature.
    await typeIntoCli(page, 'First test query');
    await expectCliOutput(page, /First test query/);

    await typeIntoCli(page, 'Second test query');
    await expectCliOutput(page, /Second test query/);

    // Navigate up to the previous query.
    await pressKey(page, 'ArrowUp');
    await expect(page.locator('#cli-input')).toHaveValue('Second test query');

    await pressKey(page, 'ArrowUp');
    await expect(page.locator('#cli-input')).toHaveValue('First test query');

    // Navigate down to more recent queries.
    await pressKey(page, 'ArrowDown');
    await expect(page.locator('#cli-input')).toHaveValue('Second test query');

    await pressKey(page, 'ArrowDown');
    // After navigating past the most recent entry, the input should be empty.
    await expect(page.locator('#cli-input')).toHaveValue('');
  });

  test('should exit the application with "exit" command', async ({ page }) => {
    // Test the application exit command.
    await typeIntoCli(page, 'exit');
    // In a real CLI, this would terminate the process. For the hypothetical web wrapper,
    // we would expect some indication that the CLI session has ended, or the page itself
    // might navigate away/display a "disconnected" state.
    // For now, we assert that the command itself was processed and potentially a confirmation.
    await expectCliOutput(page, /exit/i); // Confirm the command was sent.
    // Add more specific assertions here if the hypothetical wrapper has a defined exit UI.
    // E.g., expect(page.locator('#terminal-output')).toHaveText(/Session ended/);
  });
});