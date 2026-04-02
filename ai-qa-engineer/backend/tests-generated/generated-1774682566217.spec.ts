import { test, expect } from '@playwright/test';

// Base URL for the application. Ensure your notes app is running, e.g., using `npx http-server . -p 3000`
const BASE_URL = 'http://localhost:3000';

test.describe('Notes App E2E Tests', () => {

    // Before each test, navigate to the base URL and clear local storage
    // This ensures a clean slate for every test, preventing data from previous tests
    // or sessions from affecting the current test run.
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL);
        await page.evaluate(() => localStorage.clear());
        await page.reload(); // Reload to apply the localStorage.clear() effect
    });

    test('should load the application correctly with expected elements', async ({ page }) => {
        // Assert that the page title contains "Notes App"
        await expect(page).toHaveTitle(/Notes App/i);
        // Assert that the main heading "Notes App" is visible
        await expect(page.locator('h1')).toHaveText('Notes App');
        // Assert that the note input textarea (assuming ID 'note-input') is visible
        await expect(page.locator('#note-input')).toBeVisible();
        // Assert that the 'Add Note' button (assuming ID 'add-note-btn') is visible
        await expect(page.locator('#add-note-btn')).toBeVisible();
        // Assert that the container for notes (assuming ID 'notes-container') is visible
        await expect(page.locator('#notes-container')).toBeVisible();
    });

    test('should allow adding a new note', async ({ page }) => {
        const noteText = 'My first test note for Playwright.';
        // Fill the note input field with text
        await page.locator('#note-input').fill(noteText);
        // Click the 'Add Note' button
        await page.locator('#add-note-btn').click();

        // Locate the newly added note within the notes container.
        // We assume each note is a 'div' with class 'note-item' and contains the text and a 'Delete' button.
        const noteItem = page.locator('#notes-container div.note-item', { hasText: noteText });
        // Assert that the note item is visible
        await expect(noteItem).toBeVisible();
        // Assert that the note item contains the note text and the 'Delete' button text
        // (assuming "Delete" button text is within the note item)
        await expect(noteItem).toHaveText(noteText + 'Delete');
        // Assert that the input field is cleared after adding the note
        await expect(page.locator('#note-input')).toHaveValue('');
    });

    test('should display multiple notes correctly', async ({ page }) => {
        const note1Text = 'First note to be displayed.';
        const note2Text = 'Second note to be displayed.';

        // Add the first note
        await page.locator('#note-input').fill(note1Text);
        await page.locator('#add-note-btn').click();
        // Add the second note
        await page.locator('#note-input').fill(note2Text);
        await page.locator('#add-note-btn').click();

        // Select all note items within the container
        const notes = page.locator('#notes-container div.note-item');
        // Assert that exactly two notes are present
        await expect(notes).toHaveCount(2);
        // Assert that the first note contains the expected text
        await expect(notes.nth(0)).toHaveText(note1Text + 'Delete');
        // Assert that the second note contains the expected text
        await expect(notes.nth(1)).toHaveText(note2Text + 'Delete');
    });

    test('should allow deleting a note', async ({ page }) => {
        const noteText = 'Note to be deleted by test.';
        // Add a note first
        await page.locator('#note-input').fill(noteText);
        await page.locator('#add-note-btn').click();

        // Locate the specific note item we just added
        const noteItem = page.locator('#notes-container div.note-item', { hasText: noteText });
        await expect(noteItem).toBeVisible();

        // Locate the 'Delete' button within that specific note item and click it
        // Assuming the delete button is a <button> tag with text 'Delete' inside the note item
        await noteItem.locator('button', { hasText: 'Delete' }).click();

        // Assert that the note item is no longer visible (it has been removed)
        await expect(noteItem).not.toBeVisible();
        // Assert that the notes container now has zero note items
        await expect(page.locator('#notes-container div.note-item')).toHaveCount(0);
    });

    test('should not add an empty note when trying to add', async ({ page }) => {
        // Ensure the input field is empty
        await page.locator('#note-input').fill('');
        // Click the 'Add Note' button with an empty input
        await page.locator('#add-note-btn').click();

        // Assert that no new note items appear in the container
        await expect(page.locator('#notes-container div.note-item')).toHaveCount(0);
        // Assert that the input field remains empty (or unchanged, depending on implementation)
        await expect(page.locator('#note-input')).toHaveValue('');
        // Optional: If there's an error message for empty notes, assert its visibility
        // await expect(page.locator('.error-message')).toHaveText('Note cannot be empty!');
    });
});