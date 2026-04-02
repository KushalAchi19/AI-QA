import { test, expect, Page } from '@playwright/test';

test.describe('Dexter AI CLI (Hypothetical Web UI)', () => {

  // A helper function to simulate typing into the CLI's main input field.
  // In a hypothetical web rendering of the TUI, the focused element would receive keyboard input.
  async function typeCliInput(page: Page, text: string) {
    // Relying on page.keyboard.type as it types into the currently focused element.
    // The cli.ts code sets focus to the `editor` component.
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  }

  test.beforeEach(async ({ page }) => {
    // Navigate to the hypothetical web server rendering the TUI.
    // IMPORTANT: This assumes a web server is set up to expose the TUI at this URL.
    // The provided source code does not include such a web server implementation.
    await page.goto('http://localhost:3030');

    // Wait for the main intro text elements to confirm the application is loaded.
    await expect(page.locator('text="Welcome to Dexter"')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text="Your AI assistant for deep financial research."')).toBeVisible();
    await expect(page.locator(/Model: .* Type \/model to change\./)).toBeVisible();
  });

  test('should display initial welcome message and allow a basic query', async ({ page }) => {
    // Perform a basic query to ensure agent interaction.
    const query = 'Hello Dexter, tell me about yourself.';
    await typeCliInput(page, query);

    // Assert that the user's query appears in the chat log.
    await expect(page.locator(`text="❯ ${query}"`)).toBeVisible({ timeout: 5000 });

    // Assert that the 'Thinking...' indicator appears, indicating agent activity.
    await expect(page.locator('text="Thinking..."')).toBeVisible({ timeout: 10000 });

    // Assert that a tool call (e.g., from 'src/agent/agent.ts') is displayed.
    // The `ToolEventComponent` formats this as "⏺ ToolName(args)".
    await expect(page.locator(/⏺ .*\(.*\)/)).toBeVisible({ timeout: 20000 });

    // Assert that a final answer eventually appears, indicated by '⏺ ' prefix.
    await expect(page.locator(/⏺ [A-Za-z0-9]/)).toBeVisible({ timeout: 30000 });

    // Assert that the 'Thinking...' indicator disappears after completion.
    await expect(page.locator('text="Thinking..."')).not.toBeVisible({ timeout: 5000 });

    // Assert that performance statistics are displayed.
    await expect(page.locator(/✻ .* · .*/)).toBeVisible();
  });

  test('should navigate the model selection flow and switch model', async ({ page }) => {
    // Initiate the model selection flow.
    await typeCliInput(page, '/model');

    // Expect the 'Select provider' screen to be visible.
    await expect(page.locator('text="Select provider"')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text="Switch between LLM providers. Applies to this session and future sessions."')).toBeVisible();

    // Select 'OpenAI' provider (assuming it's the first option and pressing Enter selects it).
    await page.keyboard.press('Enter');

    // Expect the 'Select model for OpenAI' screen to be visible.
    await expect(page.locator('text="Select model for OpenAI"')).toBeVisible({ timeout: 5000 });

    // Select the first available model for OpenAI (pressing Enter again).
    await page.keyboard.press('Enter');

    // Expect the UI to return to the main chat and display the updated model.
    // The IntroComponent updates the model text.
    await expect(page.locator(/Model: openai:.* Type \/model to change\./)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text="Select provider"')).not.toBeVisible(); // Ensure selection overlay is gone
  });

  test('should handle tool approval flow by denying a sensitive operation', async ({ page }) => {
    // This query is designed to hypothetically trigger a tool requiring approval,
    // such as `write_file` or `edit_file` based on `AgentToolExecutor`.
    // In a real E2E test, the LLM would need to be mocked to reliably output this tool call.
    await typeCliInput(page, 'write to "report.md" the summary of Apple financials');

    // Expect the 'Permission required' prompt to appear.
    await expect(page.locator('text="Permission required"')).toBeVisible({ timeout: 10000 });
    // Verify the specific tool and path requiring approval.
    await expect(page.locator('text=/write_file ".+"$/')).toBeVisible();
    await expect(page.locator('text="Do you want to allow this?"')).toBeVisible();

    // Deny the approval by selecting '3. No' from the list.
    await page.keyboard.press('3');
    await page.keyboard.press('Enter');

    // Expect a 'Tool Denied' event message in the chat log.
    await expect(page.locator(/User denied write to .*/)).toBeVisible({ timeout: 10000 });

    // Expect the agent to stop processing (no 'Thinking...' indicator).
    await expect(page.locator('text="Thinking..."')).not.toBeVisible({ timeout: 5000 });

    // Expect the final 'done' event to contain an error or empty answer indicating denial.
    await expect(page.locator(/Error: .*/)).toBeVisible();
    await expect(page.locator(/✻ .* · .*/)).toBeVisible(); // Performance stats should still be there
  });

  test('should display detailed tool execution progress and results', async ({ page }) => {
    // Query that should trigger a tool and potentially progress updates (e.g., 'web_search').
    await typeCliInput(page, 'Search for recent news about Tesla stock');

    // Expect 'Thinking...' to appear.
    await expect(page.locator('text="Thinking..."')).toBeVisible({ timeout: 10000 });

    // Expect 'web_search' tool call to start, formatted by ToolEventComponent.
    await expect(page.locator(/⏺ Web Search\(query="Search for recent news about Tesla stock"\)/)).toBeVisible({ timeout: 15000 });

    // Expect tool progress messages to appear (e.g., 'Searching...').
    // The `ToolEventComponent` renders progress as "⎿ message".
    await expect(page.locator(/⎿  Searching\.\.\./)).toBeVisible({ timeout: 15000 });

    // Expect tool completion summary with duration.
    // The `summarizeToolResult` in `cli.ts` might yield "Did 1 search" for `web_search`.
    await expect(page.locator(/⎿  Did 1 search in \d+(ms|s)/)).toBeVisible({ timeout: 30000 });

    // Expect the final answer from the agent.
    await expect(page.locator(/⏺ [A-Za-z0-9]/)).toBeVisible({ timeout: 30000 });

    // Ensure the working indicator is gone.
    await expect(page.locator('text="Thinking..."')).not.toBeVisible({ timeout: 5000 });
  });

  test('should clear context when threshold is reached', async ({ page }) => {
    // This test would require multiple queries or specific LLM output to generate enough
    // tool results to exceed CONTEXT_THRESHOLD (defined in src/agent/agent.ts).
    // For a smoke test, we simulate triggering this event.
    // In a real E2E, this might involve an LLM returning many tool calls.
    await typeCliInput(page, 'run a very long research task that will generate many tool results'); // Hypothetical query

    // Wait for agent to process and potentially generate many tool results.
    // The ContextClearedEvent message is formatted as '⏺ Context threshold reached - cleared X old tool results, kept Y most recent'.
    await expect(page.locator(/⏺ Context threshold reached - cleared \d+ old tool results?, kept \d+ most recent/)).toBeVisible({ timeout: 60000 }); // Longer timeout as it's a multi-step process.

    // Expect agent to continue processing or eventually provide an answer.
    await expect(page.locator(/⏺ [A-Za-z0-9]/)).toBeVisible({ timeout: 60000 });
    await expect(page.locator('text="Thinking..."')).not.toBeVisible({ timeout: 5000 });
  });

});