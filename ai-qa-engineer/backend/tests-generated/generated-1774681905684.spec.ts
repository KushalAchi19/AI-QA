import { test, expect } from '@playwright/test';

test.describe('Notes App Smoke Test', () => {
  const BASE_URL = 'http://localhost:3000'; // Placeholder URL for the application

  test.beforeEach(async ({ page }) => {
    // Navigate to the application before each test
    await page.goto(BASE_URL);
  });

  test('should load application, display main UI elements, allow adding and deleting a note', async ({ page }) => {
    // 1. Check for the presence of main UI elements (landing page, headings)
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Notes App');
    await expect(page.locator('h2').first()).toHaveText('Add a New Note');
    await expect(page.locator('h2').nth(1)).toHaveText('Your Notes');

    const titleInput = page.getByPlaceholder('Title');
    const contentTextarea = page.getByPlaceholder('Take a note...');
    const addNoteButton = page.getByRole('button', { name: 'Add Note' });

    await expect(titleInput).toBeVisible();
    await expect(contentTextarea).toBeVisible();
    await expect(addNoteButton).toBeVisible();

    // 2. Includes basic interactions: Add a note
    const noteTitle = 'My Smoke Test Note';
    const noteContent = 'This is the content for my smoke test note.';

    await titleInput.fill(noteTitle);
    await contentTextarea.fill(noteContent);
    await addNoteButton.click();

    // Verify the note was added and displayed
    const newNoteCard = page.locator(`.note-card:has-text("${noteTitle}")`);
    await expect(newNoteCard).toBeVisible();
    await expect(newNoteCard.locator('h3')).toHaveText(noteTitle);
    await expect(newNoteCard.locator('p')).toHaveText(noteContent);

    // 3. Includes basic interactions: Delete the added note
    const deleteButton = newNoteCard.getByRole('button', { name: 'Delete' });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Verify the note was deleted
    await expect(newNoteCard).not.toBeVisible();
  });

  test('should display "No notes yet!" message when no notes are present', async ({ page }) => {
    // Ensure local storage is clear for a clean state before this test
    await page.evaluate(() => localStorage.clear());
    // Re-navigate to apply the cleared local storage state
    await page.goto(BASE_URL);

    // Check for the "No notes yet!" message
    const noNotesMessage = page.locator('.notes-container').getByText('No notes yet!');
    await expect(noNotesMessage).toBeVisible();
    await expect(noNotesMessage).toHaveText('No notes yet!');

    // Ensure form elements are still present
    await expect(page.getByPlaceholder('Title')).toBeVisible();
    await expect(page.getByPlaceholder('Take a note...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Note' })).toBeVisible();
  });
});