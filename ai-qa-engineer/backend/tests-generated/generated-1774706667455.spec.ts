import { test, expect } from '@playwright/test';

test.describe('Notes Application E2E Tests', () => {
    // Base URL for the application. Ensure your server is running on this port.
    const BASE_URL = 'http://localhost:3000';

    // --- Selectors (assuming common HTML structure for a vanilla JS app) ---
    // Note: It's best practice to use data-testid attributes for robust selectors,
    // but for this vanilla app, we'll use common IDs and classes.
    const noteInputSelector = '#note-input'; // Assuming <textarea id="note-input">
    const addNoteButtonSelector = '#add-note-btn'; // Assuming <button id="add-note-btn">
    const notesContainerSelector = '#notes-container'; // Assuming <div id="notes-container">
    const noteItemSelector = '.note-item'; // Assuming individual notes are <div class="note-item">
    const noteTextSelector = '.note-text'; // Assuming note text is within <span class="note-text"> inside .note-item
    const deleteNoteButtonSelector = '.delete-note-btn'; // Assuming delete button is <button class="delete-note-btn"> inside .note-item

    // Before each test, navigate to the app and clear localStorage to ensure a clean state.
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL);
        // Clear local storage to ensure test isolation and a predictable initial state
        await page.evaluate(() => localStorage.clear());
        // Reload the page after clearing localStorage to reflect the empty state
        await page.reload();
        // Wait for potential dynamic content to load, though for vanilla JS, it might be immediate.
        await page.waitForLoadState('domcontentloaded');
    });

    // Test Case 1: Verify the application loads correctly and displays essential UI elements.
    test('should display main elements and an empty notes list on initial load', async ({ page }) => {
        // Assert the page title (case-insensitive match)
        await expect(page).toHaveTitle(/Notes App/i);
        // Assert the main heading is visible and has expected text
        await expect(page.locator('h1')).toHaveText('My Notes App'); // Assuming an H1 with this text
        // Assert the note input field is visible
        await expect(page.locator(noteInputSelector)).toBeVisible();
        // Assert the 'Add Note' button is visible
        await expect(page.locator(addNoteButtonSelector)).toBeVisible();
        // Assert the container for notes is visible
        await expect(page.locator(notesContainerSelector)).toBeVisible();
        // Assert that initially, there are no note items displayed
        await expect(page.locator(noteItemSelector)).toHaveCount(0);
    });

    // Test Case 2: Verify the ability to add a new note.
    test('should allow adding a new note successfully', async ({ page }) => {
        const noteText = 'This is my first important note to remember.';
        // Fill the note input field
        await page.fill(noteInputSelector, noteText);
        // Click the 'Add Note' button
        await page.click(addNoteButtonSelector);

        // Assert that a new note item is visible containing the entered text
        const newNoteItem = page.locator(noteItemSelector).filter({ hasText: noteText });
        await expect(newNoteItem).toBeVisible();
        await expect(newNoteItem.locator(noteTextSelector)).toHaveText(noteText);

        // Assert that the note input field is cleared after adding the note
        await expect(page.locator(noteInputSelector)).toBeEmpty();
        // Assert that there is exactly one note item in the list
        await expect(page.locator(noteItemSelector)).toHaveCount(1);
    });

    // Test Case 3: Verify the ability to add multiple notes.
    test('should allow adding multiple notes and display them all', async ({ page }) => {
        const note1Text = 'Playwright is an awesome E2E testing tool.';
        const note2Text = 'Remember to buy groceries: milk, eggs, bread.';

        // Add the first note
        await page.fill(noteInputSelector, note1Text);
        await page.click(addNoteButtonSelector);
        await expect(page.locator(noteItemSelector).filter({ hasText: note1Text })).toBeVisible();
        await expect(page.locator(noteItemSelector)).toHaveCount(1);

        // Add the second note
        await page.fill(noteInputSelector, note2Text);
        await page.click(addNoteButtonSelector);
        await expect(page.locator(noteItemSelector).filter({ hasText: note2Text })).toBeVisible();
        await expect(page.locator(noteItemSelector)).toHaveCount(2); // Expect two notes now
    });

    // Test Case 4: Verify the ability to delete an existing note.
    test('should allow deleting an existing note from the list', async ({ page }) => {
        const noteToDeleteText = 'This note is temporary and will be deleted.';
        const noteToKeepText = 'This note should remain after deletion.';

        // Add two notes to set up the scenario
        await page.fill(noteInputSelector, noteToDeleteText);
        await page.click(addNoteButtonSelector);
        await page.fill(noteInputSelector, noteToKeepText);
        await page.click(addNoteButtonSelector);
        await expect(page.locator(noteItemSelector)).toHaveCount(2); // Verify two notes are present

        // Find the specific note to delete
        const noteToDelete = page.locator(noteItemSelector).filter({ hasText: noteToDeleteText });
        await expect(noteToDelete).toBeVisible();

        // Click the delete button associated with that note
        await noteToDelete.locator(deleteNoteButtonSelector).click();

        // Assert that the deleted note is no longer visible
        await expect(noteToDelete).not.toBeVisible();
        // Assert that only one note (the one to keep) remains in the list
        await expect(page.locator(noteItemSelector)).toHaveCount(1);
        await expect(page.locator(noteItemSelector).filter({ hasText: noteToKeepText })).toBeVisible();
    });

    // Test Case 5: Verify that notes persist after a page reload.
    test('should persist notes after a page reload', async ({ page }) => {
        const persistedNoteText = 'This note should survive a browser refresh.';
        // Add a note
        await page.fill(noteInputSelector, persistedNoteText);
        await page.click(addNoteButtonSelector);
        await expect(page.locator(noteItemSelector).filter({ hasText: persistedNoteText })).toBeVisible();

        // Reload the page
        await page.reload();
        await page.waitForLoadState('domcontentloaded'); // Ensure page content is loaded

        // Assert that the previously added note is still present
        await expect(page.locator(noteItemSelector).filter({ hasText: persistedNoteText })).toBeVisible();
        await expect(page.locator(noteItemSelector)).toHaveCount(1);
    });

    // Test Case 6: Verify that note deletions persist after a page reload.
    test('should persist note deletions after a page reload', async ({ page }) => {
        const noteToBeDeletedAndStayDeleted = 'Deleted note should not reappear.';
        const noteToAlwaysRemain = 'This note must always be there.';

        // Add two notes
        await page.fill(noteInputSelector, noteToBeDeletedAndStayDeleted);
        await page.click(addNoteButtonSelector);
        await page.fill(noteInputSelector, noteToAlwaysRemain);
        await page.click(addNoteButtonSelector);
        await expect(page.locator(noteItemSelector)).toHaveCount(2);

        // Delete the first note
        const noteToDelete = page.locator(noteItemSelector).filter({ hasText: noteToBeDeletedAndStayDeleted });
        await noteToDelete.locator(deleteNoteButtonSelector).click();
        await expect(noteToDelete).not.toBeVisible();
        await expect(page.locator(noteItemSelector)).toHaveCount(1);

        // Reload the page
        await page.reload();
        await page.waitForLoadState('domcontentloaded');

        // Assert the deleted note is still not present
        await expect(page.locator(noteItemSelector).filter({ hasText: noteToBeDeletedAndStayDeleted })).not.toBeVisible();
        // Assert the remaining note is still present
        await expect(page.locator(noteItemSelector).filter({ hasText: noteToAlwaysRemain })).toBeVisible();
        await expect(page.locator(noteItemSelector)).toHaveCount(1);
    });

    // Test Case 7: Verify handling of empty note input.
    // Assuming the application should not add an empty note or should prevent it.
    test('should not add an empty note if the input field is empty', async ({ page }) => {
        // Attempt to add an empty note
        await page.fill(noteInputSelector, ''); // Input an empty string
        await page.click(addNoteButtonSelector);

        // Assert that no new note item was added to the list
        // (This expects the app to prevent adding empty notes, which is a good UX practice)
        await expect(page.locator(noteItemSelector)).toHaveCount(0);
        // The input field should still be empty or cleared, depending on implementation.
        // If it clears after attempt, expect empty. If it prevents and leaves input as is, expect empty.
        await expect(page.locator(noteInputSelector)).toBeEmpty();
    });

    // Optional: Clean up localStorage after all tests if not handled by beforeEach alone
    test.afterAll(async ({ page }) => {
        // This ensures a clean slate even if tests fail midway,
        // although beforeEach with reload is generally sufficient for isolation.
        await page.evaluate(() => localStorage.clear());
    });
});